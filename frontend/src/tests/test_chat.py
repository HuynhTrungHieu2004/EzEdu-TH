import requests
import json

base_url = "http://127.0.0.1:8000"

# 1. Log in
login_payload = {
    "email": "demo@example.com",
    "password": "demopassword123"
}
login_response = requests.post(f"{base_url}/api/v1/auth/login", json=login_payload)
print("Login status:", login_response.status_code)
if login_response.status_code != 200:
    print("Login response:", login_response.text)
    exit(1)

token_data = login_response.json()
token = token_data["access_token"]
headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json"
}

# 2. Get documents
docs_response = requests.get(f"{base_url}/api/v1/documents", headers=headers)
docs = docs_response.json()

# Find the document ID of "Địa lý Việt Nam - Sự thật địa lý chính xác"
doc_id = None
for d in docs:
    if "Địa lý Việt Nam" in d["original_filename"]:
        doc_id = d["id"]
        break

if not doc_id:
    print("Could not find the document 'Địa lý Việt Nam'")
    exit(1)

print("Target doc ID:", doc_id)

# 3. Call ask-advanced with use_web_search=True
chat_payload = {
    "question": "Đỉnh núi cao nhất Đông Dương cao bao nhiêu mét và nằm ở nước nào?",
    "scope": "document",
    "document_ids": [doc_id],
    "use_web_search": True,
    "response_style": "normal",
    "conversation_id": None,
    "request_id": None
}

print("Calling ask-advanced with use_web_search=True...")
chat_response = requests.post(f"{base_url}/api/v1/chat/ask-advanced", json=chat_payload, headers=headers)
print("Chat status:", chat_response.status_code)
print("Chat response:", json.dumps(chat_response.json(), indent=2, ensure_ascii=False))
