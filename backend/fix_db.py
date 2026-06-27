import asyncio
from models.database import SessionLocal
from models.domain import Candidate

def run():
    db = SessionLocal()
    c = db.query(Candidate).filter(Candidate.id == 81).first()
    if c:
        c.status = "shortlisted"
        db.commit()
        print("Candidate 81 set to shortlisted")
    else:
        print("Candidate 81 not found")

if __name__ == "__main__":
    run()
