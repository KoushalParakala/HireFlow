from __future__ import annotations

import json
from typing import Any

from groq import Groq

from core.config import settings


SYSTEM_PROMPT = """You are an expert HR analyst. Analyze the provided job description and extract
structured information. Return ONLY a valid JSON object with exactly these keys:

{
  "required_skills": ["list of required skills with seniority context, e.g. Senior Python"],
  "preferred_skills": ["list of nice-to-have skills"],
  "experience_range": "e.g. 3-5 years",
  "role_level": "one of: junior, mid, senior, lead",
  "implicit_requirements": ["hidden culture/work-style signals buried in the JD"]
}

Return only raw JSON. No markdown. No explanation."""


def analyze_job_description(jd_text: str) -> dict[str, Any]:
    """
    Parse a job description into structured criteria using Groq (Llama 3.1 8B).

    Groq is free. Llama 3.1 is fully open-source and runs on CPU.
    Falls back to a mock dict when GROQ_API_KEY is not set.
    """
    api_key = settings.GROQ_API_KEY
    if not api_key:
        # Mock for local testing without an API key
        return {
            "required_skills": ["Python", "FastAPI", "PostgreSQL"],
            "preferred_skills": ["Docker", "AWS"],
            "experience_range": "3-5 years",
            "role_level": "senior",
            "implicit_requirements": ["startup tolerance", "self-driven"],
        }

    client = Groq(api_key=api_key)
    response = client.chat.completions.create(
        model="llama-3.1-8b-instant",   # free, open-source, fast on Groq
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Job Description:\n{jd_text}"},
        ],
        temperature=0,
        response_format={"type": "json_object"},  # guarantees valid JSON output
    )

    content = response.choices[0].message.content
    if not content:
        return {}
    return json.loads(content)
