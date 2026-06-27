import asyncio
import httpx

async def test_e2e():
    async with httpx.AsyncClient(base_url="http://127.0.0.1:8000", auth=("admin", "hireflow123")) as client:
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
        print(f"Criteria extracted: {job['criteria']}")
        print("-" * 40)
        
        print("2. Scraping Candidates...")
        res = await client.post(f"/api/jobs/{job_id}/scrape", timeout=60.0)
        res.raise_for_status()
        scrape_res = res.json()
        print(f"OK Scraped {len(scrape_res.get('candidates', []))} candidates")
        print("-" * 40)

        print("3. Scoring Candidates...")
        res = await client.post(f"/api/jobs/{job_id}/score", timeout=120.0)
        res.raise_for_status()
        score_res = res.json()
        print(f"OK Scoring result: {score_res['message']}")
        print("-" * 40)

        print("4. Fetching Candidates...")
        res = await client.get(f"/api/candidates/job/{job_id}", timeout=10.0)
        if res.status_code == 200:
            candidates = res.json()
            for i, c in enumerate(candidates[:10]):
                print(f"Candidate {i+1}: {c['name']} (Score: {c.get('semantic_score')})")
                print(f"  Title: {c.get('current_title')}")
                print(f"  Company: {c.get('current_company')}")
                print(f"  Source: {c.get('source')}")
                print(f"  Breakdown: {c.get('score_breakdown')}")
                print(f"  Red Flags: {c.get('red_flags')}")
                print()
        else:
            print(f"Could not fetch candidates: {res.status_code}")

if __name__ == "__main__":
    asyncio.run(test_e2e())
