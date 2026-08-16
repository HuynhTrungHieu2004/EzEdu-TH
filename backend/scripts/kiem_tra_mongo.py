"""Kiểm chuỗi kết nối MongoDB trước khi dán vào Render.

    python scripts/kiem_tra_mongo.py --uri "mongodb+srv://user:pass@cluster.mongodb.net/" --db chuyende02

Chỉ đọc. Bắt sớm ba lỗi hay gặp nhất:

1. Mật khẩu có ký tự đặc biệt (@ / : ? #) mà chưa mã hoá URL — chuỗi trông đúng
   nhưng xác thực luôn hỏng.
2. Quên mở Network Access trên Atlas — kết nối treo tới hết thời gian chờ.
3. Gõ nhầm tên CSDL — kết nối được nhưng ứng dụng chạy trên CSDL rỗng.
"""

import argparse
import re
import sys
from urllib.parse import quote_plus

import certifi
from pymongo import MongoClient
from pymongo.errors import ConfigurationError, OperationFailure, PyMongoError, ServerSelectionTimeoutError


def canh_bao_mat_khau(uri: str) -> None:
    """Mật khẩu chứa ký tự đặc biệt chưa mã hoá là nguyên nhân số một.

    Không dùng `urlsplit`: mật khẩu chứa `@` chưa mã hoá làm nó cắt sai chỗ, mà
    đó lại chính là ca cần bắt. Tự cắt: phần trước dấu `@` CUỐI CÙNG của khối
    trước `/` đầu tiên là userinfo.
    """
    if "://" not in uri:
        return
    sau_scheme = uri.split("://", 1)[1]
    khoi_host = sau_scheme.split("/", 1)[0]
    if "@" not in khoi_host:
        return
    userinfo = khoi_host.rsplit("@", 1)[0]
    if ":" not in userinfo:
        return
    password = userinfo.split(":", 1)[1]
    # Bỏ qua nếu đã mã hoá sẵn (có %XX): mã hoá lần nữa sẽ thành %25XX và lời
    # khuyên in ra sẽ sai.
    if re.search(r"%[0-9A-Fa-f]{2}", password):
        return
    if password and quote_plus(password) != password:
        print("  CẢNH BÁO  mật khẩu có ký tự cần mã hoá URL")
        print(f"            thay phần mật khẩu bằng: {quote_plus(password)}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--uri", required=True)
    parser.add_argument("--db", default="chuyende02", help="Tên CSDL sẽ dùng (mặc định: chuyende02)")
    args = parser.parse_args()

    canh_bao_mat_khau(args.uri)

    try:
        # Giống app/database/mongodb.py: Python trên macOS không dùng chứng chỉ
        # gốc của hệ điều hành, thiếu dòng này thì Atlas báo CERTIFICATE_VERIFY_FAILED
        # dù chuỗi kết nối hoàn toàn đúng.
        client = MongoClient(args.uri, serverSelectionTimeoutMS=15000, tlsCAFile=certifi.where())
        info = client.admin.command("ping")
        version = client.server_info().get("version", "?")
    except ServerSelectionTimeoutError as error:
        print("  FAIL      không kết nối được trong 15 giây")
        print("            thường là Network Access của Atlas chưa mở 0.0.0.0/0")
        print(f"            chi tiết: {str(error)[:160]}")
        sys.exit(1)
    except OperationFailure as error:
        print("  FAIL      sai thông tin đăng nhập")
        print("            kiểm lại user/mật khẩu ở Database Access, và mã hoá URL cho ký tự đặc biệt")
        print(f"            chi tiết: {str(error)[:160]}")
        sys.exit(1)
    except (ConfigurationError, PyMongoError) as error:
        print(f"  FAIL      chuỗi kết nối không hợp lệ — {str(error)[:200]}")
        sys.exit(1)

    print(f"  PASS      kết nối được — MongoDB {version}")

    names = client.list_database_names()
    target = args.db
    if target in names:
        stats = client[target].command("dbStats")
        collections = client[target].list_collection_names()
        print(f"  PASS      CSDL '{target}' đã có — {len(collections)} collection, "
              f"{(stats['dataSize'] + stats['indexSize']) / 1048576:.1f} MB")
    else:
        # Không phải lỗi: ứng dụng tự tạo CSDL và seed cấu hình nền khi khởi động.
        print(f"  CẢNH BÁO  CSDL '{target}' chưa tồn tại — ứng dụng sẽ tự tạo khi chạy lần đầu")
        print(f"            (các CSDL đang có: {', '.join(n for n in names if n not in ('admin', 'local', 'config')) or 'chưa có'})")

    print("\nDán nguyên chuỗi này vào MONGODB_URI trên Render, và đặt MONGODB_DB_NAME =", target)
    client.close()


if __name__ == "__main__":
    main()
