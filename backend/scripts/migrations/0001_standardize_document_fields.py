"""Migration mẫu — chuẩn hoá field dùng chung cho collection `documents`.

Đây là migration DEMO chứng minh khuôn mẫu cho mọi migration sau này (giai
đoạn 3–7) — theo đúng cấu trúc `scripts/bootstrap_admin.py` đã có: có
`--dry-run`, có guard production, kết nối/đóng Mongo rõ ràng, IDEMPOTENT
(bỏ qua bản ghi đã có field, chạy lại nhiều lần không gây hại).

Field được thêm vào MỖI document trong collection `documents` nếu CHƯA có:
- version: 1
- created_by: lấy từ field `user_id` đã có (documents hiện tại không phân
  biệt "người tạo" khác "người sở hữu" — chuẩn hoá bằng cách coi 2 khái niệm
  này là một cho dữ liệu đã tồn tại; document MỚI tạo sau migration này có
  thể set khác nhau nếu nghiệp vụ tương lai cần).
- updated_by: giống created_by (không có lịch sử "ai sửa lần cuối" cho dữ
  liệu cũ — chấp nhận suy đoán hợp lý này, ghi rõ trong log).
- deleted_at: None (chưa hỗ trợ soft-delete trước migration này).
- checksum: None — KHÔNG tính hồi tố (cần tải lại file gốc, tốn kém và một
  số bản ghi `local://` cũ có thể đã mất file). Để trống, checksum sẽ được
  tính cho các document mới upload sau khi giai đoạn 5 (Cloudinary) triển
  khai bước tính checksum lúc upload.

KHÔNG đổi/xoá field cũ nào — chỉ thêm field còn thiếu.

Chạy:
    python -m scripts.migrations.0001_standardize_document_fields --dry-run
    python -m scripts.migrations.0001_standardize_document_fields
    python -m scripts.migrations.0001_standardize_document_fields --rollback

(Chạy từ thư mục `backend/`, cùng cách chạy `scripts/bootstrap_admin.py`.)
"""

import argparse
import asyncio
import os
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parent.parent.parent))

from app.core.config import settings
from app.database.mongodb import get_database, connect_to_mongo, close_mongo_connection

COLLECTION = "documents"
NEW_FIELDS = ("version", "created_by", "updated_by", "deleted_at", "checksum")


async def run(dry_run: bool, confirm_production: bool, rollback: bool) -> None:
    await connect_to_mongo()
    db = get_database()

    app_env = os.getenv("APP_ENV", "development").lower()
    if app_env == "production" and not confirm_production:
        print("ERROR: Bạn đang chạy trên môi trường PRODUCTION. Vui lòng thêm cờ --confirm-production để tiếp tục.")
        await close_mongo_connection()
        sys.exit(1)

    if rollback:
        await _rollback(db, dry_run=dry_run)
    else:
        await _forward(db, dry_run=dry_run)

    await close_mongo_connection()


async def _forward(db, *, dry_run: bool) -> None:
    cursor = db[COLLECTION].find({})
    total = 0
    updated = 0
    skipped_already_done = 0

    async for doc in cursor:
        total += 1
        missing_fields = [f for f in NEW_FIELDS if f not in doc]
        if not missing_fields:
            skipped_already_done += 1
            continue

        owner_id = doc.get("user_id")
        update: dict = {}
        if "version" in missing_fields:
            update["version"] = 1
        if "created_by" in missing_fields:
            update["created_by"] = owner_id
        if "updated_by" in missing_fields:
            update["updated_by"] = owner_id
        if "deleted_at" in missing_fields:
            update["deleted_at"] = None
        if "checksum" in missing_fields:
            update["checksum"] = None

        if dry_run:
            print(f"[DRY RUN] Sẽ cập nhật document {doc['_id']}: thêm {list(update.keys())}")
        else:
            await db[COLLECTION].update_one({"_id": doc["_id"]}, {"$set": update})
            updated += 1

    print(
        f"Hoàn tất. Tổng số document: {total}. "
        f"{'Sẽ cập nhật' if dry_run else 'Đã cập nhật'}: {total - skipped_already_done}. "
        f"Đã có sẵn field (bỏ qua, idempotent): {skipped_already_done}."
    )


async def _rollback(db, *, dry_run: bool) -> None:
    """Gỡ lại field đã thêm — an toàn vì chưa có nghiệp vụ nào phụ thuộc
    các field này tại thời điểm migration demo này được tạo (giai đoạn 2).
    Nếu một giai đoạn sau đã bắt đầu ĐỌC các field này, KHÔNG dùng rollback
    này nữa — phải viết migration nghịch đảo mới phù hợp với trạng thái lúc
    đó.
    """
    filter_has_any_field = {"$or": [{f: {"$exists": True}} for f in NEW_FIELDS]}
    count = await db[COLLECTION].count_documents(filter_has_any_field)

    if dry_run:
        print(f"[DRY RUN] Sẽ gỡ {list(NEW_FIELDS)} khỏi {count} document.")
        return

    unset_fields = {f: "" for f in NEW_FIELDS}
    result = await db[COLLECTION].update_many(filter_has_any_field, {"$unset": unset_fields})
    print(f"Đã gỡ {list(NEW_FIELDS)} khỏi {result.modified_count} document.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Chuẩn hoá field dùng chung cho collection documents.")
    parser.add_argument("--dry-run", action="store_true", help="Chạy thử nghiệm không sửa đổi CSDL.")
    parser.add_argument("--confirm-production", action="store_true", help="Xác nhận chạy trên môi trường production.")
    parser.add_argument("--rollback", action="store_true", help="Gỡ lại field đã thêm bởi migration này.")
    args = parser.parse_args()

    asyncio.run(run(dry_run=args.dry_run, confirm_production=args.confirm_production, rollback=args.rollback))


if __name__ == "__main__":
    main()
