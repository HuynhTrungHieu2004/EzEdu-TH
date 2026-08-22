from __future__ import annotations

from datetime import datetime, timezone
from urllib.parse import urljoin, urlsplit, urlunsplit

import httpx

from app.curriculum_kb.schemas.dataset import CatalogSource, FetchedCurriculumSource
from app.curriculum_kb.services.crawler_service import (
    _PageParser,
    _assert_public_dns,
    normalize_public_url,
)
from app.curriculum_kb.services.source_policy_service import source_policy_rejection
from app.services.document_parser import extract_text_pages_from_pdf_bytes

MAX_SOURCE_BYTES = 10_000_000
MAX_REDIRECTS = 3


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _result(
    entry: CatalogSource,
    *,
    disposition: str,
    canonical_url: str | None = None,
    text: str | None = None,
    title: str | None = None,
    revision: str | None = None,
    refs: list[str] | None = None,
    reason: str | None = None,
) -> FetchedCurriculumSource:
    return FetchedCurriculumSource(
        source_key=entry.source_key,
        canonical_url=canonical_url or str(entry.url),
        title=title or entry.title,
        text=text,
        source_language=entry.language,
        upstream_revision=revision,
        page_or_section_refs=refs or [],
        accessed_at=_now(),
        disposition=disposition,
        reason=reason,
    )


async def _get(
    entry: CatalogSource,
    url: str,
    client: httpx.AsyncClient,
    *,
    params: dict | None = None,
) -> tuple[httpx.Response | None, str, str | None]:
    current = normalize_public_url(url)
    for _ in range(MAX_REDIRECTS + 1):
        if (urlsplit(current).hostname or "").lower() != entry.canonical_domain.lower():
            return None, current, "redirect_domain_mismatch"
        await _assert_public_dns(current)
        response = await client.get(current, params=params, follow_redirects=False)
        params = None
        if response.is_redirect:
            location = response.headers.get("location")
            if not location:
                return None, current, "redirect_without_location"
            current = normalize_public_url(urljoin(current, location))
            continue
        if response.status_code >= 400:
            return None, current, f"http_{response.status_code}"
        content_length = response.headers.get("content-length")
        if (content_length and int(content_length) > MAX_SOURCE_BYTES) or len(response.content) > MAX_SOURCE_BYTES:
            return None, current, "response_too_large"
        return response, current, None
    return None, current, "too_many_redirects"


def _extract_html(response: httpx.Response) -> tuple[str, str]:
    parser = _PageParser()
    parser.feed(response.text)
    title = " ".join(parser.title_parts).strip()
    text = "\n".join(parser.text_parts).strip()
    return title, text


async def _fetch_pdf(entry: CatalogSource, client: httpx.AsyncClient) -> FetchedCurriculumSource:
    response, final_url, reason = await _get(entry, str(entry.url), client)
    if reason:
        return _result(entry, disposition="quarantined", canonical_url=final_url, reason=reason)
    content_type = response.headers.get("content-type", "").split(";", 1)[0].lower()
    if content_type != "application/pdf":
        return _result(entry, disposition="quarantined", canonical_url=final_url, reason="unsupported_content_type")
    ranges = [tuple(item) for item in entry.selectors.get("page_ranges", [])] or None
    pages = extract_text_pages_from_pdf_bytes(response.content, ranges)
    if not pages:
        return _result(entry, disposition="quarantined", canonical_url=final_url, reason="empty_text")
    return _result(
        entry,
        disposition="accepted",
        canonical_url=final_url,
        text="\n\n".join(text for _, text in pages),
        refs=[f"page:{page}" for page, _ in pages],
    )


async def _fetch_mediawiki(entry: CatalogSource, client: httpx.AsyncClient) -> FetchedCurriculumSource:
    page_title = entry.selectors.get("page_title")
    if not page_title:
        return _result(entry, disposition="quarantined", reason="missing_page_title")
    parsed = urlsplit(str(entry.url))
    api_url = urlunsplit((parsed.scheme, parsed.netloc, "/w/api.php", "", ""))
    response, _, reason = await _get(
        entry,
        api_url,
        client,
        params={
            "action": "query",
            "prop": "revisions",
            "rvprop": "ids|content",
            "rvslots": "main",
            "titles": page_title,
            "format": "json",
            "formatversion": "2",
        },
    )
    if reason:
        return _result(entry, disposition="quarantined", reason=reason)
    pages = response.json().get("query", {}).get("pages", [])
    if not pages or pages[0].get("missing"):
        return _result(entry, disposition="quarantined", reason="page_not_found")
    page = pages[0]
    revisions = page.get("revisions") or []
    if not revisions:
        return _result(entry, disposition="quarantined", reason="revision_not_found")
    revision = revisions[0]
    text = revision.get("slots", {}).get("main", {}).get("content", "").strip()
    if not text:
        return _result(entry, disposition="quarantined", reason="empty_text")
    return _result(
        entry,
        disposition="accepted",
        canonical_url=str(entry.url),
        title=page.get("title") or entry.title,
        text=text,
        revision=str(revision.get("revid")) if revision.get("revid") is not None else None,
        refs=[f"page:{page['pageid']}"] if page.get("pageid") is not None else [],
    )


async def _fetch_html(entry: CatalogSource, client: httpx.AsyncClient) -> FetchedCurriculumSource:
    response, final_url, reason = await _get(entry, str(entry.url), client)
    if reason:
        return _result(entry, disposition="quarantined", canonical_url=final_url, reason=reason)
    content_type = response.headers.get("content-type", "").split(";", 1)[0].lower()
    if content_type != "text/html":
        return _result(entry, disposition="quarantined", canonical_url=final_url, reason="unsupported_content_type")
    title, text = _extract_html(response)
    if not text:
        return _result(entry, disposition="quarantined", canonical_url=final_url, reason="empty_text")
    return _result(
        entry,
        disposition="accepted",
        canonical_url=final_url,
        title=title or entry.title,
        text=text,
        refs=[f"section:{urlsplit(final_url).path}"],
    )


async def fetch_catalog_source(
    entry: CatalogSource,
    *,
    http_client: httpx.AsyncClient,
) -> FetchedCurriculumSource:
    rejection = source_policy_rejection(entry)
    if rejection:
        return _result(entry, disposition="quarantined", reason=rejection)
    try:
        if entry.adapter == "moet_pdf":
            return await _fetch_pdf(entry, http_client)
        if entry.adapter in {"mediawiki", "wikibooks"}:
            return await _fetch_mediawiki(entry, http_client)
        return await _fetch_html(entry, http_client)
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        return _result(entry, disposition="quarantined", reason=f"fetch_error:{type(exc).__name__}")
