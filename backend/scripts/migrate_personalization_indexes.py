import argparse
import asyncio
import logging
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.core.config import settings
from app.database.mongodb import close_mongo_connection, connect_to_mongo, get_database
from app.personalization.repositories.indexes import (
    create_personalization_indexes,
    iter_personalization_indexes,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("personalization_migration")


async def run_migration(dry_run: bool, force_production: bool) -> list[str]:
    if settings.APP_ENV == "production" and not force_production:
        logger.error(
            "You are running in production. Pass --force-production to create indexes."
        )
        sys.exit(1)

    if dry_run:
        logger.info("[DRY RUN] No database changes will be made.")
        index_names = []
        for spec in iter_personalization_indexes():
            logger.info("[DRY RUN] Would create index %s on %s.", spec.name, spec.collection)
            index_names.append(spec.name)
        logger.info("Personalization index migration completed: %s indexes.", len(index_names))
        return index_names

    await connect_to_mongo()
    try:
        db = get_database()
        index_names = await create_personalization_indexes(db, dry_run=dry_run)
        logger.info("Personalization index migration completed: %s indexes.", len(index_names))
        return index_names
    finally:
        await close_mongo_connection()


def main():
    parser = argparse.ArgumentParser(description="Create personalization MongoDB indexes.")
    parser.add_argument("--dry-run", action="store_true", help="Show intended index creation without writing.")
    parser.add_argument("--force-production", action="store_true", help="Allow execution when APP_ENV=production.")
    args = parser.parse_args()

    asyncio.run(run_migration(dry_run=args.dry_run, force_production=args.force_production))


if __name__ == "__main__":
    main()
