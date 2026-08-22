import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from bson import ObjectId
from mongomock_motor import AsyncMongoMockClient

from app.curriculum_kb.services import dataset_service, ingestion_service
from tests.test_curriculum_dataset_service import _accepted, _small_manifest


def _dataset_source(dataset_key: str = "dataset-a") -> dict:
    now = datetime.now(timezone.utc)
    return {
        "_id": ObjectId(),
        "dataset_key": dataset_key,
        "manifest_version": 1,
        "source_key": "open-source:toan:10:curriculum_outcomes",
        "source_checksum": "checksum",
        "source_language": "vi",
        "canonical_url": "https://example.edu/open",
        "license_id": "CC-BY-4.0",
        "license_url": "https://creativecommons.org/licenses/by/4.0/",
        "attribution": "Example contributors",
        "title": "Open curriculum",
        "content_text": "Nội dung chương trình giáo dục được cấp phép mở. " * 40,
        "subject_id": "toan",
        "grade": 10,
        "topic_id": "curriculum_outcomes",
        "curriculum_version": "2018-consolidated-2022",
        "citations": [],
        "origin_type": "catalog",
        "origin_id": "open-source",
        "review_status": "approved",
        "quality_status": "verified",
        "ingest_status": "not_ingested",
        "chunk_count": 0,
        "ingest_error": None,
        "version": 1,
        "owner_id": "admin-1",
        "created_by": "admin-1",
        "updated_by": "admin-1",
        "created_at": now,
        "updated_at": now,
    }


class CurriculumDatasetIngestionTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_curriculum_dataset_ingestion"]

    async def test_ingestion_writes_dataset_provenance_and_stable_chunk_ids(self):
        source = _dataset_source()
        await self.db["curriculum_kb_sources"].insert_one(source)
        collection = MagicMock()
        chroma = MagicMock()
        chroma.list_collections.return_value = []
        chroma.get_or_create_collection.return_value = collection

        with patch("app.curriculum_kb.services.ingestion_service.init_chroma_client", return_value=chroma):
            result = await ingestion_service.ingest_curriculum_source_job(
                self.db,
                {"source_id": str(source["_id"]), "max_chunks": 25_000},
            )

        kwargs = collection.upsert.call_args.kwargs
        self.assertEqual([f"{source['_id']}:{index}" for index in range(result["chunk_count"])], kwargs["ids"])
        for index, metadata in enumerate(kwargs["metadatas"]):
            self.assertEqual("dataset-a", metadata["dataset_key"])
            self.assertEqual(source["source_key"], metadata["source_key"])
            self.assertEqual("vi", metadata["source_language"])
            self.assertEqual("CC-BY-4.0", metadata["license_id"])
            self.assertEqual(kwargs["ids"][index], metadata["chunk_id"])

    async def test_dataset_import_ingests_created_sources_but_skips_unchanged_sources(self):
        manifest = _small_manifest()
        ingested_source_ids: list[str] = []

        async def fetcher(entry):
            return _accepted(entry)

        async def ingester(db, payload):
            ingested_source_ids.append(payload["source_id"])
            return {"chunk_count": 1}

        await dataset_service.import_dataset(
            self.db,
            manifest,
            actor_id="admin-1",
            fetcher=fetcher,
            ingester=ingester,
        )
        self.assertEqual(1, len(ingested_source_ids))
        imported = await self.db["curriculum_kb_sources"].find_one({"dataset_key": manifest.dataset_key})
        self.assertEqual("published", imported["review_status"])
        ingested_source_ids.clear()

        await dataset_service.import_dataset(
            self.db,
            manifest,
            actor_id="admin-1",
            fetcher=fetcher,
            ingester=ingester,
        )
        self.assertEqual([], ingested_source_ids)

    async def test_chunk_cap_is_checked_before_old_vectors_are_deleted(self):
        source = _dataset_source()
        await self.db["curriculum_kb_sources"].insert_one(source)
        chroma = MagicMock()

        with patch("app.curriculum_kb.services.ingestion_service.init_chroma_client", return_value=chroma), patch(
            "app.curriculum_kb.services.ingestion_service.split_text_into_chunks",
            return_value=["one", "two", "three"],
        ):
            with self.assertRaisesRegex(ValueError, "chunk budget"):
                await ingestion_service.ingest_curriculum_source_job(
                    self.db,
                    {"source_id": str(source["_id"]), "max_chunks": 2},
                )

        chroma.list_collections.assert_not_called()
        chroma.get_or_create_collection.assert_not_called()

    async def test_rollback_dry_run_does_not_delete_and_confirmed_run_is_isolated(self):
        source_a = _dataset_source("dataset-a")
        source_b = _dataset_source("dataset-b")
        source_b["_id"] = ObjectId()
        source_b["source_key"] = "other-source:toan:10:curriculum_outcomes"
        await self.db["curriculum_kb_sources"].insert_many([source_a, source_b])
        collection = MagicMock()
        chroma = MagicMock()
        listed_collection = MagicMock()
        listed_collection.name = "curriculum_kb_chunks_local_384d"
        chroma.list_collections.return_value = [listed_collection]
        chroma.get_collection.return_value = collection

        preview = await dataset_service.rollback_dataset(self.db, "dataset-a", dry_run=True)
        self.assertEqual(1, preview["source_count"])
        self.assertEqual(2, await self.db["curriculum_kb_sources"].count_documents({}))

        with patch("app.curriculum_kb.services.ingestion_service.init_chroma_client", return_value=chroma):
            removed = await dataset_service.rollback_dataset(self.db, "dataset-a", dry_run=False)

        self.assertEqual(1, removed["deleted_sources"])
        self.assertEqual(0, await self.db["curriculum_kb_sources"].count_documents({"dataset_key": "dataset-a"}))
        self.assertEqual(1, await self.db["curriculum_kb_sources"].count_documents({"dataset_key": "dataset-b"}))
        collection.delete.assert_called_once_with(where={"dataset_key": "dataset-a"})


if __name__ == "__main__":
    unittest.main()
