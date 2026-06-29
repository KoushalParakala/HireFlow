from __future__ import annotations

import base64
import os
import logging
from pathlib import Path
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
import json

from models.database import get_db, SessionLocal
from models.domain import Interview, Candidate, Job
from services.transcriber import transcribe_audio
from services.scorecard_generator import generate_scorecard

router = APIRouter()
logger = logging.getLogger(__name__)

# Mount a Railway Volume at /data for persistence across deploys.
# Without the volume, files vanish on restart.
UPLOAD_DIR = Path("/data/uploads") if Path("/data").exists() else Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True, parents=True)


def process_interview_background(interview_id: int):
    """
    Background worker that runs transcription and scoring pipeline.
    """
    db = SessionLocal()
    try:
        interview = db.query(Interview).filter(Interview.id == interview_id).first()
        if not interview:
            return

        candidate = db.query(Candidate).filter(Candidate.id == interview.candidate_id).first()
        job = db.query(Job).filter(Job.id == interview.job_id).first()

        scorecards = []
        overall_score = 0
        total_questions = len(interview.questions or [])

        for resp in (interview.responses or []):
            q_idx = resp.get("question_index")
            if q_idx is None:
                continue
            questions_list = interview.questions or []
            question_text = questions_list[q_idx] if q_idx < len(questions_list) else "Unknown Question"

            video_file = UPLOAD_DIR / f"{interview.token}_q{q_idx}.mp4"

            try:
                # Log storage size in bits/bytes before transcribing
                if video_file.exists():
                    f_size = video_file.stat().st_size
                    logger.info(f"Processing video file: {video_file}. Size: {f_size} bytes ({f_size * 8} bits)")

                transcript = transcribe_audio(str(video_file))

                scorecard = generate_scorecard(
                    transcript=transcript,
                    question=question_text,
                    job_criteria=job.criteria if job else {}
                )

                scorecard["question"] = question_text
                scorecard["transcript"] = transcript
                scorecards.append(scorecard)

                scores = scorecard.get("scores", {})
                if scores:
                    overall_score += sum(scores.values()) / len(scores)

            except Exception as e:
                print(f"Error processing question {q_idx}: {e}")

        interview.scorecard = {
            "questions": scorecards,
            "overall_average": overall_score / max(1, total_questions)
        }
        interview.status = "scored"
        if candidate:
            candidate.status = "interviewed"
        db.commit()
    except Exception as e:
        print(f"Background task failed: {e}")
        db.rollback()
    finally:
        db.close()


class ChunkUploadRequest(BaseModel):
    question_index: int
    chunk_index: int
    total_chunks: int
    data: str  # base64 encoded chunk


class CompleteInterviewRequest(BaseModel):
    responses: list[dict]


# NOTE: /api/interviews routes are intentionally NOT protected by HTTP Basic auth
# so the mobile app and web fallback can access them without credentials.
# The token itself is the auth mechanism — each token is a UUID.

@router.get("/{token}", summary="Fetch interview details by token (used by the mobile app)")
def get_interview_by_token(token: str, db: Session = Depends(get_db)):
    """
    Called by the Expo mobile app when the candidate opens their deep link.
    Returns the interview questions and candidate/job context.
    No HTTP Basic auth — the UUID token is the access control.
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


@router.get("/{token}/upload-status", summary="Check how many bytes of a question's video have been received (for resume)")
def get_upload_status(token: str, question_index: int, db: Session = Depends(get_db)):
    """
    Called by the mobile app before it starts uploading a question's video.
    Lets the app resume from the correct chunk instead of re-uploading bytes
    that already arrived from a previous, interrupted attempt.
    """
    interview = db.query(Interview).filter(Interview.token == token).first()
    if interview is None:
        raise HTTPException(status_code=404, detail="Interview not found")

    file_path = UPLOAD_DIR / f"{token}_q{question_index}.mp4"
    bytes_received = file_path.stat().st_size if file_path.exists() else 0
    return {"bytes_received": bytes_received}


@router.post("/{token}/upload-chunk", summary="Upload a chunk of the recorded video")
def upload_chunk(token: str, req: ChunkUploadRequest, db: Session = Depends(get_db)):
    """Receives a base64 encoded video chunk and appends it to the temp file."""
    interview = db.query(Interview).filter(Interview.token == token).first()
    if interview is None:
        raise HTTPException(status_code=404, detail="Interview not found")

    file_path = UPLOAD_DIR / f"{token}_q{req.question_index}.mp4"

    # chunk_index == 0 means start fresh; otherwise append
    mode = "wb" if req.chunk_index == 0 else "ab"

    try:
        binary_data = base64.b64decode(req.data)
    except Exception as e:
        # This is almost always a misaligned base64 chunk boundary on the
        # client (a chunk's character length wasn't a multiple of 4), not a
        # transient network error. Surface a clear message instead of a bare
        # 500 so it's obvious in logs/retries what actually went wrong.
        logger.error(f"Bad base64 chunk for {token} q{req.question_index} chunk {req.chunk_index}: {e}")
        raise HTTPException(
            status_code=400,
            detail=f"Chunk {req.chunk_index} is not valid base64 (likely a misaligned chunk boundary): {e}",
        )

    try:
        with open(file_path, mode) as f:
            f.write(binary_data)

        # Verify storage in bits
        file_size_bytes = file_path.stat().st_size
        file_size_bits = file_size_bytes * 8
        logger.info(f"Chunk saved: {file_path}. Size: {file_size_bytes} bytes ({file_size_bits} bits)")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"message": f"Chunk {req.chunk_index + 1}/{req.total_chunks} saved"}


@router.post("/{token}/complete", summary="Mark interview as completed and start processing")
def complete_interview(
    token: str,
    req: CompleteInterviewRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Called when the candidate has submitted all answers."""
    interview = db.query(Interview).filter(Interview.token == token).first()
    if interview is None:
        raise HTTPException(status_code=404, detail="Interview not found")

    interview.status = "processing"
    interview.responses = req.responses

    candidate = db.query(Candidate).filter(Candidate.id == interview.candidate_id).first()
    if candidate:
        candidate.status = "processing"

    db.commit()

    background_tasks.add_task(process_interview_background, interview.id)

    return {"message": "Interview completed and processing started"}
