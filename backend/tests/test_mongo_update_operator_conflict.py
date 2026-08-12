import unittest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

from app.personalization.repositories.mongo import PersonalizationMongoRepository
from app.personalization.schemas.data_models import KnowledgeComponent, KnowledgeGraphEdge

NOW = datetime(2026, 8, 1, tzinfo=timezone.utc)


def make_repo():
    """Repo với collection giả để soi chính lệnh update được dựng ra.

    Không dùng mongomock: mongomock chấp nhận cả lệnh mà MongoDB thật từ chối,
    nên không phát hiện được lỗi này. Phải kiểm tra cấu trúc lệnh.
    """
    repo = PersonalizationMongoRepository.__new__(PersonalizationMongoRepository)
    collection = MagicMock()
    collection.find_one_and_update = AsyncMock(return_value={"_id": "x"})
    repo.db = {
        "knowledge_components": collection,
        "knowledge_graph_edges": collection,
    }
    return repo, collection


def assert_no_operator_conflict(test: unittest.TestCase, update: dict) -> None:
    """MongoDB báo ConflictingUpdateOperators nếu một trường nằm ở hai toán tử."""
    seen: dict[str, str] = {}
    for operator, fields in update.items():
        for field in fields:
            if field in seen:
                test.fail(
                    f"Trường '{field}' xuất hiện ở cả {seen[field]} và {operator} "
                    f"— MongoDB thật sẽ báo ConflictingUpdateOperators."
                )
            seen[field] = operator


class UpsertUpdateOperatorTests(unittest.IsolatedAsyncioTestCase):
    async def test_graph_edge_upsert_has_no_conflicting_operators(self):
        repo, collection = make_repo()
        edge = KnowledgeGraphEdge(
            source_knowledge_component_id="kc1",
            target_knowledge_component_id="kc2",
            relation_type="prerequisite",
            document_id="doc1",
            evidence_chunk_ids=["doc1:0"],
            created_by="u1",
            created_at=NOW,
            updated_at=NOW,
            model_version="v1",
        )

        await repo.upsert_graph_edge(edge)

        update = collection.find_one_and_update.await_args.args[1]
        assert_no_operator_conflict(self, update)
        self.assertIn("evidence_chunk_ids", update["$addToSet"])

    async def test_knowledge_component_upsert_has_no_conflicting_operators(self):
        repo, collection = make_repo()
        component = KnowledgeComponent(
            name="Chieu be lom",
            normalized_name="chieu be lom",
            source_document_ids=["doc1"],
            evidence_chunk_ids=["doc1:0"],
            aliases=["be lom"],
            created_by="u1",
            created_at=NOW,
            updated_at=NOW,
            model_version="v1",
        )

        await repo.upsert_knowledge_component(component, document_id="doc1")

        update = collection.find_one_and_update.await_args.args[1]
        assert_no_operator_conflict(self, update)
        for field in ("evidence_chunk_ids", "source_document_ids", "aliases"):
            self.assertIn(field, update["$addToSet"])


if __name__ == "__main__":
    unittest.main()
