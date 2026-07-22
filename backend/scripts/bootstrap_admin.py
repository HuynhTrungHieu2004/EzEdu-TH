import sys
import argparse
import asyncio
import os
from pathlib import Path
from bson import ObjectId
from pymongo.errors import PyMongoError

# Ensure parent path can be imported
sys.path.append(str(Path(__file__).resolve().parent.parent))

from app.core.config import settings
from app.database.mongodb import get_database, connect_to_mongo, close_mongo_connection

async def promote_user(email: str | None, user_id: str | None, dry_run: bool, confirm_production: bool):
    await connect_to_mongo()
    db = get_database()
    
    # 1. Guard for production environment
    app_env = os.getenv("APP_ENV", "development").lower()
    if app_env == "production" and not confirm_production:
        print("ERROR: Bạn đang chạy trên môi trường PRODUCTION. Vui lòng thêm cờ --confirm-production để tiếp tục.")
        await close_mongo_connection()
        sys.exit(1)

    # 2. Build query filter
    query = {}
    if email:
        query["email"] = email
    elif user_id:
        try:
            query["_id"] = ObjectId(user_id)
        except Exception:
            print(f"ERROR: User ID '{user_id}' không hợp lệ (không phải là ObjectId).")
            await close_mongo_connection()
            sys.exit(1)
    else:
        print("ERROR: Phải chỉ định --email hoặc --user-id.")
        await close_mongo_connection()
        sys.exit(1)

    # 3. Find user
    user = await db["users"].find_one(query)
    if not user:
        print("ERROR: Không tìm thấy người dùng phù hợp trong hệ thống.")
        await close_mongo_connection()
        sys.exit(1)

    # 4. Check status and promote
    current_role = user.get("role", "user")
    print(f"Tìm thấy người dùng: {user['full_name']} ({user['email']}) với vai trò hiện tại: '{current_role}'")

    if current_role == "admin":
        print("Thông báo: Người dùng đã có vai trò 'admin' (Idempotent).")
        await close_mongo_connection()
        return

    if dry_run:
        print(f"[DRY RUN] Sẽ thăng quyền 'admin' cho người dùng: {user['email']}")
    else:
        try:
            res = await db["users"].update_one(
                {"_id": user["_id"]},
                {"$set": {"role": "admin"}}
            )
            if res.modified_count > 0:
                print(f"Thành công: Đã thăng quyền 'admin' cho người dùng: {user['email']}.")
            else:
                print("Lỗi: Không có tài liệu nào được cập nhật.")
        except PyMongoError as e:
            print(f"Lỗi cơ sở dữ liệu: {e}")

    await close_mongo_connection()

def main():
    parser = argparse.ArgumentParser(description="Bootstrap admin account promotion.")
    parser.add_argument("--email", type=str, help="Email của người dùng cần thăng quyền.")
    parser.add_argument("--user-id", type=str, help="User ID (ObjectId) của người dùng cần thăng quyền.")
    parser.add_argument("--dry-run", action="store_true", help="Chạy thử nghiệm không sửa đổi CSDL.")
    parser.add_argument("--confirm-production", action="store_true", help="Xác nhận chạy trên môi trường production.")

    args = parser.parse_args()
    
    if not args.email and not args.user_id:
        print("ERROR: Phải chỉ định --email hoặc --user-id.")
        sys.exit(1)

    email_arg = args.email
    user_id_arg = args.user_id

    asyncio.run(promote_user(
        email=email_arg,
        user_id=user_id_arg,
        dry_run=args.dry_run,
        confirm_production=args.confirm_production
    ))

if __name__ == "__main__":
    main()
