import requests
import time
import sys

BASE_URL = "http://127.0.0.1:8000"
AUTH = ("admin", "hireflow123")

def test_api():
    print("🚀 Starting API Tests...")
    
    # 1. Create a Job
    print("\n1. Testing POST /api/jobs/")
    job_data = {
        "title": "Backend Python Developer",
        "description": "Looking for a Python developer with FastAPI and SQLAlchemy experience."
    }
    res = requests.post(f"{BASE_URL}/api/jobs/", json=job_data, auth=AUTH)
    if res.status_code != 200:
        print(f"❌ Failed to create job. Status: {res.status_code}, {res.text}")
        sys.exit(1)
    
    job_id = res.json()["job_id"]
    print(f"✅ Job created successfully. Job ID: {job_id}")
    
    # 2. Scrape candidates
    print(f"\n2. Testing POST /api/jobs/{job_id}/scrape")
    res = requests.post(f"{BASE_URL}/api/jobs/{job_id}/scrape", auth=AUTH)
    if res.status_code != 200:
        print(f"❌ Failed to scrape candidates. Status: {res.status_code}, {res.text}")
        sys.exit(1)
    
    scraped_count = res.json()["total_found"]
    print(f"✅ Scraped {scraped_count} candidates.")
    
    if scraped_count == 0:
        print("⚠️ No candidates scraped, skipping scoring and shortlisting.")
        sys.exit(0)
        
    # 3. Score candidates
    print(f"\n3. Testing POST /api/jobs/{job_id}/score")
    res = requests.post(f"{BASE_URL}/api/jobs/{job_id}/score", auth=AUTH)
    if res.status_code != 200:
        print(f"❌ Failed to score candidates. Status: {res.status_code}, {res.text}")
        sys.exit(1)
        
    print(f"✅ Scoring completed successfully.")
    
    # 4. List candidates
    print(f"\n4. Testing GET /api/candidates/?job_id={job_id}")
    res = requests.get(f"{BASE_URL}/api/candidates/", params={"job_id": job_id}, auth=AUTH)
    if res.status_code != 200:
        print(f"❌ Failed to fetch candidates. Status: {res.status_code}, {res.text}")
        sys.exit(1)
        
    candidates = res.json()
    print(f"✅ Fetched {len(candidates)} candidates.")
    
    candidate_id = candidates[0]["id"]
    
    # 5. Shortlist a candidate
    print(f"\n5. Testing POST /api/candidates/{candidate_id}/shortlist")
    res = requests.post(f"{BASE_URL}/api/candidates/{candidate_id}/shortlist", auth=AUTH)
    if res.status_code != 200:
        print(f"❌ Failed to shortlist candidate. Status: {res.status_code}, {res.text}")
        sys.exit(1)
        
    print(f"✅ Candidate {candidate_id} shortlisted.")
    
    # 6. Invite a candidate
    print(f"\n6. Testing POST /api/candidates/{candidate_id}/invite")
    res = requests.post(f"{BASE_URL}/api/candidates/{candidate_id}/invite", auth=AUTH)
    if res.status_code != 200:
        print(f"❌ Failed to invite candidate. Status: {res.status_code}, {res.text}")
        sys.exit(1)
        
    print(f"✅ Candidate {candidate_id} invited. Token: {res.json().get('interview_token')}")
    
    # 7. Compare candidates
    print(f"\n7. Testing GET /api/candidates/compare/?ids={candidate_id}")
    res = requests.get(f"{BASE_URL}/api/candidates/compare/", params={"ids": str(candidate_id)}, auth=AUTH)
    if res.status_code != 200:
        print(f"❌ Failed to compare candidates. Status: {res.status_code}, {res.text}")
        sys.exit(1)
        
    print(f"✅ Comparison data fetched successfully.")
    
    print("\n🎉 All tests passed successfully!")

if __name__ == "__main__":
    test_api()
