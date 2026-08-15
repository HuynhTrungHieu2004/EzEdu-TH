"""Tạo và dọn tài khoản/dữ liệu cho bộ kiểm thử chạy với backend thật.

`frontend/e2e/live-smoke.spec.ts` cần ba tài khoản có mật khẩu đã biết, trong đó
một tài khoản vai trò `admin` — không thể tạo qua API đăng ký nên phải nâng quyền
trực tiếp. Chạy xong nên dọn để dữ liệu kiểm thử không lẫn vào dữ liệu thật.

    python scripts/qa_live_accounts.py --setup      # tạo 3 tài khoản, nâng quyền admin
    python scripts/qa_live_accounts.py              # xem sẽ xoá những gì (dry run)
    python scripts/qa_live_accounts.py --cleanup    # xoá tài khoản + dữ liệu bộ kiểm sinh ra

Xoá bám theo tiền tố `qa-live-` (tài khoản), `QA Live ` (lớp) và các bản ghi tham
chiếu tới id của những tài khoản đó, nên không đụng dữ liệu thật.
"""

import argparse
import asyncio
import json
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parent.parent))

from app.core.security import get_password_hash
from app.database.mongodb import close_mongo_connection, connect_to_mongo, get_database
from datetime import datetime, timezone

PASSWORD = "QaLive#2026"
ACCOUNTS = [
    ("qa-live-lecturer@example.com", "QA Live Lecturer", "lecturer"),
    ("qa-live-student@example.com", "QA Live Student", "student"),
    ("qa-live-admin@example.com", "QA Live Admin", "admin"),
]
EMAIL_PREFIX = "^qa-live-"
CLASS_PREFIX = "^QA Live "
# Các collection ghi kèm khi bộ kiểm chạy; xoá theo id tài khoản QA.
# Nhóm sau do `live-ai.spec.ts` sinh ra (tải học liệu, sinh câu hỏi, làm đề).
REF_COLLECTIONS = (
    "user_activity_logs", "system_error_logs", "admin_audit_logs",
    "documents", "document_contents", "document_chunks",
    "question_sets", "questions", "question_attempts",
    "exam_blueprints", "exams", "exam_attempts",
    "ai_usage_events",
)
REF_FIELDS = (
    "user_id", "owner_id", "student_id", "teacher_id", "created_by",
    "admin_user_id", "target_id", "uploaded_by", "created_by_id", "actor_id",
)


async def setup(db) -> None:
    for email, full_name, role in ACCOUNTS:
        existing = await db["users"].find_one({"email": email})
        if existing:
            if existing.get("role") != role:
                await db["users"].update_one({"_id": existing["_id"]}, {"$set": {"role": role}})
                print(f"  cập nhật vai trò {email} -> {role}")
            else:
                print(f"  đã có {email} ({role})")
            continue
        now = datetime.now(timezone.utc)
        await db["users"].insert_one({
            "email": email,
            "full_name": full_name,
            "hashed_password": get_password_hash(PASSWORD),
            "role": role,
            "status": "active",
            "is_active": True,
            "email_verified": True,
            "permissions_override": [],
            "created_at": now,
            "updated_at": None,
            "last_login_at": None,
            "deleted_at": None,
        })
        print(f"  tạo {email} ({role})")
    print(f"Mật khẩu chung: {PASSWORD}")


async def collect(db) -> dict[str, list[dict]]:
    users = await db["users"].find({"email": {"$regex": EMAIL_PREFIX}}).to_list(None)
    ids = [str(user["_id"]) for user in users]
    plan: dict[str, list[dict]] = {"users": users}
    plan["classes"] = await db["classes"].find({"name": {"$regex": CLASS_PREFIX}}).to_list(None)
    for name in REF_COLLECTIONS:
        if not ids:
            plan[name] = []
            continue
        plan[name] = await db[name].find({"$or": [{field: {"$in": ids}} for field in REF_FIELDS]}).to_list(None)
    return plan


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--setup", action="store_true", help="Tạo tài khoản kiểm thử (idempotent).")
    parser.add_argument("--cleanup", action="store_true", help="Xóa tài khoản và dữ liệu bộ kiểm sinh ra.")
    parser.add_argument("--backup", type=str, default=None, help="Ghi bản sao JSON trước khi xóa.")
    args = parser.parse_args()

    await connect_to_mongo()
    db = get_database()
    try:
        if args.setup:
            await setup(db)
            return

        plan = await collect(db)
        for name, docs in plan.items():
            print(f"{name}: {len(docs)}")

        if not args.cleanup:
            print("\n[DRY RUN] chưa xóa gì. Thêm --cleanup để xóa.")
            return

        if args.backup:
            Path(args.backup).write_text(
                json.dumps({k: [{kk: str(vv) for kk, vv in d.items()} for d in v] for k, v in plan.items()},
                           ensure_ascii=False, indent=1),
                encoding="utf-8",
            )
            print(f"đã sao lưu: {args.backup}")

        # Vector trong ChromaDB không nằm trong Mongo — phải xoá riêng, nếu không
        # học liệu kiểm thử vẫn được RAG truy hồi sau khi bản ghi đã biến mất.
        for document in plan.get("documents", []):
            try:
                from app.services.rag_service import init_chroma_client, _delete_document_vectors

                _delete_document_vectors(init_chroma_client(), str(document["_id"]), str(document.get("owner_id")))
                print(f"  xóa vector ChromaDB của học liệu {document['_id']}")
            except Exception as error:  # pragma: no cover - Chroma có thể chưa chạy
                print(f"  CẢNH BÁO: không xoá được vector của {document['_id']}: {error}")

        for name, docs in plan.items():
            if docs:
                result = await db[name].delete_many({"_id": {"$in": [doc["_id"] for doc in docs]}})
                print(f"  xóa {name}: {result.deleted_count}")
        remaining = await db["users"].count_documents({"email": {"$regex": EMAIL_PREFIX}})
        print(f"còn lại tài khoản qa-live-*: {remaining}")
    finally:
        await close_mongo_connection()


if __name__ == "__main__":
    asyncio.run(main())
