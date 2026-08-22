import unittest
from datetime import datetime, timezone
from pathlib import Path

from mongomock_motor import AsyncMongoMockClient

from app.curriculum_kb.schemas.dataset import FetchedCurriculumSource
from app.curriculum_kb.services.catalog_service import load_manifest, load_taxonomy


BACKEND_ROOT = Path(__file__).resolve().parents[1]
TAXONOMY_PATH = BACKEND_ROOT / "app/curriculum_kb/catalogs/ctgdpt_2018_grades_6_12.json"
MANIFEST_PATH = BACKEND_ROOT / "app/curriculum_kb/catalogs/open_sources_demo_v1.json"


def _small_manifest(source_count: int = 1):
    taxonomy = load_taxonomy(TAXONOMY_PATH)
    manifest = load_manifest(MANIFEST_PATH, taxonomy=taxonomy)
    sources = []
    for source in manifest.sources[1:1 + source_count]:
        mapping = source.mappings[0].model_copy(update={"grades": [source.mappings[0].grades[0]]})
        sources.append(source.model_copy(update={"mappings": [mapping]}))
    return manifest.model_copy(update={"dataset_key": "dataset-test-v1", "sources": sources})


def _accepted(entry, text: str = "Stable openly licensed curriculum content for testing."):
    return FetchedCurriculumSource(
        source_key=entry.source_key,
        canonical_url=str(entry.url),
        title=entry.title,
        text=text,
        source_language=entry.language,
        upstream_revision="revision-1",
        page_or_section_refs=["section:test"],
        accessed_at=datetime.now(timezone.utc),
        disposition="accepted",
    )


class CurriculumDatasetServiceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_curriculum_dataset_service"]

    def _dataset_api(self):
        try:
            from app.curriculum_kb.services.dataset_service import (
                import_dataset,
                resume_dataset,
                source_checksum,
            )
        except ModuleNotFoundError as exc:
            self.fail(f"Dataset service is missing: {exc}")
        return import_dataset, resume_dataset, source_checksum

    async def test_second_unchanged_import_does_not_duplicate_or_bump_version(self):
        import_dataset, _, _ = self._dataset_api()
        manifest = _small_manifest()

        async def fetcher(entry):
            return _accepted(entry)

        first = await import_dataset(self.db, manifest, actor_id="admin-1", fetcher=fetcher)
        source_before = await self.db["curriculum_kb_sources"].find_one({"dataset_key": manifest.dataset_key})
        second = await import_dataset(self.db, manifest, actor_id="admin-1", fetcher=fetcher)
        source_after = await self.db["curriculum_kb_sources"].find_one({"dataset_key": manifest.dataset_key})

        self.assertEqual(1, first["created"])
        self.assertEqual(0, second["created"])
        self.assertEqual(1, second["unchanged"])
        self.assertEqual(1, await self.db["curriculum_kb_sources"].count_documents({"dataset_key": manifest.dataset_key}))
        self.assertEqual(source_before["_id"], source_after["_id"])
        self.assertEqual(1, source_after["version"])

    async def test_changed_content_updates_stable_source_and_increments_version(self):
        import_dataset, _, _ = self._dataset_api()
        manifest = _small_manifest()

        async def first_fetch(entry):
            return _accepted(entry, "First licensed curriculum revision.")

        async def second_fetch(entry):
            return _accepted(entry, "Second licensed curriculum revision with a correction.")

        await import_dataset(self.db, manifest, actor_id="admin-1", fetcher=first_fetch)
        before = await self.db["curriculum_kb_sources"].find_one({"dataset_key": manifest.dataset_key})
        result = await import_dataset(self.db, manifest, actor_id="admin-1", fetcher=second_fetch)
        after = await self.db["curriculum_kb_sources"].find_one({"dataset_key": manifest.dataset_key})

        self.assertEqual(1, result["updated"])
        self.assertEqual(before["_id"], after["_id"])
        self.assertEqual(2, after["version"])
        self.assertIn("Second licensed", after["content_text"])

    async def test_quarantined_fetch_never_creates_searchable_source(self):
        import_dataset, _, _ = self._dataset_api()
        manifest = _small_manifest()

        async def fetcher(entry):
            return _accepted(entry).model_copy(
                update={"disposition": "quarantined", "reason": "license_not_allowlisted", "text": None}
            )

        result = await import_dataset(self.db, manifest, actor_id="admin-1", fetcher=fetcher)

        self.assertEqual(1, result["quarantined"])
        self.assertEqual(0, await self.db["curriculum_kb_sources"].count_documents({}))
        run = await self.db["curriculum_kb_dataset_runs"].find_one({"dataset_key": manifest.dataset_key})
        self.assertEqual([manifest.sources[0].source_key], run["quarantined_source_keys"])

    async def test_resume_retries_only_failed_catalog_sources(self):
        import_dataset, resume_dataset, _ = self._dataset_api()
        manifest = _small_manifest(source_count=2)
        calls: list[str] = []

        async def first_fetch(entry):
            calls.append(entry.source_key)
            if entry.source_key == manifest.sources[1].source_key:
                raise RuntimeError("temporary upstream failure")
            return _accepted(entry)

        first = await import_dataset(self.db, manifest, actor_id="admin-1", fetcher=first_fetch)
        self.assertEqual(1, first["failed"])
        calls.clear()

        async def retry_fetch(entry):
            calls.append(entry.source_key)
            return _accepted(entry)

        resumed = await resume_dataset(
            self.db,
            manifest.dataset_key,
            actor_id="admin-1",
            fetcher=retry_fetch,
        )

        self.assertEqual([manifest.sources[1].source_key], calls)
        self.assertEqual(1, resumed["created"])
        self.assertEqual(2, await self.db["curriculum_kb_sources"].count_documents({"dataset_key": manifest.dataset_key}))

    async def test_running_dataset_blocks_overlapping_import(self):
        import_dataset, _, _ = self._dataset_api()
        manifest = _small_manifest()
        await self.db["curriculum_kb_dataset_runs"].insert_one({
            "dataset_key": manifest.dataset_key,
            "manifest_version": manifest.manifest_version,
            "status": "running",
        })

        with self.assertRaisesRegex(RuntimeError, "already running"):
            await import_dataset(self.db, manifest, actor_id="admin-1", fetcher=_accepted)

    def test_checksum_normalizes_line_endings_and_trailing_spaces(self):
        _, _, source_checksum = self._dataset_api()
        source_key = "stable-source:toan:10:curriculum_outcomes"

        first = source_checksum("Line one  \r\nLine two\r\n", source_key, "r1")
        second = source_checksum("Line one\nLine two", source_key, "r1")

        self.assertEqual(first, second)


if __name__ == "__main__":
    unittest.main()
