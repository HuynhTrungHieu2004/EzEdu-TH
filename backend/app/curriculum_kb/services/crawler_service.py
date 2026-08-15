"""Bounded web crawler whose output remains quarantined until human review."""

from __future__ import annotations

import asyncio
import ipaddress
import socket
from collections import deque
from datetime import datetime, timezone
from html.parser import HTMLParser
from typing import Any, Awaitable, Callable, Optional
from urllib.parse import urljoin, urlsplit, urlunsplit
from urllib.robotparser import RobotFileParser

import httpx
from bson import ObjectId
from fastapi import HTTPException, status

from app.curriculum_kb.constants.collections import CRAWL_BATCHES, CRAWL_ITEMS
from app.curriculum_kb.schemas.crawl import CrawlBatchCreate, CrawlBatchResponse
from app.services.background_job_service import enqueue

CRAWL_JOB_TYPE = "crawl_curriculum_sources"
CRAWLER_USER_AGENT = "EzEduCurriculumBot/1.0"
MAX_CONTENT_CHARS = 50_000


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _is_forbidden_host(hostname: str) -> bool:
    host = hostname.rstrip(".").lower()
    if host in {"localhost", "localhost.localdomain"} or host.endswith(".local"):
        return True
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return False
    return not address.is_global


def normalize_public_url(raw_url: str) -> str:
    value = raw_url.strip()
    parsed = urlsplit(value)
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname:
        raise ValueError("Chỉ chấp nhận URL HTTP/HTTPS công khai.")
    if parsed.username or parsed.password or _is_forbidden_host(parsed.hostname):
        raise ValueError("URL trỏ tới địa chỉ không được phép.")

    scheme = parsed.scheme.lower()
    hostname = parsed.hostname.lower()
    port = parsed.port
    if port and not ((scheme == "http" and port == 80) or (scheme == "https" and port == 443)):
        netloc = f"{hostname}:{port}"
    else:
        netloc = hostname
    path = parsed.path or "/"
    return urlunsplit((scheme, netloc, path, parsed.query, ""))


async def _assert_public_dns(url: str) -> None:
    hostname = urlsplit(url).hostname or ""
    records = await asyncio.to_thread(socket.getaddrinfo, hostname, None)
    addresses = {item[4][0] for item in records}
    if not addresses or any(_is_forbidden_host(address) for address in addresses):
        raise ValueError("Tên miền phân giải tới địa chỉ không công khai.")


class _PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title_parts: list[str] = []
        self.text_parts: list[str] = []
        self.links: list[str] = []
        self._in_title = False
        self._ignored_depth = 0

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag in {"script", "style", "noscript", "svg"}:
            self._ignored_depth += 1
        if tag == "title":
            self._in_title = True
        if tag == "a":
            href = dict(attrs).get("href")
            if href:
                self.links.append(href)

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript", "svg"} and self._ignored_depth:
            self._ignored_depth -= 1
        if tag == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        text = " ".join(data.split())
        if not text or self._ignored_depth:
            return
        if self._in_title:
            self.title_parts.append(text)
        self.text_parts.append(text)


async def default_robots_allowed(url: str) -> bool:
    await _assert_public_dns(url)
    parsed = urlsplit(url)
    robots_url = urlunsplit((parsed.scheme, parsed.netloc, "/robots.txt", "", ""))
    try:
        async with httpx.AsyncClient(timeout=10.0, headers={"User-Agent": CRAWLER_USER_AGENT}) as client:
            response = await client.get(robots_url, follow_redirects=False)
    except httpx.HTTPError:
        return False
    if response.status_code == 404:
        return True
    if response.status_code >= 400:
        return False
    parser = RobotFileParser()
    parser.set_url(robots_url)
    parser.parse(response.text.splitlines())
    return parser.can_fetch(CRAWLER_USER_AGENT, url)


async def default_fetch_page(url: str) -> dict[str, Any]:
    current = normalize_public_url(url)
    async with httpx.AsyncClient(timeout=15.0, headers={"User-Agent": CRAWLER_USER_AGENT}) as client:
        for _ in range(4):
            await _assert_public_dns(current)
            response = await client.get(current, follow_redirects=False)
            if response.is_redirect:
                location = response.headers.get("location")
                if not location:
                    raise ValueError("Redirect không có địa chỉ đích.")
                current = normalize_public_url(urljoin(current, location))
                continue
            response.raise_for_status()
            content_type = response.headers.get("content-type", "").split(";")[0].lower()
            if content_type not in {"text/html", "text/plain"}:
                raise ValueError(f"Kiểu nội dung chưa hỗ trợ: {content_type or 'không xác định'}")
            parser = _PageParser()
            parser.feed(response.text[:1_000_000])
            content_text = "\n".join(parser.text_parts)[:MAX_CONTENT_CHARS]
            links: list[str] = []
            for link in parser.links:
                try:
                    links.append(normalize_public_url(urljoin(current, link)))
                except ValueError:
                    continue
            return {
                "url": current,
                "title": " ".join(parser.title_parts)[:300] or current,
                "content_text": content_text,
                "links": links,
                "content_type": content_type,
            }
    raise ValueError("Quá nhiều lần chuyển hướng.")


def _batch_response(doc: dict[str, Any]) -> CrawlBatchResponse:
    return CrawlBatchResponse(id=str(doc["_id"]), **{key: value for key, value in doc.items() if key != "_id"})


async def enqueue_crawl_batch(db, payload: CrawlBatchCreate, *, actor_id: str) -> CrawlBatchResponse:
    try:
        seed_urls = list(dict.fromkeys(normalize_public_url(url) for url in payload.seed_urls))
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc
    now = _now()
    doc = {
        "seed_urls": seed_urls,
        "subject_id": payload.subject_id,
        "grade": payload.grade,
        "topic_id": payload.topic_id,
        "max_pages": payload.max_pages,
        "status": "pending",
        "fetched_count": 0,
        "blocked_count": 0,
        "failed_count": 0,
        "error_message": None,
        "owner_id": actor_id,
        "created_at": now,
        "updated_at": now,
    }
    inserted = await db[CRAWL_BATCHES].insert_one(doc)
    doc["_id"] = inserted.inserted_id
    await enqueue(
        db,
        job_type=CRAWL_JOB_TYPE,
        payload={"batch_id": str(inserted.inserted_id)},
        idempotency_key=f"crawl-batch:{inserted.inserted_id}",
    )
    return _batch_response(doc)


async def crawl_batch_job(
    db,
    payload: dict[str, Any],
    *,
    robots_allowed: Callable[[str], Awaitable[bool]] = default_robots_allowed,
    fetch_page: Callable[[str], Awaitable[dict[str, Any]]] = default_fetch_page,
) -> dict[str, int]:
    batch_id = payload["batch_id"]
    batch = await db[CRAWL_BATCHES].find_one({"_id": ObjectId(batch_id)})
    if batch is None:
        raise ValueError("Không tìm thấy lô crawl.")
    if batch.get("status") == "completed":
        return {
            "fetched_count": batch.get("fetched_count", 0),
            "blocked_count": batch.get("blocked_count", 0),
            "failed_count": batch.get("failed_count", 0),
        }

    await db[CRAWL_BATCHES].update_one(
        {"_id": batch["_id"]}, {"$set": {"status": "running", "updated_at": _now()}}
    )
    queue = deque(batch["seed_urls"])
    seen: set[str] = set()
    root_hosts = {urlsplit(url).hostname for url in batch["seed_urls"]}
    fetched_count = blocked_count = failed_count = 0

    while queue and len(seen) < batch["max_pages"]:
        url = queue.popleft()
        if url in seen:
            continue
        seen.add(url)
        if not await robots_allowed(url):
            blocked_count += 1
            await db[CRAWL_ITEMS].update_one(
                {"batch_id": batch_id, "canonical_url": url},
                {"$set": {"batch_id": batch_id, "canonical_url": url, "source_url": url,
                           "crawl_status": "blocked_by_robots", "review_status": "draft",
                           "quality_status": "unreviewed", "copyright_status": "unknown",
                           "owner_id": batch["owner_id"], "updated_at": _now()},
                 "$setOnInsert": {"created_at": _now()}}, upsert=True,
            )
            continue
        try:
            page = await fetch_page(url)
            canonical_url = normalize_public_url(page.get("url") or url)
            content_text = (page.get("content_text") or "").strip()
            if len(content_text) < 40:
                raise ValueError("Trang không có đủ nội dung văn bản.")
            await db[CRAWL_ITEMS].update_one(
                {"batch_id": batch_id, "canonical_url": canonical_url},
                {"$set": {
                    "batch_id": batch_id, "canonical_url": canonical_url, "source_url": url,
                    "title": (page.get("title") or canonical_url)[:300],
                    "content_text": content_text[:MAX_CONTENT_CHARS],
                    "content_type": page.get("content_type"), "crawl_status": "fetched",
                    "review_status": "draft", "quality_status": "unreviewed",
                    "copyright_status": "unknown", "subject_id": batch["subject_id"],
                    "grade": batch.get("grade"), "topic_id": batch.get("topic_id"),
                    "owner_id": batch["owner_id"], "updated_at": _now(),
                }, "$setOnInsert": {"created_at": _now()}}, upsert=True,
            )
            fetched_count += 1
            for link in page.get("links", []):
                try:
                    normalized = normalize_public_url(link)
                except ValueError:
                    continue
                if urlsplit(normalized).hostname in root_hosts and normalized not in seen:
                    queue.append(normalized)
        except Exception as exc:  # noqa: BLE001 - isolate a bad page from the batch
            failed_count += 1
            await db[CRAWL_ITEMS].update_one(
                {"batch_id": batch_id, "canonical_url": url},
                {"$set": {"batch_id": batch_id, "canonical_url": url, "source_url": url,
                           "crawl_status": "failed", "crawl_error": str(exc)[:500],
                           "review_status": "draft", "quality_status": "unreviewed",
                           "copyright_status": "unknown", "owner_id": batch["owner_id"],
                           "updated_at": _now()}, "$setOnInsert": {"created_at": _now()}}, upsert=True,
            )

    result = {"fetched_count": fetched_count, "blocked_count": blocked_count, "failed_count": failed_count}
    await db[CRAWL_BATCHES].update_one(
        {"_id": batch["_id"]}, {"$set": {**result, "status": "completed", "updated_at": _now()}}
    )
    return result


async def review_crawl_item(db, item_id: str, *, target_status: str, actor_id: str, is_admin: bool):
    if not ObjectId.is_valid(item_id):
        raise HTTPException(status_code=404, detail="Không tìm thấy nội dung crawl.")
    item = await db[CRAWL_ITEMS].find_one({"_id": ObjectId(item_id)})
    if item is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy nội dung crawl.")
    if not is_admin and item["owner_id"] != actor_id:
        raise HTTPException(status_code=403, detail="Bạn không có quyền với nội dung này.")
    transitions = {"draft": {"reviewing"}, "reviewing": {"draft", "approved", "rejected"},
                   "approved": set(), "rejected": {"draft"}}
    if target_status not in transitions.get(item["review_status"], set()):
        raise HTTPException(status_code=400, detail="Chuyển trạng thái duyệt không hợp lệ.")
    fields = {"review_status": target_status, "updated_at": _now()}
    if target_status == "approved":
        fields["quality_status"] = "verified"
    await db[CRAWL_ITEMS].update_one({"_id": item["_id"]}, {"$set": fields})
    return await db[CRAWL_ITEMS].find_one({"_id": item["_id"]})


async def list_crawl_items(
    db, *, actor_id: str, is_admin: bool, review_status: Optional[str] = None,
    skip: int = 0, limit: int = 50,
) -> tuple[list[dict[str, Any]], int]:
    query: dict[str, Any] = {}
    if not is_admin:
        query["owner_id"] = actor_id
    if review_status:
        query["review_status"] = review_status
    total = await db[CRAWL_ITEMS].count_documents(query)
    cursor = db[CRAWL_ITEMS].find(query).sort("created_at", -1).skip(skip).limit(limit)
    items = []
    async for doc in cursor:
        doc = dict(doc)
        doc["id"] = str(doc.pop("_id"))
        items.append(doc)
    return items, total


async def promote_crawl_item(db, item_id: str, *, actor_id: str, is_admin: bool):
    from app.curriculum_kb.services.registry_service import create_source_from_crawl

    return await create_source_from_crawl(
        db, item_id, actor_id=actor_id, is_admin=is_admin
    )
