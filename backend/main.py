from __future__ import annotations

import time
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.middleware.cors import CORSMiddleware
import secrets
from sqlalchemy.exc import OperationalError

from core.config import settings
from models.database import engine
from models import domain  # noqa: F401 — registers all ORM models
from api import jobs, candidates, interviews

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Replaces deprecated @app.on_event("startup").
    Runs once when the server starts — creates all DB tables.
    Retries 5 times with 5s gap to handle Railway's cold-boot delay.
    """
    for attempt in range(5):
        try:
            domain.Base.metadata.create_all(bind=engine)
            logger.info("✅ Database tables created / verified")
            break
        except OperationalError as e:
            logger.warning(f"DB not ready (attempt {attempt + 1}/5): {e}")
            time.sleep(5)
    else:
        logger.error("❌ Could not connect to database after 5 attempts")

    yield  # Server runs here


app = FastAPI(title=settings.PROJECT_NAME, version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBasic()

def verify_auth(credentials: HTTPBasicCredentials = Depends(security)):
    correct_username = secrets.compare_digest(credentials.username, settings.ADMIN_USER)
    correct_password = secrets.compare_digest(credentials.password, settings.ADMIN_PASS)
    if not (correct_username and correct_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username

app.include_router(jobs.router, prefix="/api/jobs", tags=["Jobs"], dependencies=[Depends(verify_auth)])
app.include_router(candidates.router, prefix="/api/candidates", tags=["Candidates"], dependencies=[Depends(verify_auth)])
app.include_router(interviews.router, prefix="/api/interviews", tags=["Interviews"])


@app.get("/")
def health_check():
    return {"status": "HireFlow API is running", "version": "1.0.0"}
