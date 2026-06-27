from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import Text, JSON, func, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from models.database import Base


class Job(Base):
    """A job posting with LLM-parsed criteria stored as JSON."""
    __tablename__ = "jobs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    title: Mapped[str] = mapped_column(nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    criteria: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class Candidate(Base):
    """A scraped candidate profile linked to a job, with semantic scoring."""
    __tablename__ = "candidates"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id"), nullable=False, index=True)
    name: Mapped[Optional[str]] = mapped_column(nullable=True)
    current_title: Mapped[Optional[str]] = mapped_column(nullable=True)
    current_company: Mapped[Optional[str]] = mapped_column(nullable=True)
    skills: Mapped[Optional[list[Any]]] = mapped_column(JSON, nullable=True)
    experience_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    profile_url: Mapped[Optional[str]] = mapped_column(nullable=True)
    source: Mapped[Optional[str]] = mapped_column(nullable=True)
    location: Mapped[Optional[str]] = mapped_column(nullable=True)
    github_username: Mapped[Optional[str]] = mapped_column(nullable=True)
    public_repos: Mapped[Optional[int]] = mapped_column(nullable=True)
    followers: Mapped[Optional[int]] = mapped_column(nullable=True)
    email: Mapped[Optional[str]] = mapped_column(nullable=True)  # sourced if available; required for invite

    # Filled after LLM scoring
    semantic_score: Mapped[Optional[float]] = mapped_column(nullable=True)
    score_breakdown: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)
    red_flags: Mapped[Optional[list[Any]]] = mapped_column(JSON, nullable=True)

    # Lifecycle: scraped → scored → shortlisted → invited → interviewed
    status: Mapped[str] = mapped_column(default="scraped")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class Interview(Base):
    """A unique async video interview session for a shortlisted candidate."""
    __tablename__ = "interviews"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    candidate_id: Mapped[int] = mapped_column(ForeignKey("candidates.id"), nullable=False, index=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id"), nullable=False)
    token: Mapped[str] = mapped_column(unique=True, nullable=False, index=True)
    questions: Mapped[Optional[list[Any]]] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(default="pending")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
