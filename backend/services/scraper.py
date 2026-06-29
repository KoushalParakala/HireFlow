"""
Candidate Sourcing Service
--------------------------
Async pipeline with two sources:
1. Apify LinkedIn Profile Scraper — runs actor, polls for results
2. GitHub REST API — 2 pages, up to 20 profiles

Results are unified, deduplicated, and returned as a flat list.
Rate limiting: exponential backoff on 429/503 for both sources.
"""
import asyncio
import logging
import urllib.parse
from typing import Any

import httpx

from core.config import settings

logger = logging.getLogger(__name__)

APIFY_BASE = "https://api.apify.com/v2"
# Working LinkedIn Profile Scraper actor on Apify
LINKEDIN_ACTOR_ID = "M2FMdjRVeF1HPGFcc"


async def _exponential_backoff(attempt: int) -> None:
    wait = (2 ** attempt) + 1.0
    logger.warning(f"Rate limited or error. Waiting {wait:.1f}s before retry (attempt {attempt + 1})...")
    await asyncio.sleep(wait)


# ---------------------------------------------------------------------------
# LinkedIn (PRIMARY) — Apify actor run → poll → fetch dataset
# ---------------------------------------------------------------------------

def _parse_linkedin_item(item: dict, job_title: str) -> dict[str, Any]:
    """Normalise a single Apify LinkedIn profile item into HireFlow schema."""
    raw_loc = item.get("location")
    loc_str = raw_loc.get("linkedinText") if isinstance(raw_loc, dict) else raw_loc

    first_name = item.get("firstName", "")
    last_name = item.get("lastName", "")
    full_name = f"{first_name} {last_name}".strip()

    current_positions = item.get("currentPositions") or []
    curr_pos = current_positions[0] if current_positions else {}

    # Skills: Apify sometimes returns a list of dicts with "name" key
    raw_skills = item.get("skills") or []
    skills = []
    for s in raw_skills:
        if isinstance(s, dict):
            skills.append(s.get("name", ""))
        elif isinstance(s, str):
            skills.append(s)

    return {
        "name": full_name or item.get("name") or item.get("title") or "Unknown",
        "current_title": (
            curr_pos.get("title")
            or item.get("jobTitle")
            or item.get("headline")
            or job_title
        ),
        "current_company": (
            curr_pos.get("companyName")
            or item.get("company")
            or "Unknown"
        ),
        "experience_summary": item.get("summary") or item.get("about") or "",
        "skills": [s for s in skills if s],
        "profile_url": (
            item.get("linkedinUrl")
            or item.get("url")
            or item.get("profileUrl")
        ),
        "source": "LinkedIn",
        "location": loc_str or None,
        "github_username": None,
        "public_repos": None,
        "followers": None,
        "email": item.get("email") or None,
    }


async def _run_apify_actor(
    client: httpx.AsyncClient,
    job_title: str,
    max_items: int = 15,
) -> list[dict[str, Any]]:
    """
    Start an Apify actor run synchronously and return parsed profiles.
    Uses run-sync-get-dataset-items (blocks until the run finishes, max 300s).
    Falls back gracefully on any error.
    """
    if not settings.APIFY_TOKEN:
        logger.warning("No APIFY_TOKEN — skipping LinkedIn scrape.")
        return []

    token = settings.APIFY_TOKEN
    url = (
        f"{APIFY_BASE}/acts/{LINKEDIN_ACTOR_ID}"
        f"/run-sync-get-dataset-items"
        f"?token={token}&timeout=180&memory=256"
    )

    # Input schema for M2FMdjRVeF1HPGFcc (LinkedIn Profile Search Scraper No Cookies)
    payload = {
        "searchQuery": job_title,
        "maxItems": max_items,
        "profileScraperMode": "Short",
        "autoQuerySegmentation": False,
        "recentlyChangedJobs": False,
        "recentlyPostedOnLinkedIn": False,
    }

    for attempt in range(3):
        try:
            logger.info(f"Apify LinkedIn — starting actor run for '{job_title}' (attempt {attempt+1})")
            resp = await client.post(url, json=payload)

            if resp.status_code in (200, 201):
                items = resp.json()
                if not isinstance(items, list):
                    logger.error(f"Apify returned non-list: {type(items)}")
                    return []
                logger.info(f"Apify returned {len(items)} LinkedIn profiles")
                return [_parse_linkedin_item(i, job_title) for i in items]

            elif resp.status_code == 400:
                # Actor input schema may differ — try alternative input format
                logger.warning(f"Apify 400 — trying alternative input format")
                alt_payload = {
                    "queries": job_title,
                    "maxResults": max_items,
                }
                resp2 = await client.post(url, json=alt_payload)
                if resp2.status_code in (200, 201):
                    items = resp2.json()
                    if isinstance(items, list):
                        logger.info(f"Apify alt format returned {len(items)} profiles")
                        return [_parse_linkedin_item(i, job_title) for i in items]

            elif resp.status_code in (429, 503):
                await _exponential_backoff(attempt)
                continue

            else:
                logger.error(
                    f"Apify failed: HTTP {resp.status_code} — {resp.text[:400]}"
                )
                return []

        except httpx.TimeoutException:
            logger.warning(f"Apify timeout on attempt {attempt+1}")
            await _exponential_backoff(attempt)
        except httpx.RequestError as e:
            logger.error(f"Apify request error: {e}")
            await _exponential_backoff(attempt)

    logger.error("Apify: all attempts exhausted")
    return []


async def _fetch_linkedin_candidates(job_title: str) -> list[dict[str, Any]]:
    """Run the Apify LinkedIn scraper and return up to 20 profiles."""
    async with httpx.AsyncClient(timeout=200.0) as client:
        return await _run_apify_actor(client, job_title, max_items=20)


# ---------------------------------------------------------------------------
# GitHub (SECONDARY) — REST API, 2 pages
# ---------------------------------------------------------------------------

async def _fetch_github_profile(
    client: httpx.AsyncClient,
    username: str,
    headers: dict,
) -> dict[str, Any] | None:
    for attempt in range(3):
        try:
            resp = await client.get(
                f"https://api.github.com/users/{username}", headers=headers
            )
            if resp.status_code == 200:
                profile_data = resp.json()
                repos_resp = await client.get(
                    f"https://api.github.com/users/{username}/repos?sort=pushed&per_page=5",
                    headers=headers,
                )
                real_skills: list[str] = []
                if repos_resp.status_code == 200:
                    langs = {
                        r["language"]
                        for r in repos_resp.json()
                        if r.get("language")
                    }
                    real_skills = list(langs)
                profile_data["real_skills"] = real_skills
                return profile_data
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
    headers: dict,
) -> list[dict[str, Any]]:
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

                profile_tasks = [
                    _fetch_github_profile(client, item["login"], headers)
                    for item in items[:10]
                ]
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
                        "skills": profile.get("real_skills") or skills,
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
                logger.warning(f"GitHub rate limited page {page} (attempt {attempt+1})")
                await _exponential_backoff(attempt)
            else:
                logger.error(
                    f"GitHub search page {page} failed: {resp.status_code} — {resp.text[:200]}"
                )
                return []
        except httpx.RequestError as e:
            logger.error(f"GitHub page {page} request error: {e}")
            await _exponential_backoff(attempt)

    return []


async def _fetch_github_candidates(
    job_title: str, criteria: dict[str, Any]
) -> list[dict[str, Any]]:
    """Fetch 2 pages of GitHub candidates (up to 20 profiles)."""
    headers: dict[str, str] = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "HireFlow-Backend",
    }
    if settings.GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {settings.GITHUB_TOKEN}"

    raw_skills = criteria.get("required_skills", [])[:3]
    level_words = {"senior", "junior", "mid", "lead", "staff", "principal", "entry"}
    clean_skills: list[str] = []
    for s in raw_skills:
        words = [w for w in s.lower().split() if w not in level_words]
        if words:
            clean_skills.append(words[-1])

    query = " ".join(clean_skills).strip() or job_title

    async with httpx.AsyncClient(timeout=30.0) as client:
        p1 = _fetch_github_page(client, query, clean_skills, job_title, 1, headers)
        p2 = _fetch_github_page(client, query, clean_skills, job_title, 2, headers)
        pages = await asyncio.gather(p1, p2, return_exceptions=True)

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

def _deduplicate_candidates(
    candidates: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    unique: list[dict[str, Any]] = []
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

        key = f"{c.get('name', '')} {c.get('current_company', '')}".strip().lower()
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

async def scrape_candidates(
    job_title: str, criteria: dict[str, Any] = {}
) -> list[dict[str, Any]]:
    """
    Run LinkedIn (Apify) and GitHub scrapers concurrently.
    LinkedIn results take priority in deduplication.
    Falls back to a broader GitHub search if < 10 results found.
    """
    linkedin_task = asyncio.create_task(_fetch_linkedin_candidates(job_title))
    github_task = asyncio.create_task(_fetch_github_candidates(job_title, criteria))

    linkedin_results, github_results = await asyncio.gather(
        linkedin_task, github_task, return_exceptions=True
    )

    combined: list[dict[str, Any]] = []

    if isinstance(linkedin_results, list):
        combined.extend(linkedin_results)
        logger.info(f"LinkedIn contributed {len(linkedin_results)} profiles")
    else:
        logger.error(f"LinkedIn scraper failed: {linkedin_results}")

    if isinstance(github_results, list):
        combined.extend(github_results)
        logger.info(f"GitHub contributed {len(github_results)} profiles")
    else:
        logger.error(f"GitHub scraper failed: {github_results}")

    # Fallback: if still < 10, broaden GitHub search with job title directly
    if len(combined) < 10:
        logger.warning(
            f"Only {len(combined)} candidates found — running broader GitHub fallback for '{job_title}'"
        )
        gh_headers: dict[str, str] = {
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "HireFlow-Backend",
        }
        if settings.GITHUB_TOKEN:
            gh_headers["Authorization"] = f"Bearer {settings.GITHUB_TOKEN}"

        async with httpx.AsyncClient(timeout=30.0) as client:
            fb1 = _fetch_github_page(client, job_title, [], job_title, 1, gh_headers)
            fb2 = _fetch_github_page(client, job_title, [], job_title, 2, gh_headers)
            fallback = await asyncio.gather(fb1, fb2, return_exceptions=True)

        for res in fallback:
            if isinstance(res, list):
                combined.extend(res)

    if not combined:
        logger.warning("All scrapers returned empty — no candidates found.")

    deduped = _deduplicate_candidates(combined)
    logger.info(
        f"Scrape complete: {len(combined)} raw → {len(deduped)} after deduplication"
    )
    return deduped
