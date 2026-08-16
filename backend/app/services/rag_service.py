import hashlib
import logging
import math
import re
from datetime import datetime, timezone
from pathlib import Path

import chromadb
import numpy as np

from app.core.config import settings
from app.database.mongodb import get_database
from app.services.llm_service import get_embedding, get_embeddings

logger = logging.getLogger(__name__)

COLLECTION_NAME = "document_chunks"
EMBEDDING_DIMENSION = 384
TEXT_PREVIEW_LENGTH = 180
BACKEND_DIR = Path(__file__).resolve().parents[2]


def _resolve_chroma_persist_dir() -> Path:
    persist_dir = Path(settings.CHROMA_PERSIST_DIR or "./chroma_db")
    if not persist_dir.is_absolute():
        persist_dir = BACKEND_DIR / persist_dir
    persist_dir.mkdir(parents=True, exist_ok=True)
    return persist_dir


def init_chroma_client():
    """Tạo client ChromaDB theo chế độ đã cấu hình.

    `persistent` (mặc định): đọc/ghi thẳng thư mục cục bộ, không cần dựng thêm
    dịch vụ nào. Chỉ đúng khi backend chạy một tiến trình duy nhất — Chroma
    lưu bằng SQLite nên nhiều tiến trình sẽ không thấy dữ liệu vector của nhau.

    `http`: nối tới một Chroma server dùng chung, bắt buộc khi chạy nhiều
    worker hoặc nhiều máy chủ.
    """
    mode = settings.CHROMA_MODE
    if mode == "persistent":
        return chromadb.PersistentClient(path=str(_resolve_chroma_persist_dir()))
    if mode == "http":
        headers = (
            {"Authorization": f"Bearer {settings.CHROMA_AUTH_TOKEN}"}
            if settings.CHROMA_AUTH_TOKEN
            else None
        )
        return chromadb.HttpClient(
            host=settings.CHROMA_HOST,
            port=settings.CHROMA_PORT,
            ssl=settings.CHROMA_SSL,
            headers=headers,
        )
    raise ValueError(f"CHROMA_MODE không hợp lệ: {mode!r}. Chỉ nhận 'persistent' hoặc 'http'.")


def _managed_collection_names(client) -> list[str]:
    names: list[str] = []
    for collection in client.list_collections():
        collection_name = getattr(collection, "name", str(collection))
        if collection_name == COLLECTION_NAME or collection_name.startswith(f"{COLLECTION_NAME}_"):
            names.append(collection_name)
    return names


def _build_collection_name(source: str, dimension: int) -> str:
    safe_source = re.sub(r"[^a-z0-9]+", "_", source.lower()).strip("_") or "unknown"
    return f"{COLLECTION_NAME}_{safe_source}_{dimension}d"


def _get_collection(source: str, dimension: int):
    client = init_chroma_client()
    return client.get_or_create_collection(
        name=_build_collection_name(source, dimension),
        metadata={"hnsw:space": "cosine"},
    )


def _delete_document_vectors(client, document_id: str, user_id: str) -> None:
    owner_filter = _build_owner_filter(document_id, user_id)
    for collection_name in _managed_collection_names(client):
        try:
            client.get_collection(collection_name).delete(where=owner_filter)
        except Exception as exc:
            logger.warning("Failed to clean vectors from collection %s: %s", collection_name, exc.__class__.__name__)


def _build_owner_filter(document_id: str, user_id: str) -> dict:
    return {"$and": [{"document_id": document_id}, {"user_id": user_id}]}


def _normalize_vector(vector: list[float]) -> list[float]:
    norm = math.sqrt(sum(value * value for value in vector))
    if norm == 0:
        return vector
    return [value / norm for value in vector]


def _local_hash_embedding(text: str, dimension: int = EMBEDDING_DIMENSION) -> list[float]:
    """Generate a deterministic local embedding so indexing/search still works without external AI."""
    vector = np.zeros(dimension, dtype=np.float32)
    tokens = re.findall(r"\w+", text.lower())
    if not tokens:
        return vector.tolist()

    for token in tokens:
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "big") % dimension
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        weight = 1.0 + (digest[5] / 255.0)
        vector[index] += sign * weight

    norm = np.linalg.norm(vector)
    if norm != 0:
        vector = vector / norm
    return vector.astype(float).tolist()


def _local_hash_embeddings(texts: list[str]) -> list[list[float]]:
    return [_local_hash_embedding(text) for text in texts]


def _token_set(text: str) -> set[str]:
    return set(re.findall(r"\w+", (text or "").lower()))


def _lexical_overlap_score(query: str, text: str) -> float:
    query_tokens = _token_set(query)
    text_tokens = _token_set(text)
    if not query_tokens or not text_tokens:
        return 0.0
    return len(query_tokens & text_tokens) / len(query_tokens)


def _rerank_chunks(query: str, chunks: list[dict], limit: int) -> list[dict]:
    reranked = []
    for chunk in chunks:
        distance = float(chunk.get("distance", 1.0))
        vector_score = max(0.0, 1.0 - distance)
        lexical_score = _lexical_overlap_score(query, chunk.get("text", ""))
        rerank_score = (vector_score * 0.75) + (lexical_score * 0.25)
        enriched = dict(chunk)
        enriched["rerank_score"] = round(rerank_score, 6)
        enriched["lexical_score"] = round(lexical_score, 6)
        reranked.append(enriched)
    reranked.sort(key=lambda item: item.get("rerank_score", 0.0), reverse=True)
    return reranked[:limit]


def build_embeddings(texts: list[str]) -> tuple[str, list[list[float]]]:
    if not texts:
        return "local", []

    if settings.GEMINI_API_KEY:
        try:
            return "gemini", [_normalize_vector(embedding) for embedding in get_embeddings(texts)]
        except Exception as exc:
            logger.warning("Falling back to local embeddings because Gemini embeddings failed: %s", exc.__class__.__name__)

    return "local", _local_hash_embeddings(texts)


def build_query_embedding(text: str) -> tuple[str, list[float]]:
    if settings.GEMINI_API_KEY:
        try:
            return "gemini", _normalize_vector(get_embedding(text))
        except Exception as exc:
            logger.warning("Falling back to local query embedding because Gemini query embedding failed: %s", exc.__class__.__name__)

    return "local", _local_hash_embedding(text)


async def add_document_chunks(document_id: str, user_id: str, chunks: list[str]):
    """
    Persist chunk metadata in MongoDB and vector embeddings in ChromaDB.
    """
    if not chunks:
        return

    db = get_database()
    source, embeddings = build_embeddings(chunks)
    if not embeddings:
        return

    dimension = len(embeddings[0]) if embeddings[0] else EMBEDDING_DIMENSION
    client = init_chroma_client()
    collection = _get_collection(source, dimension)
    now = datetime.now(timezone.utc)

    await db["document_chunks"].delete_many({"document_id": document_id, "user_id": user_id})
    _delete_document_vectors(client, document_id, user_id)

    chunk_docs = []
    chroma_ids = []
    chroma_metadatas = []

    for index, chunk in enumerate(chunks):
        chunk_id = f"{document_id}:{index}"
        preview = chunk[:TEXT_PREVIEW_LENGTH]

        chunk_docs.append(
            {
                "document_id": document_id,
                "user_id": user_id,
                "chunk_index": index,
                "text_preview": preview,
                "content": chunk,
                # Lưu luôn vector vào MongoDB, không chỉ vào ChromaDB.
                #
                # ChromaDB nằm trên ổ đĩa container, mà gói miễn phí của Render
                # không có ổ đĩa bền — mỗi lần deploy là mất sạch. Có vector ở
                # đây thì `rebuild_chroma_from_mongo()` dựng lại được mà không
                # gọi API nhúng lần nào. Không có thì phải nhúng lại toàn bộ học
                # liệu sau mỗi lần deploy, đốt hạn mức Gemini.
                #
                # Tốn khoảng 6KB mỗi đoạn (768 số thực). Với M0 512MB thì chứa
                # được cỡ 80.000 đoạn — thừa cho quy mô hiện tại.
                "embedding": embeddings[index],
                "created_at": now,
            }
        )
        chroma_ids.append(chunk_id)
        chroma_metadatas.append(
            {
                "document_id": document_id,
                "user_id": user_id,
                "chunk_index": index,
                "text_preview": preview,
                "created_at": now.isoformat(),
            }
        )

    collection.upsert(
        ids=chroma_ids,
        documents=chunks,
        embeddings=embeddings,
        metadatas=chroma_metadatas,
    )
    await db["document_chunks"].insert_many(chunk_docs)


async def search_relevant_chunks(document_id: str, user_id: str, query: str, n_results: int = 5) -> list[dict]:
    """
    Search relevant chunks for a document/user pair from ChromaDB.
    """
    if not query.strip():
        return []

    source, query_embedding = build_query_embedding(query)
    dimension = len(query_embedding) if query_embedding else EMBEDDING_DIMENSION
    collection = _get_collection(source, dimension)
    fetch_limit = max(n_results, min(n_results * 3, 30))
    raw_results = collection.query(
        query_embeddings=[query_embedding],
        n_results=fetch_limit,
        where=_build_owner_filter(document_id, user_id),
        include=["documents", "metadatas", "distances"],
    )

    ids = raw_results.get("ids", [[]])[0]
    documents = raw_results.get("documents", [[]])[0]
    metadatas = raw_results.get("metadatas", [[]])[0]
    distances = raw_results.get("distances", [[]])[0]

    results = []
    for index, chunk_id in enumerate(ids):
        metadata = metadatas[index] or {}
        results.append(
            {
                "id": chunk_id,
                "text": documents[index],
                "metadata": {
                    "chunk_index": int(metadata.get("chunk_index", index)),
                    "document_id": metadata.get("document_id", document_id),
                    "text_preview": metadata.get("text_preview", ""),
                    "created_at": metadata.get("created_at"),
                },
                "distance": float(distances[index]) if index < len(distances) else 0.0,
            }
        )

    return _rerank_chunks(query, results, n_results)


async def search_user_chunks_advanced(
    user_id: str,
    query: str,
    document_ids: list[str] = None,
    n_results: int = 5,
) -> list[dict]:
    """
    Search relevant chunks across all or selected documents owned by the user.
    """
    if not query.strip():
        return []

    source, query_embedding = build_query_embedding(query)
    dimension = len(query_embedding) if query_embedding else EMBEDDING_DIMENSION
    collection = _get_collection(source, dimension)

    # Build ChromaDB filter
    if document_ids:
        if len(document_ids) == 1:
            where_filter = {
                "$and": [
                    {"user_id": user_id},
                    {"document_id": document_ids[0]}
                ]
            }
        else:
            where_filter = {
                "$and": [
                    {"user_id": user_id},
                    {"document_id": {"$in": document_ids}}
                ]
            }
    else:
        where_filter = {"user_id": user_id}

    fetch_limit = max(n_results, min(n_results * 3, 30))
    raw_results = collection.query(
        query_embeddings=[query_embedding],
        n_results=fetch_limit,
        where=where_filter,
        include=["documents", "metadatas", "distances"],
    )

    ids = raw_results.get("ids", [[]])[0]
    documents = raw_results.get("documents", [[]])[0]
    metadatas = raw_results.get("metadatas", [[]])[0]
    distances = raw_results.get("distances", [[]])[0]

    results = []
    for index, chunk_id in enumerate(ids):
        metadata = metadatas[index] or {}
        results.append(
            {
                "id": chunk_id,
                "text": documents[index],
                "metadata": {
                    "chunk_index": int(metadata.get("chunk_index", index)),
                    "document_id": metadata.get("document_id", ""),
                    "text_preview": metadata.get("text_preview", ""),
                    "created_at": metadata.get("created_at"),
                },
                "distance": float(distances[index]) if index < len(distances) else 0.0,
            }
        )

    return _rerank_chunks(query, results, n_results)


def ping_chroma() -> bool:
    """Check health connection to ChromaDB"""
    try:
        cl = init_chroma_client()
        cl.heartbeat()
        return True
    except Exception:
        return False

# ─── Dựng lại kho vector sau khi container mất ổ đĩa ────────────────────────

async def dem_vector_va_doan() -> dict:
    """Đếm song song: Mongo có bao nhiêu đoạn, Chroma đang giữ bao nhiêu vector.

    Hai con số này phải bằng nhau. Lệch nghĩa là kho vector đã mất — và
    `ping_chroma()` KHÔNG phát hiện được, vì nó chỉ bắt tay với Chroma chứ
    không nhìn vào dữ liệu.
    """
    db = get_database()
    so_doan = await db["document_chunks"].count_documents({})

    so_vector = 0
    try:
        client = init_chroma_client()
        for ten in _managed_collection_names(client):
            so_vector += client.get_collection(ten).count()
    except Exception:  # noqa: BLE001 - Chroma hỏng thì coi như rỗng
        so_vector = 0

    return {"mongo_chunks": so_doan, "chroma_vectors": so_vector}


async def rebuild_chroma_from_mongo() -> dict:
    """Nạp lại kho vector từ `document_chunks` trong MongoDB.

    Gói miễn phí của Render không có ổ đĩa bền: mỗi lần deploy là container mới
    và thư mục Chroma trắng trơn. Trước đây phải lập chỉ mục lại toàn bộ học
    liệu bằng tay, và hỏi đáp có trích dẫn im lặng không tìm được gì cho tới khi
    ai đó nhận ra.

    KHÔNG gọi API nhúng lần nào: `document_chunks` đã lưu sẵn `embedding` cùng
    `content`. Nếu phải nhúng lại thì mỗi lần container khởi động lại sẽ đốt hạn
    mức Gemini, và Render free khởi động lại rất thường — cách đó tệ hơn cả việc
    để kho vector rỗng.

    Idempotent: dùng `upsert` theo đúng id `"{document_id}:{chunk_index}"` mà
    `add_document_chunks` sinh ra, nên chạy nhiều lần không nhân đôi.
    """
    db = get_database()
    theo_kich_thuoc: dict[int, dict[str, list]] = {}
    bo_qua = 0

    cursor = db["document_chunks"].find(
        {}, {"document_id": 1, "user_id": 1, "chunk_index": 1, "content": 1, "embedding": 1, "text_preview": 1}
    )
    async for doc in cursor:
        vector = doc.get("embedding")
        if not vector:
            # Đoạn cũ lưu trước khi hệ thống bắt đầu giữ vector. Bỏ qua thay vì
            # nhúng lại: nhúng lại ở đây biến hàm "dựng lại miễn phí" thành hàm
            # đốt hạn mức, đúng thứ ghi chú phía trên nói phải tránh.
            bo_qua += 1
            continue

        nhom = theo_kich_thuoc.setdefault(
            len(vector), {"ids": [], "documents": [], "embeddings": [], "metadatas": []}
        )
        nhom["ids"].append(f"{doc['document_id']}:{doc.get('chunk_index', 0)}")
        nhom["documents"].append(doc.get("content") or "")
        nhom["embeddings"].append(vector)
        nhom["metadatas"].append({
            "document_id": doc["document_id"],
            "user_id": doc.get("user_id", ""),
            "chunk_index": doc.get("chunk_index", 0),
            "text_preview": doc.get("text_preview") or (doc.get("content") or "")[:TEXT_PREVIEW_LENGTH],
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    da_nap = 0
    for kich_thuoc, nhom in theo_kich_thuoc.items():
        if not nhom["ids"]:
            continue
        # Tên collection mã hoá cả nguồn nhúng lẫn số chiều. Số chiều suy từ
        # chính vector đã lưu; đoán sai thì Chroma từ chối vì lệch chiều.
        nguon = "gemini" if kich_thuoc != EMBEDDING_DIMENSION else "local"
        collection = _get_collection(nguon, kich_thuoc)
        collection.upsert(
            ids=nhom["ids"],
            documents=nhom["documents"],
            embeddings=nhom["embeddings"],
            metadatas=nhom["metadatas"],
        )
        da_nap += len(nhom["ids"])

    if da_nap or bo_qua:
        logger.info("Đã nạp lại %s vector từ MongoDB, bỏ qua %s đoạn không có vector.", da_nap, bo_qua)
    return {"restored": da_nap, "skipped": bo_qua}


async def rebuild_chroma_if_empty() -> dict:
    """Chỉ nạp lại khi Chroma thiếu so với Mongo. Gọi lúc khởi động.

    So sánh số lượng thay vì luôn nạp: nạp lại mỗi lần khởi động sẽ ghi đè kho
    vector đang lành bằng đúng nội dung của nó — vô hại nhưng tốn thời gian
    khởi động một cách vô ích khi kho đang đầy đủ.
    """
    dem = await dem_vector_va_doan()
    if dem["chroma_vectors"] >= dem["mongo_chunks"]:
        return {"restored": 0, "skipped": 0, **dem}
    ket_qua = await rebuild_chroma_from_mongo()
    return {**ket_qua, **dem}

