from __future__ import annotations

import hashlib
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone

import httpx
from bson import ObjectId

from app.curriculum_kb.constants.collections import CURRICULUM_DATASET_RUNS, CURRICULUM_SOURCES
from app.curriculum_kb.schemas.dataset import CatalogSource, DatasetManifest, FetchedCurriculumSource
from app.curriculum_kb.services.catalog_fetch_service import fetch_catalog_source

Fetcher = Callable[[CatalogSource], Awaitable[FetchedCurriculumSource]]
Ingester = Callable[[object, dict], Awaitable[dict]]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def source_checksum(text: str, source_key: str, upstream_revision: str | None) -> str:
    normalized = "\n".join(
        line.rstrip()
        for line in text.replace("\r\n", "\n").replace("\r", "\n").splitlines()
    ).strip()
    payload = f"{source_key}\0{upstream_revision or ''}\0{normalized}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


async def _upsert_mapping_source(
    db,
    *,
    manifest: DatasetManifest,
    entry: CatalogSource,
    fetched: FetchedCurriculumSource,
    subject_id: str,
    grade: int,
    topic_id: str,
    actor_id: str,
    run_id: str,
) -> tuple[str, str]:
    stable_source_key = f"{entry.source_key}:{subject_id}:{grade}:{topic_id}"
    checksum = source_checksum(fetched.text or "", stable_source_key, fetched.upstream_revision)
    identity = {"dataset_key": manifest.dataset_key, "source_key": stable_source_key}
    existing = await db[CURRICULUM_SOURCES].find_one(identity)
    now = _now()
    audit_fields = {
        "manifest_version": manifest.manifest_version,
        "source_checksum": checksum,
        "source_language": entry.language,
        "canonical_url": fetched.canonical_url,
        "license_id": entry.license_id,
        "license_url": str(entry.license_url),
        "attribution": entry.attribution,
        "upstream_revision": fetched.upstream_revision,
        "accessed_at": fetched.accessed_at,
        "page_or_section_refs": fetched.page_or_section_refs,
        "noncommercial_only": entry.noncommercial_only,
        "demo_disposal_required": entry.demo_disposal_required,
        "last_dataset_run_id": run_id,
        "updated_by": actor_id,
        "updated_at": now,
    }
    if existing and existing.get("source_checksum") == checksum:
        await db[CURRICULUM_SOURCES].update_one(identity, {"$set": audit_fields})
        return "unchanged", str(existing["_id"])

    content_fields = {
        **audit_fields,
        "title": fetched.title,
        "content_text": fetched.text,
        "subject_id": subject_id,
        "grade": grade,
        "topic_id": topic_id,
        "curriculum_version": manifest.curriculum_version,
        "citations": [{
            "title": fetched.title,
            "url": fetched.canonical_url,
            "accessed_at": fetched.accessed_at.isoformat(),
        }],
        "origin_type": "catalog",
        "origin_id": entry.source_key,
        "review_status": "approved",
        "quality_status": "verified",
        "ingest_status": "not_ingested",
        "chunk_count": 0,
        "ingest_error": None,
        "owner_id": actor_id,
    }
    if existing:
        await db[CURRICULUM_SOURCES].update_one(identity, {"$set": content_fields, "$inc": {"version": 1}})
        return "updated", str(existing["_id"])

    inserted = await db[CURRICULUM_SOURCES].insert_one({
        **identity,
        **content_fields,
        "version": 1,
        "created_by": actor_id,
        "created_at": now,
    })
    return "created", str(inserted.inserted_id)


async def _used_dataset_chunks(db, dataset_key: str) -> int:
    total = 0
    async for source in db[CURRICULUM_SOURCES].find({"dataset_key": dataset_key}, {"chunk_count": 1}):
        total += int(source.get("chunk_count", 0))
    return total


async def _execute_import(
    db,
    manifest: DatasetManifest,
    *,
    actor_id: str,
    fetcher: Fetcher,
    mode: str,
    ingester: Ingester | None = None,
) -> dict:
    running = await db[CURRICULUM_DATASET_RUNS].find_one({
        "dataset_key": manifest.dataset_key,
        "manifest_version": manifest.manifest_version,
        "status": "running",
    })
    if running:
        raise RuntimeError(f"Dataset {manifest.dataset_key} is already running")

    now = _now()
    run_doc = {
        "dataset_key": manifest.dataset_key,
        "manifest_version": manifest.manifest_version,
        "mode": mode,
        "status": "running",
        "actor_id": actor_id,
        "manifest": manifest.model_dump(mode="json", exclude={"requested_chunk_count"}),
        "created": 0,
        "updated": 0,
        "unchanged": 0,
        "quarantined": 0,
        "failed": 0,
        "ingested": 0,
        "quarantined_source_keys": [],
        "failed_source_keys": [],
        "errors": [],
        "started_at": now,
        "finished_at": None,
    }
    inserted = await db[CURRICULUM_DATASET_RUNS].insert_one(run_doc)
    run_id = str(inserted.inserted_id)

    for entry in manifest.sources:
        try:
            fetched = await fetcher(entry)
            if fetched.disposition != "accepted" or not fetched.text:
                run_doc["quarantined"] += 1
                run_doc["quarantined_source_keys"].append(entry.source_key)
                run_doc["errors"].append({"source_key": entry.source_key, "reason": fetched.reason or "quarantined"})
                continue
            for mapping in entry.mappings:
                for grade in mapping.grades:
                    for topic_id in mapping.topic_ids:
                        outcome, source_id = await _upsert_mapping_source(
                            db,
                            manifest=manifest,
                            entry=entry,
                            fetched=fetched,
                            subject_id=mapping.subject_id,
                            grade=grade,
                            topic_id=topic_id,
                            actor_id=actor_id,
                            run_id=run_id,
                        )
                        run_doc[outcome] += 1
                        if outcome in {"created", "updated"} and ingester is not None:
                            remaining = manifest.chunk_limit - await _used_dataset_chunks(db, manifest.dataset_key)
                            if remaining <= 0:
                                raise ValueError("Dataset has exhausted its chunk budget")
                            await ingester(db, {"source_id": source_id, "max_chunks": remaining})
                            await db[CURRICULUM_SOURCES].update_one(
                                {"_id": ObjectId(source_id)},
                                {"$set": {"review_status": "published", "updated_at": _now()}},
                            )
                            run_doc["ingested"] += 1
        except Exception as exc:  # isolate one upstream source from the dataset run
            run_doc["failed"] += 1
            run_doc["failed_source_keys"].append(entry.source_key)
            run_doc["errors"].append({"source_key": entry.source_key, "reason": f"{type(exc).__name__}: {exc}"[:500]})

    run_doc["status"] = "completed_with_errors" if run_doc["failed"] or run_doc["quarantined"] else "completed"
    run_doc["finished_at"] = _now()
    result_fields = {key: value for key, value in run_doc.items() if key not in {"_id", "manifest", "started_at"}}
    await db[CURRICULUM_DATASET_RUNS].update_one({"_id": inserted.inserted_id}, {"$set": result_fields})
    return {key: run_doc[key] for key in ("created", "updated", "unchanged", "quarantined", "failed", "ingested")}


async def import_dataset(
    db,
    manifest: DatasetManifest,
    *,
    actor_id: str,
    dry_run: bool = False,
    fetcher: Fetcher | None = None,
    ingester: Ingester | None = None,
) -> dict:
    if dry_run:
        return {
            "created": 0,
            "updated": 0,
            "unchanged": 0,
            "quarantined": 0,
            "failed": 0,
            "planned_sources": len(manifest.sources),
            "requested_chunks": manifest.requested_chunk_count,
        }
    if fetcher is not None:
        return await _execute_import(
            db, manifest, actor_id=actor_id, fetcher=fetcher, mode="import", ingester=ingester
        )
    async with httpx.AsyncClient(timeout=30.0, headers={"User-Agent": "EzEduCurriculumBot/1.0"}) as client:
        async def live_fetch(entry: CatalogSource) -> FetchedCurriculumSource:
            return await fetch_catalog_source(entry, http_client=client)

        return await _execute_import(
            db, manifest, actor_id=actor_id, fetcher=live_fetch, mode="import", ingester=ingester
        )


async def resume_dataset(
    db,
    dataset_key: str,
    *,
    actor_id: str,
    fetcher: Fetcher | None = None,
    ingester: Ingester | None = None,
) -> dict:
    previous = await db[CURRICULUM_DATASET_RUNS].find_one(
        {"dataset_key": dataset_key, "failed_source_keys": {"$ne": []}},
        sort=[("started_at", -1)],
    )
    if not previous:
        raise ValueError(f"No failed dataset run found for {dataset_key}")
    manifest = DatasetManifest.model_validate(previous["manifest"])
    failed = set(previous["failed_source_keys"])
    retry_manifest = manifest.model_copy(update={
        "sources": [source for source in manifest.sources if source.source_key in failed]
    })
    if fetcher is not None:
        return await _execute_import(
            db, retry_manifest, actor_id=actor_id, fetcher=fetcher, mode="resume", ingester=ingester
        )
    async with httpx.AsyncClient(timeout=30.0, headers={"User-Agent": "EzEduCurriculumBot/1.0"}) as client:
        async def live_fetch(entry: CatalogSource) -> FetchedCurriculumSource:
            return await fetch_catalog_source(entry, http_client=client)

        return await _execute_import(
            db, retry_manifest, actor_id=actor_id, fetcher=live_fetch, mode="resume", ingester=ingester
        )


async def rollback_dataset(db, dataset_key: str, *, dry_run: bool = True) -> dict:
    source_count = await db[CURRICULUM_SOURCES].count_documents({"dataset_key": dataset_key})
    chunk_count = await _used_dataset_chunks(db, dataset_key)
    preview = {"dataset_key": dataset_key, "source_count": source_count, "chunk_count": chunk_count}
    if dry_run:
        return preview

    from app.curriculum_kb.services.ingestion_service import delete_dataset_chunks

    await delete_dataset_chunks(dataset_key)
    deleted = await db[CURRICULUM_SOURCES].delete_many({"dataset_key": dataset_key})
    await db[CURRICULUM_DATASET_RUNS].delete_many({"dataset_key": dataset_key})
    now = _now()
    await db[CURRICULUM_DATASET_RUNS].insert_one({
        "dataset_key": dataset_key,
        "manifest_version": 0,
        "mode": "rollback",
        "status": "completed",
        "deleted_sources": deleted.deleted_count,
        "deleted_chunks": chunk_count,
        "started_at": now,
        "finished_at": now,
    })
    return {**preview, "deleted_sources": deleted.deleted_count, "deleted_chunks": chunk_count}


async def dataset_coverage_report(db, dataset_key: str) -> dict:
    coverage: dict[tuple[str, int, str, str], dict] = {}
    source_count = chunk_count = 0
    async for source in db[CURRICULUM_SOURCES].find({"dataset_key": dataset_key}):
        source_count += 1
        chunks = int(source.get("chunk_count", 0))
        chunk_count += chunks
        key = (
            source.get("subject_id") or "unknown",
            int(source.get("grade") or 0),
            source.get("source_language") or "unknown",
            source.get("license_id") or "unknown",
        )
        item = coverage.setdefault(key, {
            "subject_id": key[0],
            "grade": key[1],
            "source_language": key[2],
            "license_id": key[3],
            "source_count": 0,
            "chunk_count": 0,
        })
        item["source_count"] += 1
        item["chunk_count"] += chunks
    latest = await db[CURRICULUM_DATASET_RUNS].find_one(
        {"dataset_key": dataset_key},
        sort=[("started_at", -1)],
    )
    if latest:
        latest = {
            key: latest.get(key)
            for key in ("manifest_version", "mode", "status", "started_at", "finished_at")
        }
    return {
        "dataset_key": dataset_key,
        "source_count": source_count,
        "chunk_count": chunk_count,
        "coverage": [coverage[key] for key in sorted(coverage)],
        "latest_run": latest,
    }
