import asyncio
from fastapi.testclient import TestClient
from main import app

def send_email():
    client = TestClient(app)
    print("Sending POST request to /api/candidates/81/invite with BasicAuth")
    response = client.post(
        "/api/candidates/81/invite",
        json={"email": "koushal.sub@gmail.com"},
        auth=("admin", "hireflow123")
    )
    print("Response Status Code:", response.status_code)
    try:
        print("Response JSON:", response.json())
    except Exception as e:
        print("Response Text:", response.text)

if __name__ == "__main__":
    send_email()
