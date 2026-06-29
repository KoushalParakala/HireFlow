import json
import re
from groq import Groq
from core.config import settings
from typing import Any


def _analyse_communication(transcript: str) -> dict[str, Any]:
    """
    CPU-bound communication analysis — no API call needed.
    Counts filler words, checks answer structure, and produces a
    confidence indicator from speech pattern proxies.
    """
    if not transcript:
        return {
            "filler_word_count": 0,
            "filler_words_found": [],
            "has_structure": False,
            "specificity_signals": 0,
            "confidence_indicator": "low",
            "word_count": 0,
        }

    text_lower = transcript.lower()
    words = text_lower.split()
    word_count = len(words)

    # Filler words
    fillers = ["um", "uh", "like", "you know", "sort of", "kind of", "basically",
               "actually", "literally", "right", "so yeah", "i mean"]
    filler_hits: list[str] = []
    for filler in fillers:
        count = text_lower.count(filler)
        if count > 0:
            filler_hits.extend([filler] * count)

    # Structure signals — STAR method indicators
    structure_signals = ["first", "then", "finally", "as a result", "in conclusion",
                         "for example", "specifically", "to summarise", "in summary",
                         "the outcome", "we achieved", "the result was"]
    has_structure = any(sig in text_lower for sig in structure_signals)

    # Specificity signals — numbers, percentages, proper nouns proxy
    specificity_signals = len(re.findall(r'\b\d+[%kKmM]?\b', transcript))

    # Confidence indicator heuristic:
    # High: low filler ratio, structured answer, mentions specifics, decent length
    filler_ratio = len(filler_hits) / max(word_count, 1)
    if filler_ratio < 0.05 and has_structure and specificity_signals >= 1 and word_count >= 60:
        confidence = "high"
    elif filler_ratio < 0.12 and word_count >= 30:
        confidence = "medium"
    else:
        confidence = "low"

    return {
        "filler_word_count": len(filler_hits),
        "filler_words_found": list(set(filler_hits)),
        "has_structure": has_structure,
        "specificity_signals": specificity_signals,
        "confidence_indicator": confidence,
        "word_count": word_count,
    }


def generate_scorecard(
    transcript: str,
    question: str,
    job_criteria: dict[str, Any]
) -> dict[str, Any]:
    """
    Generates a scorecard for a single answer.

    Returns:
    - summary (2-3 sentences)
    - scores: relevance, clarity, specificity, depth (0-100 each)
    - hire_signal + confidence_level (from LLM)
    - follow_up_questions
    - communication_analysis (filler words, structure, confidence indicator — CPU-only)
    """
    # Always run CPU communication analysis regardless of API key
    comm = _analyse_communication(transcript)

    fallback = {
        "summary": "GROQ_API_KEY not set. Cannot generate scorecard summary.",
        "scores": {"relevance": 0, "clarity": 0, "specificity": 0, "depth": 0},
        "hire_signal": "no-hire",
        "confidence_level": "low",
        "follow_up_questions": [],
        "communication_analysis": comm,
    }

    if not settings.GROQ_API_KEY:
        return fallback

    client = Groq(api_key=settings.GROQ_API_KEY)

    prompt = f"""You are an expert technical recruiter analyzing a candidate's video interview answer.

Job Criteria:
{json.dumps(job_criteria)}

Interview Question:
{question}

Candidate Transcript:
{transcript}

Analyze the answer and return ONLY valid JSON matching this schema exactly:
{{
    "summary": "2-3 sentence summary of the answer.",
    "scores": {{
        "relevance": <0-100>,
        "clarity": <0-100>,
        "specificity": <0-100>,
        "depth": <0-100>
    }},
    "hire_signal": "hire" or "no-hire",
    "confidence_level": "high", "medium", or "low",
    "follow_up_questions": ["Question 1", "Question 2"]
}}
"""

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
        result["communication_analysis"] = comm
        return result

    except Exception as e:
        print(f"Error generating scorecard: {e}")
        fallback["summary"] = "Error generating summary."
        return fallback
