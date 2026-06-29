from __future__ import annotations

import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models.database import get_db
from models.domain import Candidate, Interview, Job
from services.interviewer import generate_interview_questions
from services.email_service import send_invite_email

router = APIRouter()
logger = logging.getLogger(__name__)


class EmailOverrideRequest(BaseModel):
    email: str | None = None


# ---------------------------------------------------------------------------
# IMPORTANT: /compare/justification MUST come before /compare/ and /{id}
# otherwise FastAPI matches "justification" as a candidate ID param
# ---------------------------------------------------------------------------

@router.get("/compare/justification", summary="Get ranking and justification for candidates")
def get_candidates_justification(ids: str, db: Session = Depends(get_db)):
    """
    ids is a comma-separated string of candidate IDs.
    Calls Groq to generate a plain-English ranking and justification.
    """
    candidate_ids = [int(i) for i in ids.split(",") if i.strip().isdigit()]
    if not candidate_ids:
        return {"ranking_justification": "No candidates provided."}

    candidates = db.query(Candidate).filter(Candidate.id.in_(candidate_ids)).all()
    profiles = []

    for c in candidates:
        interview = db.query(Interview).filter(Interview.candidate_id == c.id).first()
        profiles.append({
            "id": c.id,
            "name": c.name,
            "semantic_score": c.semantic_score,
            "score_breakdown": c.score_breakdown,
            "interview_scorecard": interview.scorecard if interview else None,
        })

    from services.scorer import generate_comparison_ranking
    return generate_comparison_ranking(profiles)


@router.get("/compare/", summary="Get multiple candidates and their interview scorecards for comparison")
def get_candidates_for_comparison(ids: str, db: Session = Depends(get_db)):
    """
    ids is a comma-separated string of candidate IDs.
    Returns candidate profiles along with their interview scorecards if available.
    """
    candidate_ids = [int(i) for i in ids.split(",") if i.strip().isdigit()]
    if not candidate_ids:
        return []

    candidates = db.query(Candidate).filter(Candidate.id.in_(candidate_ids)).all()
    results = []

    for c in candidates:
        interview = db.query(Interview).filter(Interview.candidate_id == c.id).first()
        results.append({
            "candidate": c,
            "interview": {
                "status": interview.status if interview else None,
                "scorecard": interview.scorecard if interview else None,
            },
        })

    return results


@router.get("/", summary="List all candidates for a job")
def list_candidates(job_id: int, db: Session = Depends(get_db)):
    return db.query(Candidate).filter(Candidate.job_id == job_id).all()


@router.get("/{candidate_id}", summary="Get a single candidate full profile")
def get_candidate(candidate_id: int, db: Session = Depends(get_db)):
    c = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if c is None:
        raise HTTPException(status_code=404, detail="Candidate not found")

    interview = db.query(Interview).filter(Interview.candidate_id == c.id).first()
    c_dict = {k: v for k, v in c.__dict__.items() if not k.startswith("_")}
    c_dict["interview"] = {
        "status": interview.status if interview else None,
        "scorecard": interview.scorecard if interview else None,
    }
    return c_dict


class ManualCandidateRequest(BaseModel):
    job_id: int
    name: str
    email: str
    current_title: str | None = None
    current_company: str | None = None


@router.post("/manual", summary="Manually add a candidate by name + email (no scraping)")
def add_candidate_manually(req: ManualCandidateRequest, db: Session = Depends(get_db)):
    """
    For candidates the recruiter already knows about (referrals, direct
    applicants) who didn't come from the scraper. They start with no
    semantic score and status='manual'. The recruiter can shortlist them
    directly and invite them — score and breakdown stay null since there's
    no profile to semantically match against.
    """
    job = db.query(Job).filter(Job.id == req.job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    candidate = Candidate(
        job_id=req.job_id,
        name=req.name,
        email=req.email,
        current_title=req.current_title,
        current_company=req.current_company,
        source="manual",
        status="shortlisted",  # manually-added candidates skip auto-scoring and go straight to shortlisted
    )
    db.add(candidate)
    db.commit()
    db.refresh(candidate)
    return {"message": f"Added {req.name}", "candidate": candidate}


@router.post("/{candidate_id}/shortlist", summary="Manually shortlist a candidate")
def shortlist_candidate(candidate_id: int, db: Session = Depends(get_db)):
    """Recruiter manually promotes a candidate to 'shortlisted'."""
    c = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if c is None:
        raise HTTPException(status_code=404, detail="Candidate not found")
    c.status = "shortlisted"
    db.commit()
    return {"message": f"Candidate {c.name} shortlisted", "status": c.status}


@router.post("/{candidate_id}/unshortlist", summary="Revert a shortlisted candidate back to scored")
def unshortlist_candidate(candidate_id: int, db: Session = Depends(get_db)):
    """Recruiter manually removes a candidate from shortlist."""
    c = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if c is None:
        raise HTTPException(status_code=404, detail="Candidate not found")
    if c.status not in ("shortlisted",):
        raise HTTPException(
            status_code=400,
            detail=f"Candidate is '{c.status}', not 'shortlisted' — cannot unshortlist",
        )
    c.status = "scored"
    db.commit()
    return {"message": f"Candidate {c.name} removed from shortlist", "status": c.status}


@router.post("/{candidate_id}/invite", summary="Send interview invitation to a shortlisted candidate")
def invite_candidate(
    candidate_id: int,
    body: EmailOverrideRequest = EmailOverrideRequest(),
    db: Session = Depends(get_db),
):
    """
    1. Verifies candidate is 'shortlisted'.
    2. Generates 5 personalised interview questions via Groq.
    3. Creates a unique Interview record with a UUID token.
    4. Sends an HTML email with deep link hireflow://interview/{token}.
    5. Updates candidate status to 'invited'.
    """
    c = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if c is None:
        raise HTTPException(status_code=404, detail="Candidate not found")
    if c.status != "shortlisted":
        raise HTTPException(
            status_code=400,
            detail=f"Candidate status is '{c.status}'. Only 'shortlisted' candidates can be invited.",
        )

    job = db.query(Job).filter(Job.id == c.job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="Associated job not found")

    candidate_profile = {
        "name": c.name or "",
        "title": c.current_title or "",
        "company": c.current_company or "",
        "skills": c.skills or [],
        "experience": c.experience_summary or "",
        "score_breakdown": c.score_breakdown or {},
    }
    questions = generate_interview_questions(job.criteria or {}, candidate_profile)

    token = str(uuid.uuid4())
    interview = Interview(
        candidate_id=c.id,
        job_id=c.job_id,
        token=token,
        questions=questions,
        status="pending",
    )
    db.add(interview)

    to_email = body.email or c.email
    email_sent = False
    if to_email:
        email_sent = send_invite_email(
            to_email=to_email,
            candidate_name=c.name or "Candidate",
            job_title=job.title,
            interview_token=token,
        )
    else:
        logger.warning(
            f"No email for candidate {c.id} ({c.name}) — deep link: hireflow://interview/{token}"
        )

    c.status = "invited"
    c.email = to_email or c.email
    db.commit()

    return {
        "message": f"Interview invitation created for {c.name}",
        "token": token,
        "questions": questions,
        "email_sent": email_sent,
        "email_used": to_email,
        "deep_link": f"hireflow://interview/{token}",
    }
