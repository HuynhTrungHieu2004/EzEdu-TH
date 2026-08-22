from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path

from app.curriculum_kb.services.catalog_service import load_manifest, load_taxonomy
from app.curriculum_kb.services.dataset_service import (
    dataset_coverage_report,
    import_dataset,
    resume_dataset,
    rollback_dataset,
)
from app.curriculum_kb.services.ingestion_service import ingest_curriculum_source_job

DEFAULT_TAXONOMY = Path(__file__).resolve().parent / "catalogs/ctgdpt_2018_grades_6_12.json"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Operate bounded curriculum datasets")
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("dry-run", "import"):
        command = commands.add_parser(name)
        command.add_argument("--manifest", type=Path, required=True)
        command.add_argument("--taxonomy", type=Path, default=DEFAULT_TAXONOMY)
    resume = commands.add_parser("resume")
    resume.add_argument("--dataset-key", required=True)
    report = commands.add_parser("report")
    report.add_argument("--dataset-key", required=True)
    rollback = commands.add_parser("rollback")
    rollback.add_argument("--dataset-key", required=True)
    rollback.add_argument("--confirm", required=True)
    return parser


async def run_command(args: argparse.Namespace, db) -> dict:
    if args.command in {"dry-run", "import"}:
        taxonomy = load_taxonomy(args.taxonomy)
        manifest = load_manifest(args.manifest, taxonomy=taxonomy)
        if args.command == "dry-run":
            result = await import_dataset(db, manifest, actor_id="cli", dry_run=True)
            return {"mode": "dry-run", "dataset_key": manifest.dataset_key, **result}
        result = await import_dataset(
            db,
            manifest,
            actor_id="cli",
            ingester=ingest_curriculum_source_job,
        )
        return {"mode": "import", "dataset_key": manifest.dataset_key, **result}
    if args.command == "resume":
        result = await resume_dataset(
            db,
            args.dataset_key,
            actor_id="cli",
            ingester=ingest_curriculum_source_job,
        )
        return {"mode": "resume", "dataset_key": args.dataset_key, **result}
    if args.command == "report":
        return await dataset_coverage_report(db, args.dataset_key)
    if args.confirm != args.dataset_key:
        raise ValueError("Rollback confirmation must exactly match dataset_key")
    return await rollback_dataset(db, args.dataset_key, dry_run=False)


async def _main() -> None:
    from app.database.mongodb import close_mongo_connection, connect_to_mongo, get_database

    args = build_parser().parse_args()
    await connect_to_mongo()
    try:
        result = await run_command(args, get_database())
        print(json.dumps(result, ensure_ascii=False, indent=2, default=str))
    finally:
        await close_mongo_connection()


if __name__ == "__main__":
    asyncio.run(_main())
