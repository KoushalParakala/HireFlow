from __future__ import annotations

# Fix: prevent sentence-transformers from importing TensorFlow on Railway CPU
import os
os.environ["TRANSFORMERS_NO_TF"] = "1"
os.environ["USE_TF"] = "0"
os.environ["TOKENIZERS_PARALLELISM"] = "false"

import json
from typing import Any
from functools import lru_cache

import numpy as np
from sentence_transformers import SentenceTransformer
from groq import Groq

from core.config import settings


@lru_cache(maxsize=1)
def _get_model() -> SentenceTransformer:
    """Load all-MiniLM-L6-v2 once — stays in memory for the server lifetime."""
    return SentenceTransformer("all-MiniLM-L6-v2")


def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine similarity between two embedding vectors, returned as 0–100."""
    dot = float(np.dot(a, b))
    norm = float(np.linalg.norm(a) * np.linalg.norm(b))
    if norm == 0:
        return 0.0
    return max(0.0, round((dot / norm) * 100, 2))


def _build_jd_text(criteria: dict[str, Any]) -> dict[str, str]:
    req_skills = criteria.get("required_skills") or []
    pref_skills = criteria.get("preferred_skills") or []
    implicit = criteria.get("implicit_requirements") or []

    return {
        "technical": " ".join(req_skills + pref_skills),
        "seniority": (
            f"{criteria.get('role_level', '')} level role requiring "
            f"{criteria.get('experience_range', '')} of experience"
        ),
        "domain": " ".join(implicit),
        "overall": json.dumps(criteria),
    }


def _build_candidate_text(candidate: dict[str, Any]) -> dict[str, str]:
    skills = " ".join(candidate.get("skills") or [])
    title = candidate.get("current_title") or candidate.get("title") or ""
    company = candidate.get("current_company") or candidate.get("company") or ""
    exp = candidate.get("experience_summary") or candidate.get("experience") or ""

    return {
        "technical": f"{skills} {title}",
        "seniority": f"{title} at {company} {exp}",
        "domain": exp,
        "overall": json.dumps(candidate),
    }


def _get_recommendation_and_flags(
    candidate: dict[str, Any],
    criteria: dict[str, Any],
    scores: dict[str, float],
) -> tuple[str, list[dict[str, str]]]:
    """
    Use Groq (Llama 3.1) only for qualitative output:
    - one-sentence recruiter recommendation
    - red flag detection (job hopping, title inflation, skills mismatch)
    Falls back to a generic message if GROQ_API_KEY is not set.
    """
    api_key = settings.GROQ_API_KEY
    if not api_key:
        return (
            f"Candidate scores {scores.get('overall', 0):.0f}/100. Add GROQ_API_KEY for detailed recommendation.",
            [],
        )

    client = Groq(api_key=api_key)
    prompt = f"""You are a recruiter. Given this candidate's scores and profile, provide:
1. A one-sentence plain-English recommendation
2. Any red flags (job hopping = 3+ companies in 2 years, title inflation, skills mismatch)

Scores: {json.dumps(scores)}
Candidate: {json.dumps(candidate)}
Job Criteria: {json.dumps(criteria)}

Return ONLY valid JSON:
{{"recommendation": "...", "red_flags": [{{"flag_type": "...", "description": "..."}}]}}"""

    try:
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            response_format={"type": "json_object"},
        )
        content = response.choices[0].message.content
        if not content:
            return "", []
        result = json.loads(content)
        return result.get("recommendation", ""), result.get("red_flags", [])
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Groq recommendation failed: {e}")
        return f"Score: {scores.get('overall', 0):.0f}/100", []


def score_candidate(
    candidate_data: dict[str, Any],
    job_criteria: dict[str, Any],
) -> dict[str, Any]:
    """
    Semantic scoring pipeline:
    1. sentence-transformers all-MiniLM-L6-v2 (CPU) → cosine similarity scores
    2. Groq Llama 3.1 → recommendation text + red flag detection

    Numbers come from real vector embeddings — LLM only generates human-readable text.
    """
    model = _get_model()

    jd_texts = _build_jd_text(job_criteria)
    cand_texts = _build_candidate_text(candidate_data)

    keys = ["technical", "seniority", "domain", "overall"]
    jd_vecs = np.asarray(model.encode([jd_texts[k] for k in keys]))
    cand_vecs = np.asarray(model.encode([cand_texts[k] for k in keys]))

    scores = {
        "technical_skills": _cosine_similarity(jd_vecs[0], cand_vecs[0]),
        "seniority": _cosine_similarity(jd_vecs[1], cand_vecs[1]),
        "domain_experience": _cosine_similarity(jd_vecs[2], cand_vecs[2]),
        "overall": _cosine_similarity(jd_vecs[3], cand_vecs[3]),
    }

    recommendation, red_flags = _get_recommendation_and_flags(
        candidate_data, job_criteria, scores
    )

    return {
        "overall_score": scores["overall"],
        "breakdown": {
            "technical_skills": scores["technical_skills"],
            "seniority": scores["seniority"],
            "domain_experience": scores["domain_experience"],
        },
        "red_flags": red_flags,
        "recommendation": recommendation,
    }


def score_candidates_batch(
    candidates_data: list[dict[str, Any]],
    job_criteria: dict[str, Any],
) -> list[dict[str, Any]]:
    """
    Scores many candidates against one job in a single pass. This exists
    because the original per-candidate score_candidate() recomputed the JD
    embedding from scratch for every single candidate, and called Groq
    sequentially — for 50 candidates that's 50 sequential network round
    trips (roughly a minute or more). Here:
      1. The JD is embedded exactly once.
      2. All candidates' texts are embedded in ONE batched encode() call
         (sentence-transformers is much faster batched than called N times).
      3. The Groq qualitative calls (the only genuinely slow, I/O-bound part)
         run concurrently across a small thread pool instead of one by one.
    Returns results in the same order as candidates_data.
    """
    import concurrent.futures

    model = _get_model()
    keys = ["technical", "seniority", "domain", "overall"]

    jd_texts = _build_jd_text(job_criteria)
    jd_vecs = np.asarray(model.encode([jd_texts[k] for k in keys]))

    cand_texts_list = [_build_candidate_text(c) for c in candidates_data]
    flat_texts = [t[k] for t in cand_texts_list for k in keys]
    flat_vecs = np.asarray(model.encode(flat_texts))  # one batched call for everyone

    all_scores: list[dict[str, float]] = []
    for i in range(len(candidates_data)):
        cand_vecs = flat_vecs[i * len(keys):(i + 1) * len(keys)]
        all_scores.append({
            "technical_skills": _cosine_similarity(jd_vecs[0], cand_vecs[0]),
            "seniority": _cosine_similarity(jd_vecs[1], cand_vecs[1]),
            "domain_experience": _cosine_similarity(jd_vecs[2], cand_vecs[2]),
            "overall": _cosine_similarity(jd_vecs[3], cand_vecs[3]),
        })

    # Groq calls are network-bound — fan them out instead of awaiting each
    # one in turn. Keep the pool small (4) to stay polite to Groq's free-tier
    # rate limit rather than firing 50 requests at once.
    def _qualitative(idx: int) -> tuple[str, list[dict[str, str]]]:
        return _get_recommendation_and_flags(candidates_data[idx], job_criteria, all_scores[idx])

    qualitative_results: list[tuple[str, list[dict[str, str]]]] = [("", [])] * len(candidates_data)
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(_qualitative, i): i for i in range(len(candidates_data))}
        for future in concurrent.futures.as_completed(futures):
            idx = futures[future]
            try:
                qualitative_results[idx] = future.result()
            except Exception:
                qualitative_results[idx] = (f"Score: {all_scores[idx].get('overall', 0):.0f}/100", [])

    results = []
    for i, scores in enumerate(all_scores):
        recommendation, red_flags = qualitative_results[i]
        results.append({
            "overall_score": scores["overall"],
            "breakdown": {
                "technical_skills": scores["technical_skills"],
                "seniority": scores["seniority"],
                "domain_experience": scores["domain_experience"],
            },
            "red_flags": red_flags,
            "recommendation": recommendation,
        })
    return results


def generate_comparison_ranking(profiles: list[dict[str, Any]]) -> dict[str, str]:
    """Generate a plain-English ranking and justification for compared candidates."""
    if not profiles:
        return {"ranking_justification": "No candidates to compare."}

    api_key = settings.GROQ_API_KEY
    if not api_key:
        return {"ranking_justification": "GROQ_API_KEY not set. Cannot generate comparison ranking."}

    client = Groq(api_key=api_key)
    prompt = f"""You are a technical recruiter. Compare the following candidates and provide a recommended ranking from best to worst, along with a plain-English justification.

Candidates:
{json.dumps(profiles)}

Return ONLY valid JSON matching this schema:
{{"ranking_justification": "Your plain English justification and ranking..."}}"""

    try:
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            response_format={"type": "json_object"},
        )
        content = response.choices[0].message.content
        if not content:
            return {"ranking_justification": "Error generating justification."}
        return json.loads(content)
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Groq comparison ranking failed: {e}")
        return {"ranking_justification": "Error generating justification."}
