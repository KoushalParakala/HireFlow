import asyncio
import httpx
import json
import base64

# HTTP Basic auth — matches main.py credentials
_AUTH_HEADER = {
    "Authorization": "Basic " + base64.b64encode(b"admin:hireflow123").decode()
}

async def test_day2():
    async with httpx.AsyncClient(base_url="http://127.0.0.1:8000", headers=_AUTH_HEADER) as client:
        print("1. Creating Job...")
        jd_data = {
            "title": "Senior Python Backend Engineer",
            "description": "We are looking for a Senior Python Backend Engineer with 5+ years of experience in building scalable backend services. Must be proficient in Python, FastAPI, and PostgreSQL. Experience with asyncio, Docker, and Railway is a big plus. The candidate should have strong communication skills and be able to lead technical projects."
        }
        res = await client.post("/api/jobs/", json=jd_data, timeout=30.0)
        res.raise_for_status()
        job = res.json()
        job_id = job["job_id"]
        print(f"OK Job created: {job_id}")
        print("-" * 40)
        
        print("2. Scraping Candidates...")
        res = await client.post(f"/api/jobs/{job_id}/scrape", timeout=120.0)
        res.raise_for_status()
        scrape_res = res.json()
        print(f"OK Scraped {len(scrape_res.get('candidates', []))} candidates")
        print("-" * 40)

        print("3. Scoring Candidates & Auto-Shortlisting...")
        res = await client.post(f"/api/jobs/{job_id}/score", timeout=120.0)
        res.raise_for_status()
        score_res = res.json()
        print(f"OK Scoring result:")
        print(f"  Message: {score_res['message']}")
        print(f"  Shortlisted count: {score_res['shortlisted']}")
        print(f"  Threshold used: {score_res['threshold_used']}")
        print("-" * 40)

        print("4. Inviting Shortlisted Candidate...")
        shortlisted = [c for c in score_res['candidates'] if c['status'] == 'shortlisted']
        if not shortlisted:
            print("No shortlisted candidates to invite.")
            return

        candidate = shortlisted[0]
        print(f"Inviting candidate: {candidate['name']} (ID: {candidate['id']})")
        
        invite_data = {"email": "test@example.com"} # Override email for testing
        res = await client.post(f"/api/candidates/{candidate['id']}/invite", json=invite_data, timeout=60.0)
        res.raise_for_status()
        invite_res = res.json()
        
        print(f"OK Invitation sent.")
        print(f"  Token: {invite_res['token']}")
        print(f"  Email used: {invite_res['email_used']}")
        print(f"  Deep link: {invite_res['deep_link']}")
        print(f"  Questions generated:")
        for i, q in enumerate(invite_res['questions']):
            print(f"    {i+1}. {q}")
        print("-" * 40)

        print("5. Testing Mobile Interview Endpoint...")
        token = invite_res['token']
        res = await client.get(f"/api/interviews/{token}", timeout=10.0)
        res.raise_for_status()
        interview_res = res.json()
        print(f"OK Interview details fetched:")
        print(f"  Candidate: {interview_res['candidate']['name']}")
        print(f"  Job: {interview_res['job']['title']}")
        print(f"  Questions count: {len(interview_res['questions'])}")

if __name__ == "__main__":
    asyncio.run(test_day2())
