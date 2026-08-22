"""Nạp nguồn tri thức đã duyệt thành chunk tìm kiếm được — chạy qua hàng đợi
job nền (không chạy trong request HTTP, đúng nguyên tắc đã đặt từ Giai đoạn
2: `background_job_service.py` đã ghi chú trước "ingest kho tri thức chuẩn
dài hơi" là tác vụ MỚI dùng module này).

Dùng riêng 1 Chroma collection (không chung với `document_chunks` của
`rag_service.py`, vốn chỉ lọc theo `document_id`/`user_id` — kho tri thức
chuẩn cần lọc theo môn/lớp/chủ đề, khác trục dữ liệu hoàn toàn) — nhưng tái
sử dụng NGUYÊN VẸN cơ chế embedding (Gemini + fallback local) đã có ở
`rag_service.py`, không viết lại.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId
from fastapi import HTTPException, status

from app.curriculum_kb.constants.collections import CURRICULUM_SOURCES
from app.services.rag_service import build_embeddings, build_query_embedding, init_chroma_client
from app.services.text_chunking_service import split_text_into_chunks

INGEST_JOB_TYPE = "ingest_curriculum_source"
_COLLECTION_PREFIX = "curriculum_kb_chunks"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _collection_name(source: str, dimension: int) -> str:
    return f"{_COLLECTION_PREFIX}_{source}_{dimension}d"


def _get_collection(source: str, dimension: int):
    client = init_chroma_client()
    return client.get_or_create_collection(name=_collection_name(source, dimension), metadata={"hnsw:space": "cosine"})


async def enqueue_ingestion(db, source_id: str, *, actor_id: str, is_admin: bool) -> None:
    from app.curriculum_kb.services.registry_service import load_owned_source
    from app.services.background_job_service import enqueue

    source = await load_owned_source(db, source_id, actor_id=actor_id, is_admin=is_admin)
    if source["review_status"] not in ("approved", "published"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Chỉ nạp vào kho tri thức được khi nguồn đã ở trạng thái 'approved' hoặc 'published'.",
        )

    await db[CURRICULUM_SOURCES].update_one(
        {"_id": ObjectId(source_id)}, {"$set": {"ingest_status": "pending", "ingest_error": None, "updated_at": _now()}}
    )
    await enqueue(
        db,
        job_type=INGEST_JOB_TYPE,
        payload={"source_id": source_id},
        idempotency_key=f"ingest:{source_id}:{source['version']}",
    )


async def _delete_source_chunks(client, source_id: str) -> None:
    for collection in client.list_collections():
        name = getattr(collection, "name", str(collection))
        if name.startswith(_COLLECTION_PREFIX):
            try:
                client.get_collection(name).delete(where={"source_id": source_id})
            except Exception:  # noqa: BLE001 - dọn chunk cũ thất bại không được chặn nạp lại
                pass


async def delete_dataset_chunks(dataset_key: str) -> None:
    client = init_chroma_client()
    for collection in client.list_collections():
        name = getattr(collection, "name", str(collection))
        if name.startswith(_COLLECTION_PREFIX):
            client.get_collection(name).delete(where={"dataset_key": dataset_key})


async def ingest_curriculum_source_job(db, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Handler cho job `ingest_curriculum_source` — gọi từ `app/worker.py`."""
    source_id = payload["source_id"]
    source = await db[CURRICULUM_SOURCES].find_one({"_id": ObjectId(source_id)})
    if source is None:
        return {"skipped": "source_not_found"}

    try:
        chunks = split_text_into_chunks(source["content_text"])
        if not chunks:
            raise ValueError("Nội dung quá ngắn, không tách được đoạn nào để nạp.")
        max_chunks = payload.get("max_chunks")
        if max_chunks is not None and len(chunks) > max_chunks:
            raise ValueError(
                f"Source needs {len(chunks)} chunks but only {max_chunks} remain in the chunk budget."
            )

        client = init_chroma_client()
        await _delete_source_chunks(client, source_id)

        embed_source, embeddings = build_embeddings(chunks)
        dimension = len(embeddings[0]) if embeddings and embeddings[0] else 384
        collection = _get_collection(embed_source, dimension)

        now = _now()
        ids = [f"{source_id}:{i}" for i in range(len(chunks))]
        metadatas = [
            {
                "chunk_id": ids[i],
                "source_id": source_id,
                "subject_id": source["subject_id"],
                "grade": source.get("grade") or 0,
                "topic_id": source.get("topic_id") or "",
                "dataset_key": source.get("dataset_key") or "",
                "source_key": source.get("source_key") or "",
                "source_language": source.get("source_language") or "vi",
                "license_id": source.get("license_id") or "",
                "chunk_index": i,
                "created_at": now.isoformat(),
            }
            for i in range(len(chunks))
        ]
        collection.upsert(ids=ids, documents=chunks, embeddings=embeddings, metadatas=metadatas)

        await db[CURRICULUM_SOURCES].update_one(
            {"_id": ObjectId(source_id)},
            {"$set": {"ingest_status": "ingested", "chunk_count": len(chunks), "ingest_error": None, "updated_at": now}},
        )
        return {"chunk_count": len(chunks)}
    except Exception as exc:  # noqa: BLE001 - ghi lại lỗi để hiện cho giáo viên, rồi ném lại cho background_job_service retry
        await db[CURRICULUM_SOURCES].update_one(
            {"_id": ObjectId(source_id)},
            {"$set": {"ingest_status": "failed", "ingest_error": str(exc), "updated_at": _now()}},
        )
        raise


async def search(
    db, *, query: str, subject_id: Optional[str] = None, grade: Optional[int] = None, topic_id: Optional[str] = None, n_results: int = 5
) -> List[Dict[str, Any]]:
    if not query.strip():
        return []

    embed_source, query_embedding = build_query_embedding(query)
    dimension = len(query_embedding) if query_embedding else 384
    collection = _get_collection(embed_source, dimension)

    filters = []
    if subject_id:
        filters.append({"subject_id": subject_id})
    if grade:
        filters.append({"grade": grade})
    if topic_id:
        filters.append({"topic_id": topic_id})
    where = {"$and": filters} if len(filters) > 1 else (filters[0] if filters else None)

    fetch_limit = max(n_results, min(n_results * 3, 30))
    try:
        raw = collection.query(
            query_embeddings=[query_embedding],
            n_results=fetch_limit,
            where=where,
            include=["documents", "metadatas", "distances"],
        )
    except Exception:  # noqa: BLE001 - collection rỗng/chưa tồn tại -> không có kết quả, không phải lỗi
        return []

    documents = raw.get("documents", [[]])[0]
    metadatas = raw.get("metadatas", [[]])[0]
    distances = raw.get("distances", [[]])[0]

    source_ids = list({m["source_id"] for m in metadatas})
    sources_by_id = {}
    if source_ids:
        cursor = db[CURRICULUM_SOURCES].find({"_id": {"$in": [ObjectId(sid) for sid in source_ids]}})
        async for doc in cursor:
            sources_by_id[str(doc["_id"])] = doc

    results = []
    for text, meta, distance in zip(documents, metadatas, distances):
        parent = sources_by_id.get(meta["source_id"])
        if parent is None or parent.get("review_status") != "published" or parent.get("ingest_status") != "ingested":
            continue
        results.append(
            {
                "chunk_id": meta.get("chunk_id") or f"{meta['source_id']}:{meta.get('chunk_index', 0)}",
                "source_id": meta["source_id"],
                "title": parent["title"],
                "chunk_text": text,
                "subject_id": parent["subject_id"],
                "grade": parent.get("grade"),
                "topic_id": parent.get("topic_id"),
                "dataset_key": parent.get("dataset_key"),
                "source_key": parent.get("source_key"),
                "source_language": parent.get("source_language", "vi"),
                "license_id": parent.get("license_id"),
                "citations": parent.get("citations", []),
                "relevance_score": max(0.0, 1.0 - float(distance)),
            }
        )
    results.sort(key=lambda r: r["relevance_score"], reverse=True)
    return results[:n_results]
