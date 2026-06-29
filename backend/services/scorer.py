from __future__ import annotations

import json
from typing import Any
import concurrent.futures
from groq import Groq

from core.config import settings

def _get_groq_client() -> Groq | None:
    api_key = settings.GROQ_API_KEY
    if not api_key:
        return None
    return Groq(api_key=api_key)

def score_candidate(
    candidate_data: dict[str, Any],
    job_criteria: dict[str, Any],
) -> dict[str, Any]:
    """
    Semantic scoring pipeline using Groq (Llama 3.1 8b).
    This replaces sentence-transformers/torch to keep memory footprint under 512MB
    for free-tier deployments, while actually improving match quality.
    """
    client = _get_groq_client()
    if not client:
        # Fallback if no GROQ_API_KEY is present
        return {
            "overall_score": 50.0,
            "breakdown": {
                "technical_skills": 50.0,
                "seniority": 50.0,
                "domain_experience": 50.0,
            },
            "red_flags": [],
            "recommendation": "Candidate added. Add GROQ_API_KEY for scoring and detailed recommendation.",
        }

    prompt = f"""You are an expert technical recruiter. Analyze this candidate against the job criteria and score them.
Job Criteria:
{json.dumps(job_criteria, indent=2)}

Candidate Profile:
{json.dumps(candidate_data, indent=2)}

Provide:
1. An overall score (0-100) based on suitability.
2. A breakdown of scores (0-100) for: technical_skills, seniority, and domain_experience.
3. A one-sentence professional recommendation.
4. Any red flags (e.g. job hopping = 3+ companies in 2 years, title inflation, skills mismatch).

Return ONLY a valid JSON object matching this exact schema:
{{
  "overall_score": 85.0,
  "breakdown": {{
    "technical_skills": 90.0,
    "seniority": 80.0,
    "domain_experience": 85.0
  }},
  "recommendation": "A strong senior developer with extensive React experience, highly suitable for this role.",
  "red_flags": [
    {{
      "flag_type": "Job Hopping",
      "description": "Candidate has held 3 positions in the last 18 months."
    }}
  ]
}}"""

    try:
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            response_format={"type": "json_object"},
        )
        content = response.choices[0].message.content
        if not content:
            raise ValueError("Empty response from Groq")
        
        result = json.loads(content)
        return {
            "overall_score": float(result.get("overall_score", 50.0)),
            "breakdown": {
                "technical_skills": float(result.get("breakdown", {}).get("technical_skills", 50.0)),
                "seniority": float(result.get("breakdown", {}).get("seniority", 50.0)),
                "domain_experience": float(result.get("breakdown", {}).get("domain_experience", 50.0)),
            },
            "red_flags": result.get("red_flags", []),
            "recommendation": result.get("recommendation", ""),
        }
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Groq scoring failed: {e}")
        return {
            "overall_score": 50.0,
            "breakdown": {
                "technical_skills": 50.0,
                "seniority": 50.0,
                "domain_experience": 50.0,
            },
            "red_flags": [],
            "recommendation": "Error generating recommendation via API.",
        }

def score_candidates_batch(
    candidates_data: list[dict[str, Any]],
    job_criteria: dict[str, Any],
) -> list[dict[str, Any]]:
    """
    Scores multiple candidates concurrently using Groq API.
    """
    results: list[dict[str, Any]] = [{} for _ in range(len(candidates_data))]
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        futures = {
            pool.submit(score_candidate, cand, job_criteria): idx 
            for idx, cand in enumerate(candidates_data)
        }
        for future in concurrent.futures.as_completed(futures):
            idx = futures[future]
            try:
                results[idx] = future.result()
            except Exception:
                results[idx] = {
                    "overall_score": 50.0,
                    "breakdown": {
                        "technical_skills": 50.0,
                        "seniority": 50.0,
                        "domain_experience": 50.0,
                    },
                    "red_flags": [],
                    "recommendation": "Error processing candidate scoring.",
                }
                
    return results

def generate_comparison_ranking(profiles: list[dict[str, Any]]) -> dict[str, str]:
    """Generate a plain-English ranking and justification for compared candidates."""
    if not profiles:
        return {"ranking_justification": "No candidates to compare."}

    client = _get_groq_client()
    if not client:
        return {"ranking_justification": "GROQ_API_KEY not set. Cannot generate comparison ranking."}

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
