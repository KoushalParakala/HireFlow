from __future__ import annotations

import json
from typing import Any
from functools import lru_cache

import numpy as np
from sentence_transformers import SentenceTransformer
from groq import Groq

from core.config import settings


# Load the model once and cache it — it stays in memory for the server lifetime.
# all-MiniLM-L6-v2 is a lightweight 22MB open-source model that runs on CPU.
@lru_cache(maxsize=1)
def _get_model() -> SentenceTransformer:
    return SentenceTransformer("all-MiniLM-L6-v2")


def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Pure cosine similarity between two embedding vectors, returned as 0-100."""
    dot = float(np.dot(a, b))
    norm = float(np.linalg.norm(a) * np.linalg.norm(b))
    if norm == 0:
        return 0.0
    return max(0.0, round((dot / norm) * 100, 2))


def _build_jd_text(criteria: dict[str, Any]) -> dict[str, str]:
    """Convert structured JD criteria into targeted text strings for each scoring dimension."""
    req_skills = criteria.get("required_skills") or []
    pref_skills = criteria.get("preferred_skills") or []
    implicit = criteria.get("implicit_requirements") or []
    
    return {
        "technical": " ".join(req_skills + pref_skills),
        "seniority": f"{criteria.get('role_level', '')} level role requiring {criteria.get('experience_range', '')} of experience",
        "domain": " ".join(implicit),
        "overall": json.dumps(criteria),
    }


def _build_candidate_text(candidate: dict[str, Any]) -> dict[str, str]:
    """Convert candidate profile into targeted text strings for each scoring dimension."""
    skills = " ".join(candidate.get("skills") or [])
    title = candidate.get("title") or ""
    company = candidate.get("company") or ""
    exp = candidate.get("experience") or ""
    
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
    Use Groq (Llama 3.1) only for the qualitative parts:
    - A one-sentence recruiter recommendation
    - Red flag detection (job hopping, title inflation, etc.)
    Falls back to generic text if GROQ_API_KEY is not set.
    """
    api_key = settings.GROQ_API_KEY
    if not api_key:
        return (
            f"Candidate scores {scores['overall']:.0f}/100. Add GROQ_API_KEY for detailed recommendation.",
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


def score_candidate(
    candidate_data: dict[str, Any],
    job_criteria: dict[str, Any],
) -> dict[str, Any]:
    """
    Semantic scoring pipeline:
    1. sentence-transformers (all-MiniLM-L6-v2, CPU) → cosine similarity scores
    2. Groq (Llama 3.1, free) → recommendation text + red flag detection

    This split satisfies the assignment requirement:
    - Numbers come from real vector embeddings (not LLM prompts)
    - LLM is only used for human-readable text output
    """
    model = _get_model()

    jd_texts = _build_jd_text(job_criteria)
    cand_texts = _build_candidate_text(candidate_data)

    # Batch encode all text pairs at once for efficiency
    keys = ["technical", "seniority", "domain", "overall"]
    jd_vecs = np.asarray(model.encode([jd_texts[k] for k in keys]))
    cand_vecs = np.asarray(model.encode([cand_texts[k] for k in keys]))

    scores = {
        "technical_skills": _cosine_similarity(jd_vecs[0], cand_vecs[0]),
        "seniority": _cosine_similarity(jd_vecs[1], cand_vecs[1]),
        "domain_experience": _cosine_similarity(jd_vecs[2], cand_vecs[2]),
        "overall": _cosine_similarity(jd_vecs[3], cand_vecs[3]),
    }

    recommendation, red_flags = _get_recommendation_and_flags(candidate_data, job_criteria, scores)

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
