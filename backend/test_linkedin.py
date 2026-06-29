import asyncio
import httpx
import os
import sys
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

APIFY_TOKEN = os.getenv("APIFY_TOKEN")
APIFY_BASE = "https://api.apify.com/v2"

ACTORS = {
    "curious_coder~linkedin-profile-scraper": "PEgClm7RgRD7YO94b",
    "2SyF0bVxmgGr8IVCZ": "2SyF0bVxmgGr8IVCZ"
}

async def test_actor(actor_name, actor_id_or_name):
    if not APIFY_TOKEN:
        print("❌ Error: APIFY_TOKEN environment variable is not set!")
        return

    print(f"\n--- Testing Actor: {actor_name} ({actor_id_or_name}) ---")
    url = f"{APIFY_BASE}/acts/{actor_id_or_name}/run-sync-get-dataset-items?token={APIFY_TOKEN}&timeout=30&memory=256"
    
    # Simple search payload
    payload = {
        "searchUrl": "https://www.linkedin.com/search/results/people/?keywords=Python&origin=GLOBAL_SEARCH_HEADER",
        "maxResults": 1,
        "scrapeCompany": False
    }

    async with httpx.AsyncClient(timeout=40.0) as client:
        try:
            print(f"Sending request to Apify for {actor_name}...")
            resp = await client.post(url, json=payload)
            print(f"Status Code: {resp.status_code}")
            
            if resp.status_code in (200, 201):
                print(f"✅ Success! Actor completed successfully.")
                print(f"Result count: {len(resp.json())} items.")
            else:
                print(f"❌ Failed with status code {resp.status_code}")
                try:
                    err_details = resp.json()
                    print("Error JSON response:")
                    import json
                    print(json.dumps(err_details, indent=2))
                except Exception:
                    print("Raw text response:")
                    print(resp.text[:500])
                    
        except Exception as e:
            print(f"❌ Request failed with exception: {e}")

async def main():
    print(f"Using APIFY_TOKEN: {APIFY_TOKEN[:10]}...{APIFY_TOKEN[-5:] if len(APIFY_TOKEN) > 5 else ''}")
    for name, id_val in ACTORS.items():
        # Test using canonical/named format
        await test_actor(name, name)
        # Test using hash ID format
        await test_actor(name + " (Hash ID)", id_val)

if __name__ == "__main__":
    asyncio.run(main())
