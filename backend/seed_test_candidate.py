import asyncio
import httpx
import base64
import sys
import os

# Add the backend directory to sys.path so we can import local modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from models.database import SessionLocal
from models.domain import Job, Candidate
from services.scorer import score_candidate
from services.jd_analyzer import analyze_job_description

_AUTH_HEADER = {
    "Authorization": "Basic " + base64.b64encode(b"admin:hireflow123").decode()
}

async def seed_and_test_pipeline():
    db = SessionLocal()
    try:
        print("1. Creating Job directly via DB (to avoid needing running server for this step, but we will use httpx for others if we want, or just DB)")
        # Alternatively, we can just use httpx for everything except candidate insertion.
        # Let's ensure the server is running on 8000 for the httpx calls.
    finally:
        db.close()

async def run_pipeline():
    # 1. Ensure DB has a candidate with User's details.
    db = SessionLocal()
    try:
        # Create a Job
        job_title = "Senior AI Engineer"
        jd_text = "Looking for a Senior AI Engineer to build scalable ML pipelines. Must be proficient in Python, FastAPI, React Native, and have experience with LLMs and Agentic AI."
        criteria = analyze_job_description(jd_text)
        
        job = Job(title=job_title, description=jd_text, criteria=criteria)
        db.add(job)
        db.commit()
        db.refresh(job)
        job_id = job.id
        print(f"Created Job ID: {job_id}")

        # Insert Koushal as a Candidate
        candidate = Candidate(
            job_id=job_id,
            name="Koushal Parakala",
            current_title="Software Engineer",
            current_company="Tech Corp",
            skills=["Python", "FastAPI", "React Native", "LLMs", "Agentic AI"],
            experience_summary="Experienced software engineer building full-stack applications with AI integration.",
            email="koushal.sub@gmail.com",
            status="scraped"
        )
        db.add(candidate)
        db.commit()
        db.refresh(candidate)
        candidate_id = candidate.id
        print(f"Inserted Candidate ID: {candidate_id}")
    finally:
        db.close()

    # 2. Use HTTP API to trigger scoring and inviting (needs backend server running)
    async with httpx.AsyncClient(base_url="http://127.0.0.1:8000", headers=_AUTH_HEADER) as client:
        print("\n3. Triggering Scoring...")
        res = await client.post(f"/api/jobs/{job_id}/score", timeout=120.0)
        res.raise_for_status()
        score_res = res.json()
        print(f"Score Result: {score_res['message']}")
        
        # Check if shortlisted
        shortlisted = [c for c in score_res['candidates'] if c['id'] == candidate_id and c['status'] == 'shortlisted']
        if not shortlisted:
            print("Candidate was NOT auto-shortlisted. Manually shortlisting...")
            res = await client.post(f"/api/candidates/{candidate_id}/shortlist", timeout=10.0)
            res.raise_for_status()
            print("Manually shortlisted.")
        
        print("\n4. Sending Interview Invite...")
        invite_data = {"email": "koushal.sub@gmail.com"}
        res = await client.post(f"/api/candidates/{candidate_id}/invite", json=invite_data, timeout=60.0)
        res.raise_for_status()
        invite_res = res.json()
        
        print("\n--- INVITATION SUCCESSFUL ---")
        print(f"Token: {invite_res['token']}")
        print(f"Deep Link (for Android): {invite_res['deep_link']}")
        print("Generated Questions:")
        for idx, q in enumerate(invite_res['questions']):
            print(f"  {idx+1}. {q}")

if __name__ == "__main__":
    asyncio.run(run_pipeline())
