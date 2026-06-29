from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "HireFlow API"

    # PostgreSQL connection URL (from Railway)
    DATABASE_URL: str

    # Auth credentials for the API
    ADMIN_USER: str = "admin"
    ADMIN_PASS: str = "hireflow123"

    # Groq API key — free tier, used for JD parsing and recommendation text
    # Get one at: https://console.groq.com
    GROQ_API_KEY: str | None = None

    # GitHub API token for sourcing candidates
    GITHUB_TOKEN: str | None = None

    # Apify API token for LinkedIn scraping
    APIFY_TOKEN: str | None = None

    # Resend HTTP API key — preferred email path, get one free at https://resend.com
    # If set, this is used instead of SMTP (more reliable on Railway).
    RESEND_API_KEY: str | None = None

    # SMTP fallback for sending interview invite emails — add to .env
    # If using Resend over SMTP instead of their HTTP API: host=smtp.resend.com,
    # port=587, user="resend", pass=<your Resend API key>.
    SMTP_HOST: str = "smtp.resend.com"
    SMTP_PORT: int = 587
    SMTP_USER: str | None = None
    SMTP_PASS: str | None = None
    SMTP_FROM_EMAIL: str = "onboarding@resend.dev"

    # Frontend URL for email links (set to Railway/Vercel URL in production)
    FRONTEND_URL: str = "http://localhost:3000"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
