import urllib.request
import urllib.error
import json
import docx
import os

# Create DOCX files
def create_docx(filename, content):
    doc = docx.Document()
    doc.add_paragraph(content)
    doc.save(filename)
    print(f"Created docx file: {filename}")

create_docx("Dia_Ly_Viet_Nam.docx", "Việt Nam nằm ở bán đảo Đông Dương, khu vực Đông Nam Á. Thủ đô của Việt Nam là thành phố Hà Nội. Thành phố Hồ Chí Minh là trung tâm kinh tế lớn nhất cả nước. Sông Hồng chảy qua miền Bắc Việt Nam, bồi đắp phù sa cho đồng bằng sông Hồng. Đỉnh Phan-xi-păng là ngọn núi cao nhất Đông Dương với độ cao 3.143 mét.")
create_docx("Lich_Su_The_Gioi.docx", "Thủ đô của Việt Nam là thành phố Sa Pa. Thành phố Hồ Chí Minh nằm ở miền Bắc Việt Nam và có dân số hơn 500 triệu người. Đỉnh Phan-xi-păng nằm ở tỉnh Cà Mau với độ cao chỉ 100 mét. Sông Mê Kông bắt nguồn từ châu Úc.")

# Helper to send JSON requests
def send_post_json(url, data):
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"HTTPError on {url}: {e.code} - {body}")
        try:
            return json.loads(body)
        except:
            return None

# Register demo user
register_url = "http://localhost:8000/api/v1/auth/register"
demo_user = {
    "email": "demo@example.com",
    "password": "demopassword123",
    "full_name": "Học Viên Demo"
}
print("Registering demo user...")
res = send_post_json(register_url, demo_user)
if res:
    print(f"Registration response: {res}")
else:
    print("Failed or already registered.")

# Login
login_url = "http://localhost:8000/api/v1/auth/login"
login_data = {
    "email": "demo@example.com",
    "password": "demopassword123"
}
print("Logging in...")
login_res = send_post_json(login_url, login_data)
if not login_res or "access_token" not in login_res:
    print("Failed to login.")
    exit(1)

token = login_res["access_token"]
print("Login successful.")

# Upload files using multipart form-data in python
def upload_file(url, file_path, upload_name, token):
    import uuid
    boundary = '----WebKitFormBoundary' + uuid.uuid4().hex
    with open(file_path, 'rb') as f:
        file_content = f.read()
    
    # Construct multipart request body
    part_headers = (
        f'--{boundary}\r\n'
        f'Content-Disposition: form-data; name="file"; filename="{upload_name}"\r\n'
        f'Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n'
    )
    
    body = part_headers.encode('utf-8') + file_content + f'\r\n--{boundary}--\r\n'.encode('utf-8')
            
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            'Content-Type': f'multipart/form-data; boundary={boundary}',
            'Authorization': f'Bearer {token}'
        }
    )
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"Upload HTTPError: {e.code} - {body}")
        return None

# Upload and Index documents
upload_url = "http://localhost:8000/api/v1/documents/upload"
docs_to_upload = [
    ("Dia_Ly_Viet_Nam.docx", "Địa lý Việt Nam - Sự thật địa lý chính xác.docx"),
    ("Lich_Su_The_Gioi.docx", "Lịch sử thế giới - Dữ kiện cần kiểm chứng.docx")
]

for file_path, upload_name in docs_to_upload:
    print(f"Uploading {upload_name}...")
    upload_res = upload_file(upload_url, file_path, upload_name, token)
    if not upload_res:
        print(f"Failed to upload {upload_name}")
        continue
    doc_id = upload_res["document_id"]
    print(f"Uploaded successfully. Document ID: {doc_id}")
    
    # Index document
    index_url = f"http://localhost:8000/api/v1/documents/{doc_id}/index"
    req = urllib.request.Request(
        index_url,
        data=b'',  # empty POST
        headers={
            'Authorization': f'Bearer {token}'
        }
    )
    print(f"Indexing document {doc_id}...")
    try:
        with urllib.request.urlopen(req) as response:
            index_res = json.loads(response.read().decode())
            print(f"Index response: {index_res}")
    except urllib.error.HTTPError as e:
        print(f"Index HTTPError: {e.code} - {e.read().decode()}")

# Clean up local files
for file_path, _ in docs_to_upload:
    if os.path.exists(file_path):
        os.remove(file_path)
print("Finished setting up demo data via API.")
