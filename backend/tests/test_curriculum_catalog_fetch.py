import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

import fitz
import httpx

from app.curriculum_kb.services.catalog_service import load_manifest, load_taxonomy


BACKEND_ROOT = Path(__file__).resolve().parents[1]
TAXONOMY_PATH = BACKEND_ROOT / "app/curriculum_kb/catalogs/ctgdpt_2018_grades_6_12.json"
MANIFEST_PATH = BACKEND_ROOT / "app/curriculum_kb/catalogs/open_sources_demo_v1.json"


def _manifest():
    taxonomy = load_taxonomy(TAXONOMY_PATH)
    return load_manifest(MANIFEST_PATH, taxonomy=taxonomy)


def _source(source_key: str):
    return next(source for source in _manifest().sources if source.source_key == source_key)


def _pdf_bytes(text: str) -> bytes:
    document = fitz.open()
    page = document.new_page()
    page.insert_text((72, 72), text)
    payload = document.tobytes()
    document.close()
    return payload


class CurriculumCatalogFetchTests(unittest.IsolatedAsyncioTestCase):
    def _fetch_api(self):
        try:
            from app.curriculum_kb.services.catalog_fetch_service import fetch_catalog_source
        except ModuleNotFoundError as exc:
            self.fail(f"Catalog fetch service is missing: {exc}")
        return fetch_catalog_source

    async def test_pdf_adapter_extracts_text_and_preserves_page_references(self):
        fetch_catalog_source = self._fetch_api()
        entry = _source("official-ctgdpt-2018-amendment-2022")
        pdf = _pdf_bytes("Official curriculum outcomes for grades six through twelve")

        async def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, headers={"content-type": "application/pdf"}, content=pdf)

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            with patch(
                "app.curriculum_kb.services.catalog_fetch_service._assert_public_dns",
                new=AsyncMock(),
            ):
                result = await fetch_catalog_source(entry, http_client=client)

        self.assertEqual("accepted", result.disposition)
        self.assertIn("Official curriculum outcomes", result.text)
        self.assertEqual(["page:1"], result.page_or_section_refs)
        self.assertEqual("vi", result.source_language)

    async def test_wikibooks_adapter_uses_api_and_preserves_revision(self):
        fetch_catalog_source = self._fetch_api()
        entry = _source("wikibooks-english-in-use")

        async def handler(request: httpx.Request) -> httpx.Response:
            self.assertEqual("/w/api.php", request.url.path)
            return httpx.Response(
                200,
                json={
                    "query": {
                        "pages": [{
                            "pageid": 42,
                            "title": "English in Use",
                            "revisions": [{
                                "revid": 987,
                                "slots": {"main": {"content": "English grammar and usage examples for learners."}},
                            }],
                        }]
                    }
                },
            )

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            with patch(
                "app.curriculum_kb.services.catalog_fetch_service._assert_public_dns",
                new=AsyncMock(),
            ):
                result = await fetch_catalog_source(entry, http_client=client)

        self.assertEqual("accepted", result.disposition)
        self.assertEqual("987", result.upstream_revision)
        self.assertEqual(["page:42"], result.page_or_section_refs)
        self.assertEqual("en", result.source_language)

    async def test_openstax_adapter_discards_scripts_and_keeps_visible_text(self):
        fetch_catalog_source = self._fetch_api()
        entry = _source("openstax-physics")
        html = """
            <html lang="en"><head><title>Physics</title><script>ignore me</script></head>
            <body><h1>Introduction</h1><p>Physics explains matter, motion, and energy.</p></body></html>
        """

        async def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, headers={"content-type": "text/html"}, text=html)

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            with patch(
                "app.curriculum_kb.services.catalog_fetch_service._assert_public_dns",
                new=AsyncMock(),
            ):
                result = await fetch_catalog_source(entry, http_client=client)

        self.assertEqual("accepted", result.disposition)
        self.assertIn("Physics explains matter", result.text)
        self.assertNotIn("ignore me", result.text)

    async def test_license_domain_mismatch_is_quarantined_without_fetching(self):
        fetch_catalog_source = self._fetch_api()
        entry = _source("openstax-physics").model_copy(update={"license_id": "CC-BY-4.0"})
        handler = AsyncMock(side_effect=AssertionError("policy rejection must happen before HTTP"))

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result = await fetch_catalog_source(entry, http_client=client)

        self.assertEqual("quarantined", result.disposition)
        self.assertEqual("license_not_allowlisted", result.reason)
        self.assertIsNone(result.text)

    async def test_redirect_outside_canonical_domain_is_quarantined(self):
        fetch_catalog_source = self._fetch_api()
        entry = _source("openstax-physics")

        async def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(302, headers={"location": "https://evil.example/physics"})

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            with patch(
                "app.curriculum_kb.services.catalog_fetch_service._assert_public_dns",
                new=AsyncMock(),
            ):
                result = await fetch_catalog_source(entry, http_client=client)

        self.assertEqual("quarantined", result.disposition)
        self.assertEqual("redirect_domain_mismatch", result.reason)

    async def test_oversized_response_is_quarantined(self):
        fetch_catalog_source = self._fetch_api()
        entry = _source("openstax-physics")
        oversized = b"x" * 10_000_001

        async def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, headers={"content-type": "text/html"}, content=oversized)

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            with patch(
                "app.curriculum_kb.services.catalog_fetch_service._assert_public_dns",
                new=AsyncMock(),
            ):
                result = await fetch_catalog_source(entry, http_client=client)

        self.assertEqual("quarantined", result.disposition)
        self.assertEqual("response_too_large", result.reason)


if __name__ == "__main__":
    unittest.main()
