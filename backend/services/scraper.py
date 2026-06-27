"""
Candidate Sourcing Service
--------------------------
Async pipeline with two sources:
1. Apify LinkedIn Search Actor (PRIMARY — 2 pages, up to 20 profiles)
2. GitHub REST API (SECONDARY — 2 pages, up to 20 profiles)

Results are unified, deduplicated, and returned as a flat list.
Rate limiting: exponential backoff on 429/503 for both sources.
"""
import asyncio
import logging
import urllib.parse
import difflib
from typing import Any

import httpx

from core.config import settings

logger = logging.getLogger(__name__)


async def _exponential_backoff(attempt: int) -> None:
    wait = (2 ** attempt) + 1.0
    logger.warning(f"Rate limited or error. Waiting {wait:.1f}s before retry (attempt {attempt + 1})...")
    await asyncio.sleep(wait)


# ---------------------------------------------------------------------------
# LinkedIn (PRIMARY) — Apify actor, paginated across 2 pages
# ---------------------------------------------------------------------------

async def _fetch_linkedin_page(
    client: httpx.AsyncClient,
    job_title: str,
    page: int,
) -> list[dict[str, Any]]:
    """Fetch one page of LinkedIn candidates via the Apify actor."""
    if not settings.APIFY_TOKEN:
        return []

    actor_id = "M2FMdjRVeF1HPGFcc"
    url = (
        f"https://api.apify.com/v2/acts/{actor_id}"
        f"/run-sync-get-dataset-items?token={settings.APIFY_TOKEN}&timeout=120"
    )
    payload = {
        "searchQuery": job_title,
        "maxItems": 10,
        "profileScraperMode": "Short",
        "startPage": page,
        "autoQuerySegmentation": False,
        "recentlyChangedJobs": False,
        "recentlyPostedOnLinkedIn": False,
    }

    for attempt in range(2):
        try:
            logger.info(f"Apify LinkedIn — page {page} for '{job_title}'")
            resp = await client.post(url, json=payload)
            if resp.status_code in (200, 201):
                items = resp.json()
                results = []
                for item in items:
                    raw_loc = item.get("location")
                    loc_str = raw_loc.get("linkedinText") if isinstance(raw_loc, dict) else raw_loc

                    first_name = item.get("firstName", "")
                    last_name = item.get("lastName", "")
                    full_name = f"{first_name} {last_name}".strip()

                    current_positions = item.get("currentPositions", [])
                    curr_pos_title = current_positions[0].get("title") if current_positions else None
                    curr_pos_company = current_positions[0].get("companyName") if current_positions else None

                    results.append({
                        "name": full_name or item.get("name") or item.get("title") or "Unknown",
                        "current_title": curr_pos_title or item.get("jobTitle") or item.get("headline") or job_title,
                        "current_company": curr_pos_company or item.get("company") or "Unknown",
                        "experience_summary": item.get("summary") or item.get("about") or "",
                        "skills": [],
                        "profile_url": item.get("linkedinUrl") or item.get("url") or item.get("profileUrl"),
                        "source": "LinkedIn",
                        "location": loc_str or None,
                        "github_username": None,
                        "public_repos": None,
                        "followers": None,
                        "email": item.get("email") or None,
                    })
                logger.info(f"Apify page {page} returned {len(results)} profiles")
                return results
            elif resp.status_code in (429, 503):
                await _exponential_backoff(attempt)
            else:
                logger.error(f"Apify page {page} failed: {resp.status_code} — {resp.text[:300]}")
                return []
        except httpx.RequestError as e:
            logger.error(f"Apify page {page} request error: {e}")
            await _exponential_backoff(attempt)

    return []


async def _fetch_linkedin_candidates(job_title: str) -> list[dict[str, Any]]:
    """Fetch 2 pages of LinkedIn candidates concurrently (up to 20 profiles)."""
    if not settings.APIFY_TOKEN:
        logger.warning("No APIFY_TOKEN set, skipping LinkedIn scrape.")
        return []

    async with httpx.AsyncClient(timeout=120.0) as client:
        page1_task = _fetch_linkedin_page(client, job_title, page=1)
        page2_task = _fetch_linkedin_page(client, job_title, page=2)
        pages = await asyncio.gather(page1_task, page2_task, return_exceptions=True)

    combined: list[dict[str, Any]] = []
    for page in pages:
        if isinstance(page, list):
            combined.extend(page)
        else:
            logger.error(f"LinkedIn page task error: {page}")

    logger.info(f"LinkedIn total: {len(combined)} profiles across 2 pages")
    return combined


# ---------------------------------------------------------------------------
# GitHub (SECONDARY) — REST API, paginated across 2 pages
# ---------------------------------------------------------------------------

async def _fetch_github_profile(client: httpx.AsyncClient, username: str) -> dict[str, Any] | None:
    headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "HireFlow-Backend",
    }
    if settings.GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {settings.GITHUB_TOKEN}"

    for attempt in range(3):
        try:
            resp = await client.get(f"https://api.github.com/users/{username}", headers=headers)
            if resp.status_code == 200:
                return resp.json()
            if resp.status_code in (403, 429):
                await _exponential_backoff(attempt)
            else:
                break
        except httpx.RequestError as e:
            logger.error(f"GitHub profile fetch error for {username}: {e}")
            await _exponential_backoff(attempt)
    return None


async def _fetch_github_page(
    client: httpx.AsyncClient,
    query: str,
    skills: list[str],
    job_title: str,
    page: int,
) -> list[dict[str, Any]]:
    """Fetch one page of GitHub user search results with full profile details."""
    headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "HireFlow-Backend",
    }
    if settings.GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {settings.GITHUB_TOKEN}"

    encoded_query = urllib.parse.quote(query)
    search_url = (
        f"https://api.github.com/search/users"
        f"?q={encoded_query}+type:user&per_page=10&page={page}"
    )

    for attempt in range(3):
        try:
            resp = await client.get(search_url, headers=headers)
            if resp.status_code == 200:
                items = resp.json().get("items", [])
                logger.info(f"GitHub page {page} for '{query}': {len(items)} users")

                profile_tasks = [_fetch_github_profile(client, item["login"]) for item in items[:10]]
                profiles = await asyncio.gather(*profile_tasks)

                results = []
                for profile in profiles:
                    if not profile:
                        continue
                    results.append({
                        "name": profile.get("name") or profile.get("login") or "Unknown",
                        "current_title": job_title,
                        "current_company": profile.get("company"),
                        "experience_summary": profile.get("bio") or "",
                        "skills": skills,
                        "profile_url": profile.get("html_url"),
                        "source": "GitHub",
                        "location": profile.get("location"),
                        "github_username": profile.get("login"),
                        "public_repos": profile.get("public_repos", 0),
                        "followers": profile.get("followers", 0),
                        "email": profile.get("email") or None,
                    })
                return results
            elif resp.status_code in (403, 429):
                logger.warning(f"GitHub rate limited page {page} (attempt {attempt + 1})")
                await _exponential_backoff(attempt)
            else:
                logger.error(f"GitHub search page {page} failed: {resp.status_code} — {resp.text[:200]}")
                return []
        except httpx.RequestError as e:
            logger.error(f"GitHub page {page} request error: {e}")
            await _exponential_backoff(attempt)

    return []


async def _fetch_github_candidates(job_title: str, criteria: dict[str, Any]) -> list[dict[str, Any]]:
    """Fetch 2 pages of GitHub candidates concurrently (up to 20 profiles)."""
    raw_skills = criteria.get("required_skills", [])[:3]
    # Strip common level prefixes so "Senior Python" → "Python" for better GitHub search
    level_words = {"senior", "junior", "mid", "lead", "staff", "principal", "entry"}
    clean_skills: list[str] = []
    for s in raw_skills:
        words = [w for w in s.lower().split() if w not in level_words]
        if words:
            clean_skills.append(words[-1])  # take the last meaningful word

    query = " ".join(clean_skills).strip() or job_title

    async with httpx.AsyncClient(timeout=20.0) as client:
        page1_task = _fetch_github_page(client, query, clean_skills, job_title, page=1)
        page2_task = _fetch_github_page(client, query, clean_skills, job_title, page=2)
        pages = await asyncio.gather(page1_task, page2_task, return_exceptions=True)

    combined: list[dict[str, Any]] = []
    for page in pages:
        if isinstance(page, list):
            combined.extend(page)
        else:
            logger.error(f"GitHub page task error: {page}")

    logger.info(f"GitHub total: {len(combined)} profiles across 2 pages")
    return combined


# ---------------------------------------------------------------------------
# Deduplication
# ---------------------------------------------------------------------------

def _deduplicate_candidates(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    unique = []
    seen_urls: set[str] = set()
    seen_githubs: set[str] = set()
    seen_keys: set[str] = set()

    for c in candidates:
        url = c.get("profile_url")
        gh = c.get("github_username")

        if url and url in seen_urls:
            continue
        if gh and gh in seen_githubs:
            continue

        name = c.get("name", "")
        company = c.get("current_company", "")
        # O(1) deduplication key
        key = f"{name} {company}".strip().lower()

        if len(key) > 3 and key in seen_keys:
            continue

        if url:
            seen_urls.add(url)
        if gh:
            seen_githubs.add(gh)
        if len(key) > 3:
            seen_keys.add(key)

        unique.append(c)

    return unique


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

async def scrape_candidates(job_title: str, criteria: dict[str, Any] = {}) -> list[dict[str, Any]]:
    """
    Runs LinkedIn (PRIMARY) and GitHub (SECONDARY) scrapers concurrently.
    Each scraper fetches 2 pages -> up to 40 raw profiles before deduplication.
    LinkedIn results appear first so they take priority in deduplication.
    Falls back to a broader GitHub search if <10 results are found.
    """
    linkedin_task = asyncio.create_task(_fetch_linkedin_candidates(job_title))
    github_task = asyncio.create_task(_fetch_github_candidates(job_title, criteria))

    linkedin_results, github_results = await asyncio.gather(
        linkedin_task, github_task, return_exceptions=True
    )

    combined: list[dict[str, Any]] = []
    if isinstance(linkedin_results, list):
        combined.extend(linkedin_results)
    else:
        logger.error(f"LinkedIn scraper failed: {linkedin_results}")

    if isinstance(github_results, list):
        combined.extend(github_results)
    else:
        logger.error(f"GitHub scraper failed: {github_results}")

    # --- Fallback: if we have <10 results, broaden GitHub search to job_title ---
    MIN_EXPECTED = 10
    if len(combined) < MIN_EXPECTED:
        logger.warning(
            f"Only {len(combined)} candidates found. Running broader GitHub fallback search for '{job_title}'..."
        )
        async with httpx.AsyncClient(timeout=20.0) as client:
            fallback_p1_task = _fetch_github_page(client, job_title, [], job_title, page=1)
            fallback_p2_task = _fetch_github_page(client, job_title, [], job_title, page=2)
            fallback_results = await asyncio.gather(fallback_p1_task, fallback_p2_task)
            
        for res in fallback_results:
            if isinstance(res, list):
                combined.extend(res)
        logger.info("Fallback added more profiles")

    if not combined:
        logger.warning("All scrapers returned empty — no candidates found.")

    deduped = _deduplicate_candidates(combined)
    logger.info(f"Scrape complete: {len(combined)} raw -> {len(deduped)} after deduplication")
    return deduped
