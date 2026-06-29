from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
import asyncio

from models.database import get_db
from models.domain import Job, Candidate, Interview
from services.jd_analyzer import analyze_job_description
from services.scraper import scrape_candidates
from services.scorer import score_candidates_batch

router = APIRouter()


class JobCreateRequest(BaseModel):
    title: str
    description: str


@router.post("/", summary="Post a new Job Description")
def create_job(req: JobCreateRequest, db: Session = Depends(get_db)):
    """
    Recruiter pastes a JD.
    LLM extracts: required skills, preferred skills, experience range, role level, implicit requirements.
    Stored in the 'criteria' JSON column.
    """
    criteria = analyze_job_description(req.description)
    job = Job(title=req.title, description=req.description, criteria=criteria)
    db.add(job)
    db.commit()
    db.refresh(job)
    return {"message": "Job created and analyzed", "job_id": job.id, "criteria": criteria}


# IMPORTANT: GET "/" must come BEFORE GET "/{job_id}" to avoid FastAPI matching
# the literal string "" as a job_id parameter.
@router.get("/", summary="Get all jobs")
def get_all_jobs(db: Session = Depends(get_db)):
    results = (
        db.query(Job, func.count(Candidate.id))
        .outerjoin(Candidate, Job.id == Candidate.job_id)
        .group_by(Job.id)
        .order_by(Job.id.desc())
        .all()
    )
    jobs_out = []
    for job, count in results:
        interviews_total = db.query(Interview).filter(Interview.job_id == job.id).count()
        interviews_completed = db.query(Interview).filter(Interview.job_id == job.id, Interview.status == 'scored').count()
        completion_rate = (interviews_completed / interviews_total * 100) if interviews_total > 0 else 0

        avg_score_val = db.query(func.avg(Candidate.semantic_score)).filter(Candidate.job_id == job.id, Candidate.semantic_score != None).scalar()
        avg_semantic_score = round(avg_score_val) if avg_score_val else None

        jobs_out.append({
            "id": job.id,
            "title": job.title,
            "candidate_count": count,
            "interview_completion_rate": round(completion_rate),
            "average_semantic_score": avg_semantic_score
        })
    return jobs_out


@router.get("/{job_id}", summary="Get a job posting")
def get_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    candidate_count = db.query(Candidate).filter(Candidate.job_id == job_id).count()
    return {"id": job.id, "title": job.title, "description": job.description, "candidate_count": candidate_count}


@router.post("/{job_id}/scrape", summary="Scrape LinkedIn + GitHub for candidates")
async def scrape_for_job(job_id: int, db: Session = Depends(get_db)):
    """
    Searches LinkedIn and GitHub for profiles matching the job title.
    Saves results as Candidate rows with status='scraped'.
    """
    job = db.query(Job).filter(Job.id == job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    raw = await scrape_candidates(job.title, criteria=job.criteria or {})

    existing_urls = {
        u[0] for u in db.query(Candidate.profile_url)
        .filter(Candidate.job_id == job_id, Candidate.profile_url.isnot(None))
        .all()
    }

    inserted = 0
    for c in raw:
        profile_url = c.get("profile_url")
        if profile_url and profile_url in existing_urls:
            continue

        db.add(Candidate(
            job_id=job_id,
            name=c.get("name"),
            current_title=c.get("current_title"),
            current_company=c.get("current_company"),
            skills=c.get("skills", []),
            experience_summary=c.get("experience_summary", ""),
            profile_url=profile_url,
            source=c.get("source"),
            location=c.get("location"),
            github_username=c.get("github_username"),
            public_repos=c.get("public_repos"),
            followers=c.get("followers"),
            email=c.get("email"),
            status="scraped",
        ))
        inserted += 1
        if profile_url:
            existing_urls.add(profile_url)

    db.commit()
    return {"message": f"Scraped {len(raw)} candidates. Inserted {inserted} new.", "total_found": len(raw), "inserted": inserted}


@router.post("/{job_id}/score", summary="Semantically score all scraped candidates and auto-shortlist")
async def score_all_candidates(job_id: int, db: Session = Depends(get_db)):
    """
    1. Scores every 'scraped' candidate using sentence-transformers + Groq.
       Produces a per-criterion breakdown: technical_skills / seniority / domain_experience.
    2. Adaptively shortlists to guarantee >=10 candidates per role.
    3. Returns breakdown per candidate.
    """
    job = db.query(Job).filter(Job.id == job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    unscored = db.query(Candidate).filter(
        Candidate.job_id == job_id,
        Candidate.status == "scraped",
    ).all()

    if not unscored:
        return {"message": "No unscored candidates found"}

    scored_records: list[dict] = []
    loop = asyncio.get_running_loop()

    candidate_payloads = [
        {
            "name": c.name or "",
            "title": c.current_title or "",
            "company": c.current_company or "",
            "skills": c.skills or [],
            "experience": c.experience_summary or "",
        }
        for c in unscored
    ]

    # One batched call: embeds the JD once, embeds all candidates in a single
    # encode() pass, and fans the Groq qualitative calls out concurrently —
    # instead of looping score_candidate() once per candidate sequentially.
    results = await loop.run_in_executor(
        None,
        score_candidates_batch,
        candidate_payloads,
        job.criteria or {},
    )

    for c, result in zip(unscored, results):
        c.semantic_score = result.get("overall_score", 0)
        c.score_breakdown = result.get("breakdown", {})
        c.red_flags = result.get("red_flags", [])
        c.status = "scored"
        scored_records.append({"candidate": c, "result": result})

    MIN_SHORTLIST = 10
    THRESHOLD_START = 55
    THRESHOLD_FLOOR = 30
    THRESHOLD_STEP = 5

    threshold_used = THRESHOLD_START
    shortlisted_ids: list[int] = []

    for threshold in range(THRESHOLD_START, THRESHOLD_FLOOR - 1, -THRESHOLD_STEP):
        shortlisted_ids = [
            rec["candidate"].id
            for rec in scored_records
            if (rec["candidate"].semantic_score or 0) >= threshold
        ]
        if len(shortlisted_ids) >= MIN_SHORTLIST:
            threshold_used = threshold
            break
    else:
        threshold_used = THRESHOLD_FLOOR
        shortlisted_ids = [
            rec["candidate"].id
            for rec in scored_records
            if (rec["candidate"].semantic_score or 0) >= THRESHOLD_FLOOR
        ]

    shortlisted_id_set = set(shortlisted_ids)
    for rec in scored_records:
        c = rec["candidate"]
        if c.id in shortlisted_id_set:
            c.status = "shortlisted"

    db.commit()

    candidate_summaries = [
        {
            "id": rec["candidate"].id,
            "name": rec["candidate"].name,
            "status": rec["candidate"].status,
            "overall_score": rec["result"].get("overall_score"),
            "breakdown": rec["result"].get("breakdown"),
            "red_flags": rec["result"].get("red_flags"),
        }
        for rec in scored_records
    ]

    return {
        "message": f"Scored {len(scored_records)} candidates",
        "shortlisted": len(shortlisted_ids),
        "threshold_used": threshold_used,
        "candidates": candidate_summaries,
    }
