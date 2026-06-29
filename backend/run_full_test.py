import asyncio
from models.database import SessionLocal, engine
from models import domain
from api.jobs import JobCreateRequest
from services.jd_analyzer import analyze_job_description
from services.scraper import scrape_candidates
from services.scorer import score_candidate
from models.domain import Job, Candidate

# Re-create DB
domain.Base.metadata.drop_all(bind=engine)
domain.Base.metadata.create_all(bind=engine)

async def main():
    db = SessionLocal()
    
    print('1. Creating Job...')
    jd_text = 'We are looking for a Senior Python Backend Engineer with 5+ years of experience in building scalable backend services. Must be proficient in Python, FastAPI, and PostgreSQL.'
    criteria = analyze_job_description(jd_text)
    job = Job(title='Senior Python Backend Engineer', description=jd_text, criteria=criteria)
    db.add(job)
    db.commit()
    db.refresh(job)
    print(f'Job Created: {job.id}, Criteria: {criteria}')
    
    print('2. Scraping Candidates...')
    candidates = await scrape_candidates(job.title, criteria=criteria)
    for c in candidates:
        db.add(Candidate(
            job_id=job.id, name=c.get('name'), current_title=c.get('current_title'),
            current_company=c.get('current_company'), skills=c.get('skills', []),
            experience_summary=c.get('experience_summary', ''), profile_url=c.get('profile_url'),
            source=c.get('source'), email=c.get('email'), status='scraped'
        ))
    db.commit()
    print(f'Scraped {len(candidates)} candidates.')
    
    print('3. Scoring Candidates...')
    unscored = db.query(Candidate).filter(Candidate.job_id == job.id, Candidate.status == 'scraped').all()
    for c in unscored[:3]:  # Score first 3
        data = {'name': c.name, 'title': c.current_title, 'company': c.current_company, 'skills': c.skills, 'experience': c.experience_summary}
        res = score_candidate(data, job.criteria)
        print(f'Scored {c.name}: {res["overall_score"]}')

if __name__ == '__main__':
    asyncio.run(main())
