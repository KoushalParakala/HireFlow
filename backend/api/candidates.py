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
    email: str | None = None  # recruiter can supply email if not auto-sourced


@router.get("/", summary="List all candidates for a job")
def list_candidates(job_id: int, db: Session = Depends(get_db)):
    return db.query(Candidate).filter(Candidate.job_id == job_id).all()


@router.get("/{candidate_id}", summary="Get a single candidate full profile")
def get_candidate(candidate_id: int, db: Session = Depends(get_db)):
    c = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if c is None:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return c


@router.post("/{candidate_id}/shortlist", summary="Manually shortlist a candidate")
def shortlist_candidate(candidate_id: int, db: Session = Depends(get_db)):
    """Recruiter manually promotes a candidate to 'shortlisted' (manual override)."""
    c = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if c is None:
        raise HTTPException(status_code=404, detail="Candidate not found")
    c.status = "shortlisted"
    db.commit()
    return {"message": f"Candidate {c.name} shortlisted", "status": c.status}


@router.post("/{candidate_id}/unshortlist", summary="Revert a shortlisted candidate back to scored")
def unshortlist_candidate(candidate_id: int, db: Session = Depends(get_db)):
    """Recruiter manually removes a candidate from shortlist (manual override in reverse)."""
    c = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if c is None:
        raise HTTPException(status_code=404, detail="Candidate not found")
    if c.status not in ("shortlisted",):
        raise HTTPException(
            status_code=400,
            detail=f"Candidate is '{c.status}', not 'shortlisted' — cannot unshortlist"
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
    2. Generates 5 personalized interview questions via Groq LLM.
    3. Creates a unique Interview record with a UUID token.
    4. Sends an HTML email with the deep link hireflow://interview/{token}.
    5. Updates candidate status to 'invited'.
    """
    c = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if c is None:
        raise HTTPException(status_code=404, detail="Candidate not found")
    if c.status != "shortlisted":
        raise HTTPException(
            status_code=400,
            detail=f"Candidate status is '{c.status}'. Only 'shortlisted' candidates can be invited."
        )

    # Fetch the job for criteria
    job = db.query(Job).filter(Job.id == c.job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="Associated job not found")

    # Generate personalized questions
    candidate_profile = {
        "name": c.name or "",
        "title": c.current_title or "",
        "company": c.current_company or "",
        "skills": c.skills or [],
        "experience": c.experience_summary or "",
        "score_breakdown": c.score_breakdown or {},
    }
    questions = generate_interview_questions(job.criteria or {}, candidate_profile)

    # Create Interview record with unique token
    token = str(uuid.uuid4())
    interview = Interview(
        candidate_id=c.id,
        job_id=c.job_id,
        token=token,
        questions=questions,
        status="pending",
    )
    db.add(interview)

    # Resolve email: prefer recruiter override > sourced email
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
            f"No email address for candidate {c.id} ({c.name}) — deep link logged only"
        )
        import logging as _logging
        _logging.getLogger(__name__).info(
            f"[NO EMAIL] Deep link for {c.name}: hireflow://interview/{token}"
        )

    # Update candidate status
    c.status = "invited"
    c.email = to_email or c.email  # persist if recruiter supplied it
    db.commit()

    return {
        "message": f"Interview invitation created for {c.name}",
        "token": token,
        "questions": questions,
        "email_sent": email_sent,
        "email_used": to_email,
        "deep_link": f"hireflow://interview/{token}",
    }
