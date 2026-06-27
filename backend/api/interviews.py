from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from models.database import get_db
from models.domain import Interview, Candidate, Job

router = APIRouter()


@router.get("/{token}", summary="Fetch interview details by token (used by the mobile app)")
def get_interview_by_token(token: str, db: Session = Depends(get_db)):
    """
    Called by the Expo mobile app when the candidate opens their deep link.
    Returns the interview questions and candidate/job context.
    """
    interview = db.query(Interview).filter(Interview.token == token).first()
    if interview is None:
        raise HTTPException(status_code=404, detail="Interview not found or token invalid")

    candidate = db.query(Candidate).filter(Candidate.id == interview.candidate_id).first()
    job = db.query(Job).filter(Job.id == interview.job_id).first()

    return {
        "interview_id": interview.id,
        "token": interview.token,
        "status": interview.status,
        "questions": interview.questions or [],
        "candidate": {
            "name": candidate.name if candidate else None,
            "title": candidate.current_title if candidate else None,
        },
        "job": {
            "title": job.title if job else None,
        },
        "created_at": interview.created_at,
    }
