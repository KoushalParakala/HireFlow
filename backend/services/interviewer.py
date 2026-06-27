"""
Interview Question Generator
-----------------------------
Uses Groq (Llama 3.1 8B instant) to generate 5 personalized interview
questions per candidate, based on their specific background and JD criteria.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from groq import Groq

from core.config import settings

logger = logging.getLogger(__name__)

_QUESTION_SYSTEM_PROMPT = """\
You are a senior technical recruiter generating a personalized async video interview.
Given the candidate profile and JD criteria, produce exactly 5 interview questions.

Rules:
- Mix behavioral and technical questions.
- Reference specific skills/gaps visible in the candidate profile vs the JD.
- If the candidate lacks a required skill, ask how they would learn it.
- If they have the skill, ask for a concrete past example.
- Keep each question under 40 words.
- Rank from easy (1) to hard (5).

Return ONLY a valid JSON array of 5 strings, no markdown, no explanation.
Example: ["Question 1?", "Question 2?", "Question 3?", "Question 4?", "Question 5?"]
"""


def generate_interview_questions(
    job_criteria: dict[str, Any],
    candidate_profile: dict[str, Any],
) -> list[str]:
    """Generate 5 personalized interview questions for a candidate using Groq."""
    if not settings.GROQ_API_KEY:
        logger.warning("No GROQ_API_KEY -- returning fallback interview questions")
        return _fallback_questions(job_criteria)

    user_content = (
        f"Job Criteria:\n{json.dumps(job_criteria, indent=2)}\n\n"
        f"Candidate Profile:\n{json.dumps(candidate_profile, indent=2)}"
    )

    try:
        client = Groq(api_key=settings.GROQ_API_KEY)
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[
                {"role": "system", "content": _QUESTION_SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
            temperature=0.4,
        )
        content = response.choices[0].message.content or "[]"
        content = content.strip()
        if content.startswith("`"):
            content = content.split("`")[1]
            if content.startswith("json"):
                content = content[4:]

        questions: list[str] = json.loads(content)
        if not isinstance(questions, list) or not questions:
            raise ValueError("Groq returned empty or non-list response")

        logger.info(f"Generated {len(questions)} interview questions")
        return questions[:5]

    except Exception as exc:
        logger.error(f"Question generation failed: {exc} -- using fallback")
        return _fallback_questions(job_criteria)


def _fallback_questions(job_criteria: dict[str, Any]) -> list[str]:
    skills = ", ".join(job_criteria.get("required_skills", ["your primary skills"])[:3])
    level = job_criteria.get("role_level", "this")
    return [
        f"Walk us through your experience with {skills}.",
        f"Describe a challenging project you led at a {level}-level role.",
        "How do you approach debugging a production issue under pressure?",
        "Tell us about a time you had to learn a new technology quickly.",
        "Where do you see your technical career in the next 2 years?",
    ]
