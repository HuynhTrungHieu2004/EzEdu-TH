import sys
import asyncio
import argparse
import logging
from datetime import datetime, timezone
from pathlib import Path

# Add backend directory to sys.path to import app modules
sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.core.config import settings
from app.database.mongodb import get_database, connect_to_mongo
from app.utils.normalization import normalize_title

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("migration")

async def run_migration(dry_run: bool, batch_size: int, force_production: bool):
    # Guard against accidental production execution
    if settings.APP_ENV == "production" and not force_production:
        logger.error(
            "CẢNH BÁO: Bạn đang chạy trên môi trường PRODUCTION. "
            "Để tiếp tục, bạn phải truyền tham số --force-production."
        )
        sys.exit(1)

    logger.info("Khởi động kết nối MongoDB...")
    await connect_to_mongo()
    db = get_database()

    # Query for any conversation missing one or more of the new fields
    query = {
        "$or": [
            {"is_pinned": {"$exists": False}},
            {"pinned_at": {"$exists": False}},
            {"deleted_at": {"$exists": False}},
            {"normalized_title": {"$exists": False}}
        ]
    }

    total_count = await db["conversations"].count_documents(query)
    logger.info(f"Tìm thấy {total_count} hội thoại cần di cư dữ liệu.")

    if total_count == 0:
        logger.info("Không có hội thoại nào cần di cư.")
        return

    if dry_run:
        logger.info("[DRY RUN] Chế độ thử nghiệm hoạt động: Không ghi dữ liệu vào CSDL.")

    processed = 0
    batch = []
    
    cursor = db["conversations"].find(query)
    async for conv in cursor:
        conv_id = conv["_id"]
        title = conv.get("title", "")
        
        is_pinned = conv.get("is_pinned", False)
        pinned_at = conv.get("pinned_at", None)
        deleted_at = conv.get("deleted_at", None)
        normalized_title = normalize_title(title)

        update_doc = {
            "is_pinned": is_pinned,
            "pinned_at": pinned_at,
            "deleted_at": deleted_at,
            "normalized_title": normalized_title
        }
        
        batch.append((conv_id, update_doc))
        
        if len(batch) >= batch_size:
            await process_batch(db, batch, dry_run)
            processed += len(batch)
            logger.info(f"Đã xử lý {processed}/{total_count} hội thoại.")
            batch = []

    # Process remaining documents in batch
    if batch:
        await process_batch(db, batch, dry_run)
        processed += len(batch)
        logger.info(f"Đã xử lý {processed}/{total_count} hội thoại.")

    logger.info("Hoàn tất di cư dữ liệu hội thoại.")

async def process_batch(db, batch, dry_run: bool):
    if dry_run:
        for conv_id, update_doc in batch:
            logger.info(f"[DRY RUN] Sẽ cập nhật hội thoại {conv_id} với: {update_doc}")
    else:
        for conv_id, update_doc in batch:
            await db["conversations"].update_one(
                {"_id": conv_id},
                {"$set": update_doc}
            )

def main():
    parser = argparse.ArgumentParser(description="Migration script for Prompt 10 Conversation fields.")
    parser.add_argument("--dry-run", action="store_true", help="Chạy thử nghiệm không sửa đổi CSDL.")
    parser.add_argument("--batch-size", type=int, default=100, help="Kích thước lô xử lý.")
    parser.add_argument("--force-production", action="store_true", help="Xác nhận chạy trên môi trường production.")
    
    args = parser.parse_args()
    
    asyncio.run(run_migration(
        dry_run=args.dry_run,
        batch_size=args.batch_size,
        force_production=args.force_production
    ))

if __name__ == "__main__":
    main()
