"""Kiểm tra backend đã deploy có chạy đúng không — chạy được từ máy bất kỳ.

    python scripts/kiem_tra_trien_khai.py --api-url https://ezedu-backend.onrender.com \
        --origin https://ezedu.netlify.app

Chỉ ĐỌC, không ghi gì vào cơ sở dữ liệu. Dùng sau bước deploy backend và sau khi
sửa CORS, thay cho việc mở trình duyệt đoán xem hỏng ở đâu.

Không cần thư viện ngoài — chỉ dùng thư viện chuẩn, nên chạy được bằng python3
trên máy trống.
"""

import argparse
import json
import ssl
import sys
import urllib.error
import urllib.request

TIMEOUT = 90  # Render gói free ngủ sau 15 phút; lần gọi đầu có thể chờ ~50 giây

PASS, FAIL, WARN = "PASS", "FAIL", "CẢNH BÁO"


def show(status: str, label: str, detail: str = "") -> bool:
    print(f"  {status:9} {label}{(' — ' + detail) if detail else ''}")
    return status != FAIL


def _ssl_context() -> ssl.SSLContext:
    """Python cài từ python.org trên macOS không dùng chứng chỉ gốc của hệ điều
    hành: gọi HTTPS sẽ báo CERTIFICATE_VERIFY_FAILED dù máy chủ hoàn toàn bình
    thường. Dùng bộ chứng chỉ của `certifi` nếu có, giống app/database/mongodb.py."""
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def request(url: str, *, method: str = "GET", headers: dict | None = None, body: bytes | None = None):
    req = urllib.request.Request(url, method=method, data=body, headers=headers or {})
    context = _ssl_context()
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT, context=context) as response:
            return response.status, dict(response.headers), response.read()
    except urllib.error.HTTPError as error:
        return error.code, dict(error.headers), error.read()


def check_https(api_url: str) -> bool:
    if api_url.startswith("https://"):
        return show(PASS, "backend chạy HTTPS")
    return show(
        FAIL, "backend không chạy HTTPS",
        "trang Netlify là HTTPS, gọi API qua HTTP sẽ bị trình duyệt chặn (mixed content)",
    )


def check_health(api_url: str) -> bool:
    try:
        status, _, raw = request(f"{api_url}/health/ready")
    except Exception as error:  # noqa: BLE001 - báo nguyên nhân cho người dùng
        return show(FAIL, "gọi được /health/ready", str(error)[:120])

    if status != 200:
        return show(FAIL, "/health/ready trả 200", f"nhận {status}")

    data = json.loads(raw)
    services = data.get("services", {})
    ok = show(PASS if data.get("status") == "healthy" else FAIL,
              "tổng trạng thái backend", str(data.get("status")))
    for name, state in services.items():
        # chromadb hỏng thì hỏi đáp có trích dẫn mất, nhưng phần còn lại vẫn chạy
        level = PASS if state == "healthy" else (WARN if name == "chromadb" else FAIL)
        ok = show(level, f"dịch vụ {name}", state) and ok
    return ok


def check_cors(api_url: str, origin: str) -> bool:
    status, headers, _ = request(
        f"{api_url}/api/v1/auth/login",
        method="OPTIONS",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    allowed = headers.get("access-control-allow-origin") or headers.get("Access-Control-Allow-Origin")
    if allowed == origin:
        return show(PASS, "CORS cho phép tên miền frontend", origin)
    return show(
        FAIL, "CORS cho phép tên miền frontend",
        f'nhận {allowed!r} (đặt BACKEND_CORS_ORIGINS=["{origin}"] rồi deploy lại backend)',
    )


def check_runtime_config(api_url: str) -> bool:
    status, _, raw = request(f"{api_url}/api/v1/runtime-config")
    if status != 200:
        return show(FAIL, "đọc được cấu hình runtime", f"HTTP {status}")
    flags = json.loads(raw).get("feature_flags", {})
    # `enable_maintenance_mode` tắt nghĩa là site đang chạy bình thường — đúng
    # trạng thái mong muốn, không phải điều đáng cảnh báo.
    off = sorted(key for key, value in flags.items()
                 if not value and key != "enable_maintenance_mode")
    show(PASS, "đọc được cấu hình runtime", f"{len(flags)} cờ tính năng")
    if off:
        show(WARN, "phân hệ đang tắt", ", ".join(off))
    return True


def check_auth_path(api_url: str, origin: str) -> bool:
    """Sai mật khẩu phải ra 401 — chứng minh đường xác thực và CSDL đều sống."""
    body = json.dumps({"email": "khong-ton-tai@example.com", "password": "sai-mat-khau"}).encode()
    status, _, _ = request(
        f"{api_url}/api/v1/auth/login",
        method="POST",
        headers={"Content-Type": "application/json", "Origin": origin},
        body=body,
    )
    if status in (400, 401):
        return show(PASS, "đường đăng nhập chạm tới CSDL", f"sai mật khẩu trả {status} như mong đợi")
    if status >= 500:
        return show(FAIL, "đường đăng nhập chạm tới CSDL",
                    f"HTTP {status} — thường là MONGODB_URI sai hoặc Atlas chặn IP")
    return show(WARN, "đường đăng nhập chạm tới CSDL", f"HTTP {status} ngoài dự kiến")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--api-url", required=True, help="VD: https://ezedu-backend.onrender.com")
    parser.add_argument("--origin", required=True, help="VD: https://ezedu.netlify.app")
    args = parser.parse_args()

    api_url = args.api_url.rstrip("/")
    origin = args.origin.rstrip("/")

    print(f"Kiểm tra {api_url} với frontend {origin}")
    print("(lần gọi đầu có thể chờ tới một phút nếu Render đang ngủ)\n")

    results = [
        check_https(api_url),
        check_health(api_url),
        check_cors(api_url, origin),
        check_runtime_config(api_url),
        check_auth_path(api_url, origin),
    ]

    print()
    if all(results):
        print("KẾT QUẢ: ĐẠT — backend sẵn sàng cho frontend gọi.")
    else:
        print("KẾT QUẢ: CÓ MỤC HỎNG — xem dòng FAIL ở trên.")
        sys.exit(1)


if __name__ == "__main__":
    main()
