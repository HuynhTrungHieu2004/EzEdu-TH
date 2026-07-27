import unittest
from bson import ObjectId
from datetime import datetime, timezone

from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient

from app.personalization.constants.collections import (
    KNOWLEDGE_COMPONENTS,
    KNOWLEDGE_GRAPH_EDGES,
    LEARNING_ITEMS,
)
from app.personalization.services.knowledge_extraction_service import (
    KnowledgeExtractionValidationError,
    process_document_knowledge_graph,
)
from app.personalization.repositories.mongo import PersonalizationMongoRepository


def base_ai_response(item_id: str, *, confidence: float = 0.9) -> dict:
    return {
        "knowledge_components": [
            {
                "temporary_id": "KC_001",
                "name": "Pha sáng quang hợp",
                "description": "Giai đoạn chuyển năng lượng ánh sáng thành năng lượng hóa học.",
                "subject": "Sinh học",
                "topic": "Quang hợp",
                "difficulty": 0.4,
                "prerequisite_temporary_ids": [],
                "related_temporary_ids": [],
                "evidence_chunk_ids": ["DOC1:0"],
                "confidence": confidence,
            }
        ],
        "item_mappings": [
            {
                "item_id": item_id,
                "primary_knowledge_component": "KC_001",
                "knowledge_components": [{"knowledge_component": "KC_001", "weight": 1.0}],
                "bloom_level": "understand",
                "estimated_difficulty": 0.4,
                "evidence_chunk_ids": ["DOC1:0"],
                "confidence": confidence,
            }
        ],
    }


class KnowledgeGraphPipelineTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["kg_pipeline"]
        self.repo = PersonalizationMongoRepository(self.db)
        self.user_id = "user-1"
        self.other_user_id = "user-2"
        self.document_id = "DOC1"
        now = datetime.now(timezone.utc)

        await self.db["documents"].insert_one({
            "_id": self.document_id,
            "user_id": self.user_id,
            "original_filename": "quang-hop.pdf",
            "status": "indexed",
            "created_at": now,
            "updated_at": now,
        })
        await self.db["document_chunks"].insert_many([
            {
                "document_id": self.document_id,
                "user_id": self.user_id,
                "chunk_index": 0,
                "content": "Pha sáng của quang hợp diễn ra tại màng tilacoit.",
                "created_at": now,
            },
            {
                "document_id": self.document_id,
                "user_id": self.user_id,
                "chunk_index": 1,
                "content": "Chu trình Calvin sử dụng ATP và NADPH để cố định CO2.",
                "created_at": now,
            },
        ])
        question_set_id = ObjectId()
        await self.db["question_sets"].insert_one({
            "_id": question_set_id,
            "document_id": self.document_id,
            "user_id": self.user_id,
            "deleted_at": None,
            "questions": [
                {
                    "question": "Pha sáng diễn ra ở đâu?",
                    "difficulty": "medium",
                    "question_type": "short_answer",
                    "bloom_level": "understand",
                }
            ],
            "created_at": now,
        })
        self.item_id = f"{question_set_id}:0"

    async def test_process_document_saves_kc_edge_and_q_matrix(self):
        response = base_ai_response(self.item_id)
        response["knowledge_components"].append({
            "temporary_id": "KC_002",
            "name": "Chu trình Calvin",
            "description": "Quá trình cố định CO2 trong quang hợp.",
            "subject": "Sinh học",
            "topic": "Quang hợp",
            "difficulty": 0.5,
            "prerequisite_temporary_ids": ["KC_001"],
            "related_temporary_ids": [],
            "evidence_chunk_ids": ["DOC1:1"],
            "confidence": 0.85,
        })

        report = await process_document_knowledge_graph(
            self.document_id,
            self.user_id,
            ai_response=response,
            repository=self.repo,
        )

        self.assertEqual(report["knowledge_components_saved"], 2)
        self.assertEqual(report["knowledge_graph_edges_saved"], 1)
        self.assertEqual(report["learning_items_mapped"], 1)
        item = await self.db[LEARNING_ITEMS].find_one({"_id": self.item_id})
        self.assertIsNotNone(item)
        self.assertAlmostEqual(sum(item["q_matrix_weights"].values()), 1.0, places=5)

    async def test_ai_invalid_json_is_rejected(self):
        invalid = {"knowledge_components": [{"temporary_id": "KC_001"}], "item_mappings": []}
        with self.assertRaises(KnowledgeExtractionValidationError):
            await process_document_knowledge_graph(
                self.document_id,
                self.user_id,
                ai_response=invalid,
                repository=self.repo,
            )

    async def test_chunk_id_outside_document_is_rejected(self):
        response = base_ai_response(self.item_id)
        response["knowledge_components"][0]["evidence_chunk_ids"] = ["OTHER_DOC:0"]
        with self.assertRaises(KnowledgeExtractionValidationError):
            await process_document_knowledge_graph(
                self.document_id,
                self.user_id,
                ai_response=response,
                repository=self.repo,
            )

    async def test_prerequisite_cycle_is_rejected(self):
        response = base_ai_response(self.item_id)
        response["knowledge_components"] = [
            {
                "temporary_id": "KC_001",
                "name": "A",
                "description": "A",
                "subject": "Sinh học",
                "topic": "Quang hợp",
                "difficulty": 0.4,
                "prerequisite_temporary_ids": ["KC_002"],
                "related_temporary_ids": [],
                "evidence_chunk_ids": ["DOC1:0"],
                "confidence": 0.9,
            },
            {
                "temporary_id": "KC_002",
                "name": "B",
                "description": "B",
                "subject": "Sinh học",
                "topic": "Quang hợp",
                "difficulty": 0.4,
                "prerequisite_temporary_ids": ["KC_001"],
                "related_temporary_ids": [],
                "evidence_chunk_ids": ["DOC1:1"],
                "confidence": 0.9,
            },
        ]
        response["item_mappings"][0]["knowledge_components"] = [{"knowledge_component": "KC_001", "weight": 1.0}]
        response["item_mappings"][0]["primary_knowledge_component"] = "KC_001"

        with self.assertRaises(KnowledgeExtractionValidationError):
            await process_document_knowledge_graph(
                self.document_id,
                self.user_id,
                ai_response=response,
                repository=self.repo,
            )

    async def test_duplicate_concept_is_merged(self):
        response = base_ai_response(self.item_id)
        response["knowledge_components"].append({
            "temporary_id": "KC_002",
            "name": "Pha sáng quang hợp",
            "description": "Giai đoạn hấp thụ ánh sáng trong quang hợp.",
            "subject": "Sinh học",
            "topic": "Quang hợp",
            "difficulty": 0.42,
            "prerequisite_temporary_ids": [],
            "related_temporary_ids": [],
            "evidence_chunk_ids": ["DOC1:0"],
            "confidence": 0.88,
        })
        response["item_mappings"][0]["knowledge_components"] = [
            {"knowledge_component": "KC_001", "weight": 0.5},
            {"knowledge_component": "KC_002", "weight": 0.5},
        ]

        report = await process_document_knowledge_graph(
            self.document_id,
            self.user_id,
            ai_response=response,
            repository=self.repo,
        )

        self.assertEqual(await self.db[KNOWLEDGE_COMPONENTS].count_documents({}), 1)
        self.assertTrue(any("Merged duplicate concept" in warning for warning in report["warnings"]))
        item = await self.db[LEARNING_ITEMS].find_one({"_id": self.item_id})
        self.assertEqual(len(item["q_matrix_weights"]), 1)
        self.assertAlmostEqual(sum(item["q_matrix_weights"].values()), 1.0, places=5)

    async def test_cross_user_access_is_rejected(self):
        with self.assertRaises(HTTPException) as ctx:
            await process_document_knowledge_graph(
                self.document_id,
                self.other_user_id,
                ai_response=base_ai_response(self.item_id),
                repository=self.repo,
            )
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_low_confidence_requires_review(self):
        report = await process_document_knowledge_graph(
            self.document_id,
            self.user_id,
            ai_response=base_ai_response(self.item_id, confidence=0.4),
            repository=self.repo,
        )

        component = await self.db[KNOWLEDGE_COMPONENTS].find_one({})
        item = await self.db[LEARNING_ITEMS].find_one({"_id": self.item_id})
        self.assertEqual(component["status"], "needs_review")
        self.assertEqual(item["verification_status"], "needs_review")
        self.assertGreaterEqual(len(report["review_required"]), 2)

    async def test_q_matrix_weights_are_normalized(self):
        response = base_ai_response(self.item_id)
        response["knowledge_components"].append({
            "temporary_id": "KC_002",
            "name": "Tilacoit",
            "description": "Cấu trúc màng nơi diễn ra pha sáng.",
            "subject": "Sinh học",
            "topic": "Quang hợp",
            "difficulty": 0.3,
            "prerequisite_temporary_ids": [],
            "related_temporary_ids": ["KC_001"],
            "evidence_chunk_ids": ["DOC1:0"],
            "confidence": 0.86,
        })
        response["item_mappings"][0]["knowledge_components"] = [
            {"knowledge_component": "KC_001", "weight": 0.2},
            {"knowledge_component": "KC_002", "weight": 0.2},
        ]

        report = await process_document_knowledge_graph(
            self.document_id,
            self.user_id,
            ai_response=response,
            repository=self.repo,
        )

        item = await self.db[LEARNING_ITEMS].find_one({"_id": self.item_id})
        self.assertAlmostEqual(sum(item["q_matrix_weights"].values()), 1.0, places=5)
        self.assertTrue(any("Normalized Q-Matrix weights" in warning for warning in report["warnings"]))

    async def test_rerun_pipeline_does_not_duplicate_data(self):
        response = base_ai_response(self.item_id)
        await process_document_knowledge_graph(
            self.document_id,
            self.user_id,
            ai_response=response,
            repository=self.repo,
        )
        await process_document_knowledge_graph(
            self.document_id,
            self.user_id,
            ai_response=response,
            repository=self.repo,
        )

        self.assertEqual(await self.db[KNOWLEDGE_COMPONENTS].count_documents({}), 1)
        self.assertEqual(await self.db[KNOWLEDGE_GRAPH_EDGES].count_documents({}), 0)
        self.assertEqual(await self.db[LEARNING_ITEMS].count_documents({}), 1)
