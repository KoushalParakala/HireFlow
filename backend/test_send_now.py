import asyncio
from fastapi.testclient import TestClient
from main import app
from models.database import SessionLocal
from models.domain import Candidate

def send_email():
    db = SessionLocal()
    c = db.query(Candidate).filter(Candidate.id == 81).first()
    if c:
        c.status = 'shortlisted'
        db.commit()
        print("Reset candidate 81 to shortlisted")
    db.close()

    client = TestClient(app)
    print("Sending POST request to /api/candidates/81/invite with BasicAuth")
    response = client.post(
        "/api/candidates/81/invite",
        auth=("admin", "hireflow123")
    )
    print("Response Status Code:", response.status_code)
    try:
        print("Response JSON:", response.json())
    except Exception as e:
        print("Response Text:", response.text)

if __name__ == "__main__":
    send_email()
