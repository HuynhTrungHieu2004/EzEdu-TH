import asyncio
import json
import unittest
from collections import Counter
from copy import deepcopy
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

from bson import ObjectId
from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient
from pydantic import ValidationError
from pymongo.errors import DuplicateKeyError

from app.routers import student_reviews as student_reviews_router
from app.routers.student_reviews import (
    CreateStudentReviewRequest,
    StudentReviewClassificationRequest,
    StudentReviewGenerationRequest,
    confirm_student_review_classification_route,
    create_student_review_route,
    generate_student_review_route,
    get_student_review_route,
    list_student_reviews_route,
    retry_student_review_route,
)
from app.schemas.auth import UserResponse
from app.services.background_job_service import ensure_background_job_indexes
from app.services.background_job_service import process_one
from app.services.document_classification_service import (
    CLASSIFICATION_KEYS,
    classify_document,
)
from app.services.student_review_service import (
    STUDENT_DOCUMENT_CLASSIFY_JOB_TYPE,
    STUDENT_REVIEW_GENERATE_JOB_TYPE,
    classify_student_document_job,
    ensure_student_review_indexes,
    generate_student_review_job,
    validate_transition,
)


def actor(role="student", user_id=None):
    user_id = user_id or str(ObjectId())
    return UserResponse(
        id=user_id,
        email=f"{role}-{user_id}@example.com",
        full_name=role,
        role=role,
        created_at=datetime.now(timezone.utc),
    )


class LLMStub:
    def __init__(self, response):
        self.response = response
        self.prompts = []

    async def __call__(self, prompt):
        self.prompts.append(prompt)
        return json.dumps(self.response)


class StudentReviewStateTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.db = AsyncMongoMockClient().ezedu_test

    async def test_indexes_include_idempotency_and_owner_history(self):
        await ensure_student_review_indexes(self.db)
        indexes = await self.db.student_reviews.index_information()
        keys = {tuple(value["key"]) for value in indexes.values()}
        self.assertIn((("user_id", 1), ("client_request_id", 1)), keys)
        self.assertIn((("user_id", 1), ("created_at", -1)), keys)

    async def test_invalid_transition_is_rejected(self):
        with self.assertRaises(ValueError):
            validate_transition("ready", "classifying")


class StudentDocumentClassificationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.db = AsyncMongoMockClient().ezedu_classification_test
        self.user_id = str(ObjectId())
        self.document_id = ObjectId()
        self.review_id = ObjectId()
        self.subject_id = ObjectId()
        self.chapter_id = ObjectId()
        self.topic_id = ObjectId()
        await self.db.curriculum_taxonomy.insert_many([
            {
                "_id": self.subject_id,
                "node_type": "subject",
                "name": "Toán",
                "grade": 10,
                "curriculum_version": "2018",
            },
            {
                "_id": self.chapter_id,
                "node_type": "chapter",
                "name": "Hàm số",
                "parent_id": str(self.subject_id),
                "grade": 10,
                "curriculum_version": "2018",
            },
            {
                "_id": self.topic_id,
                "node_type": "topic",
                "name": "Hàm bậc hai",
                "parent_id": str(self.chapter_id),
                "grade": 10,
                "curriculum_version": "2018",
            },
        ])
        await self.db.documents.insert_one({
            "_id": self.document_id,
            "user_id": self.user_id,
            "original_filename": "ham-so.pdf",
            "status": "indexed",
            "deleted_at": None,
        })
        await self.db.document_chunks.insert_many([
            {
                "document_id": str(self.document_id),
                "user_id": self.user_id,
                "chunk_index": 0,
                "content": "Hàm bậc hai có đồ thị là một parabol.",
            },
            {
                "document_id": str(self.document_id),
                "user_id": "other-user",
                "chunk_index": 0,
                "content": "PRIVATE FOREIGN CHUNK",
            },
        ])
        await self.db.student_reviews.insert_one({
            "_id": self.review_id,
            "document_id": str(self.document_id),
            "user_id": self.user_id,
            "state": "classifying",
        })

    def _response(self, confidence=0.85, **overrides):
        response = {
            "subject_id": str(self.subject_id),
            "grade": 10,
            "curriculum_version": "2018",
            "chapter_id": str(self.chapter_id),
            "topic_ids": [str(self.topic_id)],
            "confidence": confidence,
            "reasoning": "must never be persisted",
        }
        response.update(overrides)
        return response

    async def _document(self):
        return await self.db.documents.find_one({"_id": self.document_id})

    async def _clear_taxonomy_metadata(self):
        await self.db.curriculum_taxonomy.update_many(
            {}, {"$set": {"grade": None, "curriculum_version": None}}
        )

    async def test_high_confidence_is_confirmed_from_owner_scoped_evidence(self):
        llm = LLMStub(self._response(0.85))

        classification = await classify_document(self.db, await self._document(), llm=llm)

        self.assertEqual(classification["status"], "confirmed")
        self.assertEqual(classification["method"], "ai")
        self.assertIn("Hàm bậc hai có đồ thị", llm.prompts[0])
        self.assertNotIn("PRIVATE FOREIGN CHUNK", llm.prompts[0])
        self.assertIn(str(self.subject_id), llm.prompts[0])

    async def test_named_confidence_from_provider_is_normalized(self):
        classification = await classify_document(
            self.db, await self._document(), llm=LLMStub(self._response("HIGH"))
        )

        self.assertEqual(classification["confidence"], 0.85)
        self.assertEqual(classification["status"], "confirmed")

    async def test_confidence_at_confirmation_threshold_needs_confirmation(self):
        classification = await classify_document(
            self.db, await self._document(), llm=LLMStub(self._response(0.60))
        )
        self.assertEqual(classification["status"], "needs_confirmation")

    async def test_confidence_below_confirmation_threshold_requires_manual_review(self):
        classification = await classify_document(
            self.db, await self._document(), llm=LLMStub(self._response(0.59))
        )
        self.assertEqual(classification["status"], "manual_required")

    async def test_provider_outage_falls_back_to_manual_taxonomy_suggestion(self):
        with patch(
            "app.services.document_classification_service.generate_json_with_failover",
            side_effect=TimeoutError("provider timeout"),
        ):
            classification = await classify_document(self.db, await self._document())

        self.assertEqual(classification["subject_id"], str(self.subject_id))
        self.assertEqual(classification["chapter_id"], str(self.chapter_id))
        self.assertEqual(classification["topic_ids"], [str(self.topic_id)])
        self.assertEqual(classification["method"], "heuristic_fallback")
        self.assertEqual(classification["status"], "manual_required")

    async def test_provider_outage_ignores_subjects_without_complete_taxonomy_path(self):
        await self.db.curriculum_taxonomy.insert_one({
            "_id": ObjectId(),
            "node_type": "subject",
            "name": "ham so pdf",
            "grade": 10,
            "curriculum_version": "2018",
        })

        with patch(
            "app.services.document_classification_service.generate_json_with_failover",
            side_effect=TimeoutError("provider timeout"),
        ):
            classification = await classify_document(self.db, await self._document())

        self.assertEqual(classification["subject_id"], str(self.subject_id))
        self.assertEqual(classification["chapter_id"], str(self.chapter_id))
        self.assertEqual(classification["topic_ids"], [str(self.topic_id)])

    async def test_retry_reuses_persisted_heuristic_classification_without_llm(self):
        with patch(
            "app.services.document_classification_service.generate_json_with_failover",
            side_effect=TimeoutError("provider timeout"),
        ):
            first = await classify_student_document_job(
                self.db,
                {
                    "review_id": str(self.review_id),
                    "document_id": str(self.document_id),
                    "user_id": self.user_id,
                },
            )

        second = await classify_student_document_job(
            self.db,
            {
                "review_id": str(self.review_id),
                "document_id": str(self.document_id),
                "user_id": self.user_id,
            },
            llm=AsyncMock(side_effect=AssertionError("LLM must not run on retry")),
        )

        self.assertEqual(first, second)
        review = await self.db.student_reviews.find_one({"_id": self.review_id})
        self.assertEqual(review["state"], "needs_confirmation")

    async def test_unknown_taxonomy_id_fails_without_writing_taxonomy(self):
        before = [deepcopy(row) async for row in self.db.curriculum_taxonomy.find({})]
        llm = LLMStub(self._response(subject_id=str(ObjectId())))

        with self.assertRaises(ValueError):
            await classify_student_document_job(
                self.db,
                {
                    "review_id": str(self.review_id),
                    "document_id": str(self.document_id),
                    "user_id": self.user_id,
                    "job_max_attempts": 1,
                },
                llm=llm,
            )

        after = [row async for row in self.db.curriculum_taxonomy.find({})]
        self.assertEqual(after, before)
        review = await self.db.student_reviews.find_one({"_id": self.review_id})
        self.assertEqual(review["state"], "failed")
        self.assertEqual(review["failed_step"], "classification")
        self.assertEqual(review["error_message"], "Không thể phân loại tài liệu. Vui lòng thử lại sau.")

    async def test_classification_process_one_recovers_after_transient_first_failure(self):
        calls = 0

        async def llm(prompt):
            nonlocal calls
            calls += 1
            if calls == 1:
                raise RuntimeError("provider timeout")
            return json.dumps(self._response(0.90))

        await self.db.background_jobs.insert_one({
            "job_type": STUDENT_DOCUMENT_CLASSIFY_JOB_TYPE,
            "payload": {
                "review_id": str(self.review_id),
                "document_id": str(self.document_id),
                "user_id": self.user_id,
                "job_max_attempts": 2,
            },
            "status": "pending",
            "attempts": 0,
            "max_attempts": 2,
            "next_run_at": datetime.now(timezone.utc),
            "locked_by": None,
            "locked_until": None,
        })
        handler = lambda payload: classify_student_document_job(self.db, payload, llm=llm)

        await process_one(
            self.db,
            job_types=[STUDENT_DOCUMENT_CLASSIFY_JOB_TYPE],
            worker_id="worker-1",
            handlers={STUDENT_DOCUMENT_CLASSIFY_JOB_TYPE: handler},
        )
        after_first = await self.db.student_reviews.find_one({"_id": self.review_id})
        self.assertEqual(after_first["state"], "classifying")
        self.assertNotIn("failed_step", after_first)
        await self.db.background_jobs.update_one(
            {"job_type": STUDENT_DOCUMENT_CLASSIFY_JOB_TYPE},
            {"$set": {"next_run_at": datetime.now(timezone.utc)}},
        )

        await process_one(
            self.db,
            job_types=[STUDENT_DOCUMENT_CLASSIFY_JOB_TYPE],
            worker_id="worker-2",
            handlers={STUDENT_DOCUMENT_CLASSIFY_JOB_TYPE: handler},
        )

        recovered = await self.db.student_reviews.find_one({"_id": self.review_id})
        job = await self.db.background_jobs.find_one({"job_type": STUDENT_DOCUMENT_CLASSIFY_JOB_TYPE})
        self.assertEqual(recovered["state"], "ready_to_generate")
        self.assertNotIn("error_message", recovered)
        self.assertNotIn("failed_step", recovered)
        self.assertNotIn("classification_failures", recovered)
        self.assertEqual(job["status"], "succeeded")
        self.assertEqual(calls, 2)

    async def test_legacy_taxonomy_allows_bounded_ai_metadata(self):
        await self._clear_taxonomy_metadata()

        classification = await classify_document(
            self.db,
            await self._document(),
            llm=LLMStub(self._response(grade=7, curriculum_version="legacy-2025")),
        )

        self.assertEqual(classification["grade"], 7)
        self.assertEqual(classification["curriculum_version"], "legacy-2025")

    async def test_legacy_taxonomy_rejects_invalid_inferred_grade(self):
        await self._clear_taxonomy_metadata()

        for grade in (None, True, 0, 13, 10.5):
            with self.subTest(grade=grade), self.assertRaises(ValueError):
                await classify_document(
                    self.db,
                    await self._document(),
                    llm=LLMStub(self._response(grade=grade)),
                )

    async def test_legacy_taxonomy_rejects_invalid_inferred_curriculum_version(self):
        await self._clear_taxonomy_metadata()

        for version in (None, "", " ", " 2018", "2018 ", "x" * 65):
            with self.subTest(version=version), self.assertRaises(ValueError):
                await classify_document(
                    self.db,
                    await self._document(),
                    llm=LLMStub(self._response(curriculum_version=version)),
                )

    async def test_populated_taxonomy_requires_exact_metadata_match(self):
        for overrides in ({"grade": 9}, {"curriculum_version": "2022"}):
            with self.subTest(overrides=overrides), self.assertRaises(ValueError):
                await classify_document(
                    self.db,
                    await self._document(),
                    llm=LLMStub(self._response(**overrides)),
                )

    async def test_handler_persists_only_normalized_keys_and_retry_skips_llm(self):
        llm = LLMStub(self._response(0.90))
        payload = {
            "review_id": str(self.review_id),
            "document_id": str(self.document_id),
            "user_id": self.user_id,
        }

        first = await classify_student_document_job(self.db, payload, llm=llm)
        second = await classify_student_document_job(self.db, payload, llm=llm)

        review = await self.db.student_reviews.find_one({"_id": self.review_id})
        document = await self.db.documents.find_one({"_id": self.document_id})
        self.assertEqual(first, second)
        self.assertEqual(len(llm.prompts), 1)
        self.assertEqual(set(review["classification"]), CLASSIFICATION_KEYS)
        self.assertEqual(set(document["classification"]), CLASSIFICATION_KEYS)
        self.assertEqual(document["classification"], review["classification"])
        self.assertEqual(review["state"], "ready_to_generate")

    async def test_retry_heals_document_after_post_review_write_failure_without_llm(self):
        llm = LLMStub(self._response(0.90))
        payload = {
            "review_id": str(self.review_id),
            "document_id": str(self.document_id),
            "user_id": self.user_id,
        }

        real_documents = self.db.documents

        class FailingDocuments:
            find_one = real_documents.find_one

            async def update_one(self, *_args, **_kwargs):
                raise RuntimeError("document sync failed")

        class FailingDocumentSyncDB:
            def __getattr__(_self, name):
                return FailingDocuments() if name == "documents" else getattr(self.db, name)

        with self.assertRaisesRegex(RuntimeError, "document sync failed"):
            await classify_student_document_job(FailingDocumentSyncDB(), payload, llm=llm)

        review_after_failure = await self.db.student_reviews.find_one({"_id": self.review_id})
        document_after_failure = await self.db.documents.find_one({"_id": self.document_id})
        self.assertEqual(review_after_failure["state"], "ready_to_generate")
        self.assertIn("classification", review_after_failure)
        self.assertNotIn("error_message", review_after_failure)
        self.assertNotIn("classification", document_after_failure)
        await self.db.student_reviews.update_one(
            {"_id": self.review_id},
            {"$set": {"state": "failed", "error_message": "stale failure"}},
        )

        recovered = await classify_student_document_job(self.db, payload, llm=llm)

        healed_review = await self.db.student_reviews.find_one({"_id": self.review_id})
        healed_document = await self.db.documents.find_one({"_id": self.document_id})
        self.assertEqual(len(llm.prompts), 1)
        self.assertEqual(healed_review["state"], "ready_to_generate")
        self.assertNotIn("error_message", healed_review)
        self.assertEqual(healed_document["classification"], healed_review["classification"])
        self.assertEqual(recovered, healed_review["classification"])

    async def test_lower_confidence_states_need_confirmation(self):
        for confidence in (0.60, 0.59):
            with self.subTest(confidence=confidence):
                db = AsyncMongoMockClient()[f"classification_{confidence}"]
                for collection_name in ("curriculum_taxonomy", "documents", "document_chunks", "student_reviews"):
                    source = getattr(self.db, collection_name)
                    rows = [deepcopy(row) async for row in source.find({})]
                    if rows:
                        await getattr(db, collection_name).insert_many(rows)
                await classify_student_document_job(
                    db,
                    {"review_id": str(self.review_id), "document_id": str(self.document_id), "user_id": self.user_id},
                    llm=LLMStub(self._response(confidence)),
                )
                review = await db.student_reviews.find_one({"_id": self.review_id})
                self.assertEqual(review["state"], "needs_confirmation")

    async def test_handler_requires_owned_document(self):
        await self.db.documents.update_one(
            {"_id": self.document_id}, {"$set": {"user_id": "other-user"}}
        )
        llm = LLMStub(self._response())

        with self.assertRaises(ValueError):
            await classify_student_document_job(
                self.db,
                {"review_id": str(self.review_id), "document_id": str(self.document_id), "user_id": self.user_id},
                llm=llm,
            )

        self.assertEqual(llm.prompts, [])

    async def test_handler_requires_indexed_document(self):
        await self.db.documents.update_one(
            {"_id": self.document_id}, {"$set": {"status": "processed"}}
        )
        llm = LLMStub(self._response())

        with self.assertRaises(ValueError):
            await classify_student_document_job(
                self.db,
                {
                    "review_id": str(self.review_id),
                    "document_id": str(self.document_id),
                    "user_id": self.user_id,
                    "job_max_attempts": 1,
                },
                llm=llm,
            )

        review = await self.db.student_reviews.find_one({"_id": self.review_id})
        self.assertEqual(review["state"], "failed")
        self.assertEqual(review["failed_step"], "classification")
        self.assertEqual(llm.prompts, [])

    async def test_worker_registers_student_classification_handler(self):
        from app.worker import HANDLERS

        self.assertIn(STUDENT_DOCUMENT_CLASSIFY_JOB_TYPE, HANDLERS)


class StudentReviewRouterTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.db = AsyncMongoMockClient().student_review_routes
        await ensure_student_review_indexes(self.db)
        await ensure_background_job_indexes(self.db)
        self.student = actor()
        self.legacy_user = actor("user")
        self.other = actor()
        self.subject_id = ObjectId()
        self.chapter_id = ObjectId()
        self.topic_id = ObjectId()
        await self.db.curriculum_taxonomy.insert_many([
            {
                "_id": self.subject_id,
                "node_type": "subject",
                "name": "Toán",
                "grade": 10,
                "curriculum_version": "2018",
                "created_by": "teacher-private",
            },
            {
                "_id": self.chapter_id,
                "node_type": "chapter",
                "name": "Hàm số",
                "parent_id": str(self.subject_id),
                "grade": 10,
                "curriculum_version": "2018",
            },
            {
                "_id": self.topic_id,
                "node_type": "topic",
                "name": "Hàm bậc hai",
                "parent_id": str(self.chapter_id),
                "grade": 10,
                "curriculum_version": "2018",
            },
            {
                "_id": ObjectId(),
                "node_type": "lesson",
                "name": "Nội dung nội bộ",
                "created_by": "teacher-private",
            },
        ])
        self.document_id = ObjectId()
        await self.db.documents.insert_one({
            "_id": self.document_id,
            "user_id": self.student.id,
            "original_filename": "ham-so.pdf",
            "status": "indexed",
            "deleted_at": None,
        })
        self.db_patch = patch("app.routers.student_reviews.get_database", return_value=self.db)
        self.db_patch.start()
        self.addCleanup(self.db_patch.stop)

    def create_payload(self, client_request_id="request-1"):
        return CreateStudentReviewRequest(
            document_id=str(self.document_id),
            client_request_id=client_request_id,
        )

    def classification_payload(self, **overrides):
        values = {
            "subject_id": str(self.subject_id),
            "grade": 10,
            "curriculum_version": "2018",
            "chapter_id": str(self.chapter_id),
            "topic_ids": [str(self.topic_id)],
        }
        values.update(overrides)
        return StudentReviewClassificationRequest(**values)

    async def insert_review(self, *, user_id=None, state="needs_confirmation", classification=None):
        now = datetime.now(timezone.utc)
        document = {
            "_id": ObjectId(),
            "user_id": user_id or self.student.id,
            "document_id": str(self.document_id),
            "title": "ham-so.pdf",
            "client_request_id": str(ObjectId()),
            "state": state,
            "created_at": now,
            "updated_at": now,
        }
        if classification is not None:
            document["classification"] = classification
        await self.db.student_reviews.insert_one(document)
        return document

    async def test_only_student_and_legacy_user_roles_are_allowed(self):
        for role in ("lecturer", "admin", "super_admin", "support"):
            with self.subTest(role=role), self.assertRaises(HTTPException) as raised:
                await list_student_reviews_route(current_user=actor(role))
            self.assertEqual(raised.exception.status_code, 403)

        self.assertEqual((await list_student_reviews_route(current_user=self.student))["items"], [])
        self.assertEqual((await list_student_reviews_route(current_user=self.legacy_user))["items"], [])

    async def test_taxonomy_options_are_student_read_only_and_owner_neutral(self):
        self.assertTrue(hasattr(student_reviews_router, "list_student_review_taxonomy_options_route"))
        before = [deepcopy(row) async for row in self.db.curriculum_taxonomy.find({})]

        student_result = await student_reviews_router.list_student_review_taxonomy_options_route(
            current_user=self.student
        )
        legacy_result = await student_reviews_router.list_student_review_taxonomy_options_route(
            current_user=self.legacy_user
        )

        self.assertEqual(student_result, legacy_result)
        self.assertEqual(
            [(item["node_type"], item["name"]) for item in student_result["items"]],
            [("chapter", "Hàm số"), ("subject", "Toán"), ("topic", "Hàm bậc hai")],
        )
        allowed_fields = {
            "id", "name", "node_type", "parent_id", "grade", "curriculum_version"
        }
        self.assertTrue(all(set(item) <= allowed_fields for item in student_result["items"]))
        self.assertNotIn("created_by", student_result["items"][1])
        after = [row async for row in self.db.curriculum_taxonomy.find({})]
        self.assertEqual(after, before)

    async def test_taxonomy_options_reject_non_students(self):
        self.assertTrue(hasattr(student_reviews_router, "list_student_review_taxonomy_options_route"))
        for role in ("lecturer", "admin"):
            with self.subTest(role=role), self.assertRaises(HTTPException) as raised:
                await student_reviews_router.list_student_review_taxonomy_options_route(
                    current_user=actor(role)
                )
            self.assertEqual(raised.exception.status_code, 403)

    async def test_create_is_owner_scoped_idempotent_and_enqueues_once(self):
        first = await create_student_review_route(self.create_payload(), current_user=self.student)
        second = await create_student_review_route(self.create_payload(), current_user=self.student)

        self.assertEqual(first["id"], second["id"])
        self.assertEqual(first["state"], "classifying")
        self.assertIsInstance(first["created_at"], str)
        self.assertEqual(await self.db.student_reviews.count_documents({}), 1)
        self.assertEqual(await self.db.background_jobs.count_documents({}), 1)
        job = await self.db.background_jobs.find_one({})
        self.assertEqual(job["job_type"], STUDENT_DOCUMENT_CLASSIFY_JOB_TYPE)
        self.assertEqual(job["payload"], {
            "review_id": first["id"],
            "document_id": str(self.document_id),
            "user_id": self.student.id,
            "job_max_attempts": 3,
        })

    async def test_create_handles_duplicate_key_race_without_second_job(self):
        real_reviews = self.db.student_reviews

        class RacingReviews:
            async def find_one(_self, *args, **kwargs):
                return await real_reviews.find_one(*args, **kwargs)

            async def insert_one(_self, document):
                await real_reviews.insert_one(document)
                raise DuplicateKeyError("simulated concurrent insert")

        class RacingDB:
            def __getitem__(_self, name):
                return RacingReviews() if name == "student_reviews" else self.db[name]

        with patch("app.routers.student_reviews.get_database", return_value=RacingDB()):
            response = await create_student_review_route(self.create_payload("race"), current_user=self.student)

        self.assertEqual(response["client_request_id"], "race")
        self.assertEqual(await self.db.student_reviews.count_documents({}), 1)
        self.assertEqual(await self.db.background_jobs.count_documents({}), 1)

    async def test_create_retry_recovers_after_enqueue_failure_without_duplicate_job(self):
        with patch(
            "app.routers.student_reviews.enqueue",
            new=AsyncMock(side_effect=RuntimeError("queue unavailable")),
        ):
            with self.assertRaisesRegex(RuntimeError, "queue unavailable"):
                await create_student_review_route(self.create_payload(), current_user=self.student)

        stranded = await self.db.student_reviews.find_one({})
        self.assertEqual(stranded["state"], "classifying")
        self.assertEqual(await self.db.background_jobs.count_documents({}), 0)

        recovered = await create_student_review_route(self.create_payload(), current_user=self.student)
        repeated = await create_student_review_route(self.create_payload(), current_user=self.student)

        self.assertEqual(recovered["id"], repeated["id"])
        jobs = [item async for item in self.db.background_jobs.find({})]
        self.assertEqual(len(jobs), 1)
        self.assertEqual(jobs[0]["idempotency_key"], f"student-document-classify:{recovered['id']}")

    async def test_create_rejects_foreign_or_unindexed_document_and_bad_client_id(self):
        await self.db.documents.update_one(
            {"_id": self.document_id}, {"$set": {"user_id": self.other.id}}
        )
        with self.assertRaises(HTTPException) as foreign:
            await create_student_review_route(self.create_payload(), current_user=self.student)
        self.assertEqual(foreign.exception.status_code, 404)

        await self.db.documents.update_one(
            {"_id": self.document_id},
            {"$set": {"user_id": self.student.id, "status": "processed"}},
        )
        with self.assertRaises(HTTPException) as unindexed:
            await create_student_review_route(self.create_payload(), current_user=self.student)
        self.assertEqual(unindexed.exception.status_code, 409)

        for value in ("", " ", "x" * 129):
            with self.subTest(value=value), self.assertRaises(ValidationError):
                CreateStudentReviewRequest(document_id=str(self.document_id), client_request_id=value)

    async def test_list_and_detail_are_serialized_and_owner_scoped(self):
        owned = await self.insert_review()
        foreign = await self.insert_review(user_id=self.other.id)

        listed = await list_student_reviews_route(current_user=self.student)
        detail = await get_student_review_route(str(owned["_id"]), current_user=self.student)

        self.assertEqual([item["id"] for item in listed["items"]], [str(owned["_id"])])
        self.assertIsInstance(detail["created_at"], str)
        with self.assertRaises(HTTPException) as raised:
            await get_student_review_route(str(foreign["_id"]), current_user=self.student)
        self.assertEqual(raised.exception.status_code, 404)

    async def test_classification_correction_is_normalized_and_syncs_owned_document(self):
        review = await self.insert_review()

        response = await confirm_student_review_classification_route(
            str(review["_id"]), self.classification_payload(), current_user=self.student
        )

        stored_review = await self.db.student_reviews.find_one({"_id": review["_id"]})
        stored_document = await self.db.documents.find_one({"_id": self.document_id})
        classification = stored_review["classification"]
        self.assertEqual(response["state"], "ready_to_generate")
        self.assertEqual(set(classification), CLASSIFICATION_KEYS)
        self.assertEqual(classification["method"], "student_corrected")
        self.assertEqual(classification["confidence"], 1.0)
        self.assertEqual(classification["status"], "confirmed")
        self.assertEqual(stored_document["classification"], classification)

    async def test_classification_correction_rejects_wrong_hierarchy_and_metadata(self):
        review = await self.insert_review()
        other_topic = ObjectId()
        await self.db.curriculum_taxonomy.insert_one({
            "_id": other_topic,
            "node_type": "topic",
            "parent_id": str(ObjectId()),
            "grade": 10,
            "curriculum_version": "2018",
        })
        for payload in (
            self.classification_payload(topic_ids=[str(ObjectId())]),
            self.classification_payload(topic_ids=[str(other_topic)]),
            self.classification_payload(grade=9),
            self.classification_payload(curriculum_version="2022"),
            self.classification_payload(curriculum_version=" 2018"),
        ):
            with self.subTest(payload=payload.model_dump()), self.assertRaises(HTTPException) as raised:
                await confirm_student_review_classification_route(
                    str(review["_id"]), payload, current_user=self.student
                )
            self.assertEqual(raised.exception.status_code, 422)

    async def test_classification_and_generation_are_foreign_id_404s(self):
        foreign = await self.insert_review(user_id=self.other.id, state="ready_to_generate")
        with self.assertRaises(HTTPException) as classification_error:
            await confirm_student_review_classification_route(
                str(foreign["_id"]), self.classification_payload(), current_user=self.student
            )
        self.assertEqual(classification_error.exception.status_code, 404)

        with self.assertRaises(HTTPException) as generation_error:
            await generate_student_review_route(
                str(foreign["_id"]),
                StudentReviewGenerationRequest(title="Ôn tập", question_count=5),
                current_user=self.student,
            )
        self.assertEqual(generation_error.exception.status_code, 404)

    def test_generation_input_boundary_is_strict(self):
        valid = StudentReviewGenerationRequest(
            title="  Ôn tập Hàm số  ",
            question_count=3,
            difficulty="easy",
            question_type="multiple_choice",
            bloom_level="remember",
            question_style_counts={"knowledge": 1, "cloze": 1, "calculation": 1},
        )
        self.assertEqual(valid.title, "Ôn tập Hàm số")
        for values in (
            {"title": " "},
            {"title": "x" * 121},
            {"title": "Ôn tập", "question_count": 2},
            {"title": "Ôn tập", "question_count": 51},
            {"title": "Ôn tập", "question_count": True},
            {"title": "Ôn tập", "difficulty": "adaptive"},
            {"title": "Ôn tập", "question_type": "true_false"},
            {"title": "Ôn tập", "bloom_level": "create"},
            {"title": "Ôn tập", "question_count": 5, "question_style_counts": {"knowledge": 2, "cloze": 1, "calculation": 1}},
            {"title": "Ôn tập", "question_style_counts": {"knowledge": -1, "cloze": 2, "calculation": 2}},
        ):
            with self.subTest(values=values), self.assertRaises(ValidationError):
                StudentReviewGenerationRequest(**values)

    async def test_generation_transition_is_retry_safe_and_enqueues_once(self):
        classification = {
            "subject_id": str(self.subject_id),
            "grade": 10,
            "curriculum_version": "2018",
            "chapter_id": str(self.chapter_id),
            "topic_ids": [str(self.topic_id)],
            "confidence": 1.0,
            "method": "student_corrected",
            "status": "confirmed",
            "classified_at": datetime.now(timezone.utc),
        }
        review = await self.insert_review(state="ready_to_generate", classification=classification)
        payload = StudentReviewGenerationRequest(
            title="  Ôn tập Hàm số  ", question_count=5, difficulty="hard"
        )

        first = await generate_student_review_route(str(review["_id"]), payload, current_user=self.student)
        second = await generate_student_review_route(str(review["_id"]), payload, current_user=self.student)

        self.assertEqual(first["state"], second["state"])
        self.assertEqual(first["state"], "generating")
        self.assertEqual(first["generation_config"], {
            "title": "Ôn tập Hàm số",
            "question_count": 5,
            "difficulty": "hard",
            "question_type": "multiple_choice",
            "bloom_level": None,
            "question_style_counts": None,
        })
        jobs = [item async for item in self.db.background_jobs.find({"job_type": STUDENT_REVIEW_GENERATE_JOB_TYPE})]
        self.assertEqual(len(jobs), 1)
        self.assertEqual(jobs[0]["payload"]["review_id"], str(review["_id"]))

    async def test_generation_retry_recovers_after_enqueue_failure_without_duplicate_job(self):
        review = await self.insert_review(
            state="ready_to_generate",
            classification={
                "subject_id": str(self.subject_id),
                "grade": 10,
                "curriculum_version": "2018",
                "chapter_id": str(self.chapter_id),
                "topic_ids": [str(self.topic_id)],
                "confidence": 1.0,
                "method": "student_corrected",
                "status": "confirmed",
                "classified_at": datetime.now(timezone.utc),
            },
        )
        payload = StudentReviewGenerationRequest(title="Ôn tập Hàm số", question_count=5)
        with patch(
            "app.routers.student_reviews.enqueue",
            new=AsyncMock(side_effect=RuntimeError("queue unavailable")),
        ):
            with self.assertRaisesRegex(RuntimeError, "queue unavailable"):
                await generate_student_review_route(
                    str(review["_id"]), payload, current_user=self.student
                )

        stranded = await self.db.student_reviews.find_one({"_id": review["_id"]})
        self.assertEqual(stranded["state"], "generating")
        self.assertEqual(await self.db.background_jobs.count_documents({}), 0)

        recovered = await generate_student_review_route(
            str(review["_id"]), payload, current_user=self.student
        )
        repeated = await generate_student_review_route(
            str(review["_id"]), payload, current_user=self.student
        )

        self.assertEqual(recovered["state"], "generating")
        jobs = [
            item async for item in self.db.background_jobs.find(
                {"job_type": STUDENT_REVIEW_GENERATE_JOB_TYPE}
            )
        ]
        self.assertEqual(len(jobs), 1)
        self.assertEqual(jobs[0]["idempotency_key"], f"student-review-generate:{review['_id']}")

    async def test_retry_failed_classification_is_owner_scoped_atomic_and_idempotent(self):
        review = await self.insert_review(state="failed")
        await self.db.student_reviews.update_one(
            {"_id": review["_id"]},
            {"$set": {
                "failed_step": "classification",
                "error_message": "safe error",
                "classification_failures": 3,
            }},
        )

        results = await asyncio.gather(
            retry_student_review_route(str(review["_id"]), current_user=self.student),
            retry_student_review_route(str(review["_id"]), current_user=self.student),
            return_exceptions=True,
        )

        accepted = [item for item in results if isinstance(item, dict)]
        rejected = [item for item in results if isinstance(item, HTTPException)]
        self.assertEqual(len(accepted), 1)
        self.assertEqual(accepted[0]["state"], "classifying")
        self.assertEqual(len(rejected), 1)
        self.assertEqual(rejected[0].status_code, 409)
        stored = await self.db.student_reviews.find_one({"_id": review["_id"]})
        self.assertNotIn("error_message", stored)
        self.assertNotIn("failed_step", stored)
        self.assertNotIn("classification_failures", stored)
        jobs = [item async for item in self.db.background_jobs.find({
            "job_type": STUDENT_DOCUMENT_CLASSIFY_JOB_TYPE,
        })]
        self.assertEqual(len(jobs), 1)
        self.assertEqual(jobs[0]["idempotency_key"], f"student-document-classify:{review['_id']}:retry:1")

        foreign = await self.insert_review(user_id=self.other.id, state="failed")
        await self.db.student_reviews.update_one(
            {"_id": foreign["_id"]}, {"$set": {"failed_step": "classification"}},
        )
        with self.assertRaises(HTTPException) as foreign_error:
            await retry_student_review_route(str(foreign["_id"]), current_user=self.student)
        self.assertEqual(foreign_error.exception.status_code, 404)
        with self.assertRaises(HTTPException) as lecturer_error:
            await retry_student_review_route(str(review["_id"]), current_user=actor("lecturer"))
        self.assertEqual(lecturer_error.exception.status_code, 403)

    async def test_retry_failed_generation_retains_config_and_classification(self):
        classification = {
            "subject_id": str(self.subject_id),
            "grade": 10,
            "curriculum_version": "2018",
            "chapter_id": str(self.chapter_id),
            "topic_ids": [str(self.topic_id)],
            "confidence": 1.0,
            "method": "student_corrected",
            "status": "confirmed",
            "classified_at": datetime.now(timezone.utc),
        }
        review = await self.insert_review(state="failed", classification=classification)
        config = StudentReviewGenerationRequest(title="Ôn tập Hàm số", question_count=5).model_dump()
        await self.db.student_reviews.update_one(
            {"_id": review["_id"]},
            {"$set": {
                "failed_step": "generation",
                "error_message": "safe error",
                "generation_failures": 3,
                "generation_config": config,
            }},
        )

        response = await retry_student_review_route(str(review["_id"]), current_user=self.student)

        self.assertEqual(response["state"], "generating")
        self.assertEqual(response["classification"]["subject_id"], classification["subject_id"])
        self.assertEqual(response["classification"]["status"], "confirmed")
        self.assertEqual(response["generation_config"], config)
        job = await self.db.background_jobs.find_one({"job_type": STUDENT_REVIEW_GENERATE_JOB_TYPE})
        self.assertEqual(job["idempotency_key"], f"student-review-generate:{review['_id']}:retry:1")

    async def test_retry_accepts_enqueue_that_committed_before_ack_error(self):
        review = await self.insert_review(state="failed")
        await self.db.student_reviews.update_one(
            {"_id": review["_id"]},
            {"$set": {"failed_step": "classification", "error_message": "safe error"}},
        )
        from app.services.background_job_service import enqueue as real_enqueue

        async def committed_then_raised(*args, **kwargs):
            await real_enqueue(*args, **kwargs)
            raise RuntimeError("ack lost")

        with patch("app.routers.student_reviews.enqueue", new=committed_then_raised):
            response = await retry_student_review_route(
                str(review["_id"]), current_user=self.student
            )

        stored = await self.db.student_reviews.find_one({"_id": review["_id"]})
        self.assertEqual(response["state"], "classifying")
        self.assertEqual(stored["classification_retry_round"], 1)
        self.assertEqual(await self.db.background_jobs.count_documents({}), 1)

    async def test_retry_uses_next_round_when_ambiguous_job_is_terminal(self):
        review = await self.insert_review(state="failed")
        await self.db.student_reviews.update_one(
            {"_id": review["_id"]},
            {"$set": {"failed_step": "classification", "error_message": "safe error"}},
        )
        from app.services.background_job_service import enqueue as real_enqueue

        calls = 0

        async def terminal_then_raised(*args, **kwargs):
            nonlocal calls
            calls += 1
            job_id = await real_enqueue(*args, **kwargs)
            if calls == 1:
                await self.db.background_jobs.update_one(
                    {"_id": ObjectId(job_id)}, {"$set": {"status": "dead_letter"}}
                )
                raise RuntimeError("ack lost")
            return job_id

        with patch("app.routers.student_reviews.enqueue", new=terminal_then_raised):
            response = await retry_student_review_route(
                str(review["_id"]), current_user=self.student
            )

        stored = await self.db.student_reviews.find_one({"_id": review["_id"]})
        fresh = await self.db.background_jobs.find_one({
            "idempotency_key": f"student-document-classify:{review['_id']}:retry:2"
        })
        self.assertEqual(response["state"], "classifying")
        self.assertEqual(stored["classification_retry_round"], 2)
        self.assertEqual(fresh["status"], "pending")


class StudentReviewGenerationJobTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.db = AsyncMongoMockClient().student_review_generation
        await ensure_student_review_indexes(self.db)
        self.user_id = str(ObjectId())
        self.document_id = ObjectId()
        self.review_id = ObjectId()
        self.subject_id = str(ObjectId())
        self.chapter_id = str(ObjectId())
        self.topic_id = str(ObjectId())
        self.classification = {
            "subject_id": self.subject_id,
            "grade": 10,
            "curriculum_version": "2018",
            "chapter_id": self.chapter_id,
            "topic_ids": [self.topic_id],
            "confidence": 1.0,
            "method": "student_corrected",
            "status": "confirmed",
            "classified_at": datetime.now(timezone.utc),
        }
        self.config = {
            "title": "Ôn tập Hàm số",
            "question_count": 5,
            "difficulty": "medium",
            "question_type": "multiple_choice",
            "bloom_level": "understand",
        }
        await self.db.documents.insert_one({
            "_id": self.document_id,
            "user_id": self.user_id,
            "original_filename": "ham-so.pdf",
            "status": "indexed",
            "deleted_at": None,
        })
        await self.db.student_reviews.insert_one({
            "_id": self.review_id,
            "user_id": self.user_id,
            "document_id": str(self.document_id),
            "state": "generating",
            "classification": self.classification,
            "generation_config": self.config,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        })

    def payload(self):
        return {
            "review_id": str(self.review_id),
            "document_id": str(self.document_id),
            "user_id": self.user_id,
        }

    def generator(self, count, calls):
        async def generate(**kwargs):
            calls.append(kwargs)
            questions = [
                {
                    "question": f"Câu {index}?",
                    "options": {"A": "Đúng", "B": "Sai", "C": "Ba", "D": "Bốn"},
                    "correct_answer": "A",
                    "explanation": "Theo tài liệu.",
                    "difficulty": kwargs["difficulty"],
                    "question_type": "multiple_choice",
                    "source_chunk_ids": [f"{self.document_id}:0"],
                    "grounding_excerpt": "Hàm bậc hai có đồ thị là parabol.",
                }
                for index in range(count)
            ]
            question_set = {
                "document_id": kwargs["document_id"],
                "user_id": kwargs["user_id"],
                "questions": questions,
                "question_count": len(questions),
                "created_at": datetime.now(timezone.utc),
                **kwargs["question_set_metadata"],
            }
            inserted = await self.db.question_sets.insert_one(question_set)
            question_set["_id"] = str(inserted.inserted_id)
            return question_set
        return generate

    async def test_full_generation_is_private_grounded_and_idempotent(self):
        calls = []
        generator = self.generator(5, calls)

        first = await generate_student_review_job(self.db, self.payload(), generator=generator)
        second = await generate_student_review_job(self.db, self.payload(), generator=generator)

        self.assertEqual(first["question_set_id"], second["question_set_id"])
        self.assertEqual(len(calls), 1)
        stored = await self.db.question_sets.find_one({"_id": ObjectId(first["question_set_id"])})
        self.assertEqual(stored["purpose"], "student_review")
        self.assertEqual(stored["review_id"], str(self.review_id))
        self.assertEqual(stored["bank_status"], "private")
        self.assertEqual(stored["promotion_status"], "not_submitted")
        self.assertEqual(stored["curriculum_version"], "2018")
        self.assertEqual(stored["chapter_id"], self.chapter_id)
        self.assertEqual(stored["source_document_id"], str(self.document_id))
        self.assertEqual(stored["questions"][0]["source_chunk_ids"], [f"{self.document_id}:0"])
        self.assertEqual(stored["questions"][0]["grounding_excerpt"], "Hàm bậc hai có đồ thị là parabol.")
        review = await self.db.student_reviews.find_one({"_id": self.review_id})
        self.assertEqual(review["state"], "ready")
        self.assertEqual(review["question_set_id"], first["question_set_id"])

    async def test_overlapping_generation_persists_one_private_set(self):
        calls = []
        both_started = asyncio.Event()
        base_generator = self.generator(5, calls)
        started = 0

        async def paused_generator(**kwargs):
            nonlocal started
            started += 1
            if started == 2:
                both_started.set()
            await both_started.wait()
            return await base_generator(**kwargs)

        first, second = await asyncio.gather(
            generate_student_review_job(self.db, self.payload(), generator=paused_generator),
            generate_student_review_job(self.db, self.payload(), generator=paused_generator),
        )

        self.assertEqual(first["question_set_id"], second["question_set_id"])
        self.assertEqual(
            await self.db.question_sets.count_documents({
                "user_id": self.user_id,
                "purpose": "student_review",
                "review_id": str(self.review_id),
            }),
            1,
        )

    async def test_valid_set_retry_survives_source_soft_delete_without_generator(self):
        calls = []
        first = await generate_student_review_job(
            self.db, self.payload(), generator=self.generator(5, calls)
        )
        await self.db.documents.update_one(
            {"_id": self.document_id},
            {"$set": {"deleted_at": datetime.now(timezone.utc)}},
        )

        retry = await generate_student_review_job(
            self.db, self.payload(), generator=self.generator(5, calls)
        )

        review = await self.db.student_reviews.find_one({"_id": self.review_id})
        self.assertEqual(retry["question_set_id"], first["question_set_id"])
        self.assertEqual(review["state"], "ready")
        self.assertEqual(review["question_set_id"], first["question_set_id"])
        self.assertNotIn("error_message", review)
        self.assertEqual(len(calls), 1)

    async def test_retry_attaches_persisted_orphan_without_second_generation(self):
        calls = []
        with patch(
            "app.services.student_review_service._finish_generation",
            new=AsyncMock(side_effect=RuntimeError("review attachment failed")),
        ):
            with self.assertRaisesRegex(RuntimeError, "review attachment failed"):
                await generate_student_review_job(
                    self.db, self.payload(), generator=self.generator(5, calls)
                )

        self.assertEqual(await self.db.question_sets.count_documents({}), 1)
        after_failure = await self.db.student_reviews.find_one({"_id": self.review_id})
        self.assertNotIn("question_set_id", after_failure)

        recovered = await generate_student_review_job(
            self.db, self.payload(), generator=self.generator(5, calls)
        )

        self.assertEqual(len(calls), 1)
        self.assertEqual(await self.db.question_sets.count_documents({}), 1)
        review = await self.db.student_reviews.find_one({"_id": self.review_id})
        self.assertEqual(review["state"], "ready")
        self.assertEqual(review["question_set_id"], recovered["question_set_id"])

    async def test_partial_generation_keeps_set_and_adds_user_warning(self):
        result = await generate_student_review_job(self.db, self.payload(), generator=self.generator(3, []))

        review = await self.db.student_reviews.find_one({"_id": self.review_id})
        self.assertEqual(review["state"], "ready")
        self.assertEqual(review["question_set_id"], result["question_set_id"])
        self.assertIn("3/5", review["warning"])

    async def test_under_three_fails_and_removes_incomplete_set(self):
        result = await generate_student_review_job(self.db, self.payload(), generator=self.generator(2, []))

        review = await self.db.student_reviews.find_one({"_id": self.review_id})
        self.assertEqual(result["state"], "failed")
        self.assertEqual(review["state"], "failed")
        self.assertNotIn("question_set_id", review)
        self.assertIn("ít nhất 3", review["error_message"])
        self.assertEqual(review["failed_step"], "generation")
        self.assertEqual(await self.db.question_sets.count_documents({}), 0)

    async def test_invalid_question_does_not_count_toward_ready_minimum(self):
        calls = []
        generator = self.generator(3, calls)

        async def malformed_generator(**kwargs):
            question_set = await generator(**kwargs)
            question_set["questions"][2]["options"] = {"A": "Đúng", "B": "Sai"}
            await self.db.question_sets.update_one(
                {"_id": ObjectId(question_set["_id"])},
                {"$set": {"questions": question_set["questions"]}},
            )
            return question_set

        result = await generate_student_review_job(
            self.db, {**self.payload(), "job_max_attempts": 1}, generator=malformed_generator
        )

        review = await self.db.student_reviews.find_one({"_id": self.review_id})
        self.assertEqual(result["state"], "failed")
        self.assertEqual(review["failed_step"], "generation")
        self.assertEqual(await self.db.question_sets.count_documents({}), 0)

    async def test_incomplete_orphan_cleanup_must_succeed_before_retry_generation(self):
        orphan_id = ObjectId()
        await self.db.question_sets.insert_one({
            "_id": orphan_id,
            "document_id": str(self.document_id),
            "user_id": self.user_id,
            "purpose": "student_review",
            "review_id": str(self.review_id),
            "deleted_at": None,
            "questions": [{"question": "Câu 1?"}, {"question": "Câu 2?"}],
        })
        calls = []
        real_question_sets = self.db.question_sets

        class FailedCleanupCollection:
            find_one = real_question_sets.find_one
            count_documents = real_question_sets.count_documents

            async def delete_one(self, *_args, **_kwargs):
                return type("DeleteResult", (), {"deleted_count": 0})()

        class FailedCleanupDB:
            def __getattr__(_self, name):
                if name == "question_sets":
                    return FailedCleanupCollection()
                return getattr(self.db, name)

        with self.assertRaisesRegex(RuntimeError, "could not be removed"):
            await generate_student_review_job(
                FailedCleanupDB(), self.payload(), generator=self.generator(5, calls)
            )

        self.assertEqual(calls, [])
        self.assertIsNotNone(await self.db.question_sets.find_one({"_id": orphan_id}))
        self.assertEqual(await self.db.question_sets.count_documents({}), 1)

        recovered = await generate_student_review_job(
            self.db, self.payload(), generator=self.generator(5, calls)
        )

        self.assertEqual(len(calls), 1)
        self.assertEqual(await self.db.question_sets.count_documents({}), 1)
        self.assertNotEqual(recovered["question_set_id"], str(orphan_id))

    async def test_other_terminal_failure_is_safe_and_reraised(self):
        async def failing_generator(**_kwargs):
            raise RuntimeError("provider secret")

        with self.assertRaisesRegex(RuntimeError, "provider secret"):
            await generate_student_review_job(
                self.db, {**self.payload(), "job_max_attempts": 1}, generator=failing_generator
            )

        review = await self.db.student_reviews.find_one({"_id": self.review_id})
        self.assertEqual(review["state"], "failed")
        self.assertEqual(review["failed_step"], "generation")
        self.assertNotIn("provider secret", review["error_message"])
        self.assertNotIn("question_set_id", review)

    async def test_worker_timeout_marks_generation_failed(self):
        async def stuck_generator(**_kwargs):
            await asyncio.Event().wait()

        await self.db.background_jobs.insert_one({
            "job_type": STUDENT_REVIEW_GENERATE_JOB_TYPE,
            "payload": {**self.payload(), "job_max_attempts": 1},
            "status": "pending",
            "attempts": 0,
            "max_attempts": 1,
            "next_run_at": datetime.now(timezone.utc),
            "locked_by": None,
            "locked_until": None,
        })
        handler = lambda payload: generate_student_review_job(
            self.db, payload, generator=stuck_generator
        )

        await process_one(
            self.db,
            job_types=[STUDENT_REVIEW_GENERATE_JOB_TYPE],
            worker_id="worker-1",
            handlers={STUDENT_REVIEW_GENERATE_JOB_TYPE: handler},
            timeout_seconds=0.01,
        )

        review = await self.db.student_reviews.find_one({"_id": self.review_id})
        job = await self.db.background_jobs.find_one({"job_type": STUDENT_REVIEW_GENERATE_JOB_TYPE})
        self.assertEqual(review["state"], "failed")
        self.assertEqual(review["failed_step"], "generation")
        self.assertEqual(job["status"], "dead_letter")

    async def test_generation_failure_stays_active_until_configured_final_attempt(self):
        async def failing_generator(**_kwargs):
            raise RuntimeError("provider secret")

        payload = {**self.payload(), "job_max_attempts": 2}
        with self.assertRaises(RuntimeError):
            await generate_student_review_job(self.db, payload, generator=failing_generator)
        after_first = await self.db.student_reviews.find_one({"_id": self.review_id})
        self.assertEqual(after_first["state"], "generating")
        self.assertNotIn("failed_step", after_first)

        with self.assertRaises(RuntimeError):
            await generate_student_review_job(self.db, payload, generator=failing_generator)
        exhausted = await self.db.student_reviews.find_one({"_id": self.review_id})
        self.assertEqual(exhausted["state"], "failed")
        self.assertEqual(exhausted["failed_step"], "generation")
        self.assertEqual(exhausted["generation_failures"], 2)

    async def test_job_requires_owner_scoped_document_before_generator(self):
        calls = []
        await self.db.documents.update_one(
            {"_id": self.document_id}, {"$set": {"user_id": "foreign"}}
        )
        with self.assertRaises(ValueError):
            await generate_student_review_job(self.db, self.payload(), generator=self.generator(5, calls))
        self.assertEqual(calls, [])

    async def test_worker_registers_student_generation_handler(self):
        from app.worker import HANDLERS

        self.assertIn(STUDENT_REVIEW_GENERATE_JOB_TYPE, HANDLERS)


class StudentReviewGeneratorSeamTests(unittest.IsolatedAsyncioTestCase):
    async def test_student_review_uses_extracts_when_ai_returns_no_valid_questions(self):
        from app.services import question_generation_service

        db = AsyncMongoMockClient().student_review_invalid_ai_fallback
        document_id = ObjectId()
        await db.documents.insert_one({
            "_id": document_id,
            "user_id": "student",
            "media_kind": "document",
            "original_filename": "ham-so.pdf",
            "deleted_at": None,
        })
        await db.document_chunks.insert_one({
            "document_id": str(document_id),
            "user_id": "student",
            "chunk_index": 0,
            "content": (
                "Đạo hàm cho biết tốc độ biến thiên của hàm số. "
                "Điểm cực đại là nơi hàm số đổi từ tăng sang giảm. "
                "Điểm cực tiểu là nơi hàm số đổi từ giảm sang tăng. "
                "Bảng biến thiên giúp mô tả chiều biến đổi của hàm số."
            ),
        })

        with patch.object(question_generation_service, "get_database", return_value=db), patch.object(
            question_generation_service.settings, "AI_TEXT_PROVIDER", "claude"
        ), patch.object(
            question_generation_service, "is_claude_available", return_value=True
        ), patch.object(
            question_generation_service, "generate_json_with_failover", return_value="[]"
        ), patch.object(
            question_generation_service,
            "select_diverse_questions",
            side_effect=lambda items, count: (items[:count], {"applied": False}),
        ):
            result = await question_generation_service.generate_questions(
                document_id=str(document_id),
                user_id="student",
                question_count=10,
                difficulty="medium",
                question_type="multiple_choice",
                question_style_counts={"knowledge": 10, "cloze": 0, "calculation": 0},
                question_set_metadata={"purpose": "student_review"},
            )

        self.assertEqual(result["question_count"], 10)
        self.assertEqual(result["generation_method"], "extractive_fallback")

    async def test_student_review_accepts_three_valid_ai_questions_when_ten_were_requested(self):
        from app.services import question_generation_service

        db = AsyncMongoMockClient().student_review_partial_ai_result
        document_id = ObjectId()
        await db.documents.insert_one({
            "_id": document_id,
            "user_id": "student",
            "media_kind": "document",
            "original_filename": "ham-so.pdf",
            "deleted_at": None,
        })
        await db.document_chunks.insert_one({
            "document_id": str(document_id),
            "user_id": "student",
            "chunk_index": 0,
            "content": "Đạo hàm xác định chiều biến thiên của hàm số.",
        })
        questions = [{
            "question": f"Câu hỏi {index}?",
            "options": {"A": f"Đúng {index}", "B": f"Sai B {index}", "C": f"Sai C {index}", "D": f"Sai D {index}"},
            "correct_answer": "A",
            "explanation": "Theo học liệu.",
            "difficulty": "medium",
            "question_type": "multiple_choice",
        } for index in range(3)]

        with patch.object(question_generation_service, "get_database", return_value=db), patch.object(
            question_generation_service.settings, "AI_TEXT_PROVIDER", "claude"
        ), patch.object(
            question_generation_service, "is_claude_available", return_value=True
        ), patch.object(
            question_generation_service, "generate_json_with_failover", return_value=json.dumps(questions)
        ), patch.object(
            question_generation_service, "extract_keywords", return_value=[]
        ), patch.object(
            question_generation_service,
            "select_diverse_questions",
            side_effect=lambda items, count: (items[:count], {"applied": False}),
        ):
            result = await question_generation_service.generate_questions(
                document_id=str(document_id),
                user_id="student",
                question_count=10,
                difficulty="medium",
                question_type="multiple_choice",
                question_style_counts={"knowledge": 10, "cloze": 0, "calculation": 0},
                question_set_metadata={"purpose": "student_review"},
            )

        self.assertEqual(result["question_count"], 3)

    async def test_student_review_restores_requested_count_after_diversity_filtering(self):
        from app.services import question_generation_service

        db = AsyncMongoMockClient().student_review_exact_count
        document_id = ObjectId()
        excerpt = "Đạo hàm xác định chiều biến thiên của hàm số."
        await db.documents.insert_one({
            "_id": document_id,
            "user_id": "student",
            "media_kind": "document",
            "original_filename": "ham-so.pdf",
            "deleted_at": None,
        })
        await db.document_chunks.insert_one({
            "document_id": str(document_id), "user_id": "student", "chunk_index": 0, "content": excerpt,
        })
        questions = [{
            "question": f"Câu hỏi {index}?",
            "options": {"A": f"Đúng {index}", "B": f"Sai B {index}", "C": f"Sai C {index}", "D": f"Sai D {index}"},
            "correct_answer": "A",
            "explanation": excerpt,
            "difficulty": "medium",
            "question_type": "multiple_choice",
            "review_question_style": "knowledge",
        } for index in range(10)]

        with patch.object(question_generation_service, "get_database", return_value=db), patch.object(
            question_generation_service.settings, "AI_TEXT_PROVIDER", "claude"
        ), patch.object(
            question_generation_service, "is_claude_available", return_value=True
        ), patch.object(
            question_generation_service, "generate_json_with_failover", return_value=json.dumps(questions)
        ), patch.object(
            question_generation_service, "extract_keywords", return_value=[]
        ), patch.object(
            question_generation_service,
            "select_diverse_questions",
            side_effect=lambda items, count: (items[:8], {"applied": False}),
        ):
            result = await question_generation_service.generate_questions(
                document_id=str(document_id),
                user_id="student",
                question_count=10,
                difficulty="medium",
                question_type="multiple_choice",
                question_style_counts={"knowledge": 10, "cloze": 0, "calculation": 0},
                question_set_metadata={"purpose": "student_review"},
            )

        self.assertEqual(result["question_count"], 10)

    async def test_student_review_uses_grounded_extracts_when_every_ai_provider_is_down(self):
        from app.services import question_generation_service

        db = AsyncMongoMockClient().student_review_extract_fallback
        document_id = ObjectId()
        await db.documents.insert_one({
            "_id": document_id,
            "user_id": "student",
            "media_kind": "document",
            "original_filename": "ham-so.pdf",
            "deleted_at": None,
        })
        await db.document_chunks.insert_one({
            "document_id": str(document_id),
            "user_id": "student",
            "chunk_index": 0,
            "content": (
                "EzEdu AI — Học liệu giả lập dùng cho demo\n"
                "Đạo hàm cho biết tốc độ biến thiên của hàm số. "
                "Điểm cực đại là nơi hàm số đổi từ tăng sang giảm. "
                "Điểm cực tiểu là nơi hàm số đổi từ giảm sang tăng. "
                "Bảng biến thiên giúp mô tả chiều biến đổi của hàm số. "
                "x + y = z và a + b = c, ta có x = 2 trong ví dụ."
            ),
        })

        with patch.object(question_generation_service, "get_database", return_value=db), \
             patch.object(question_generation_service.settings, "AI_TEXT_PROVIDER", "claude"), \
             patch.object(question_generation_service, "is_claude_available", return_value=True), \
             patch.object(
                 question_generation_service,
                 "generate_json_with_failover",
                 side_effect=TimeoutError("all providers down"),
             ), patch.object(
                 question_generation_service,
                 "select_diverse_questions",
                 side_effect=lambda items, count: (items[:count], {"applied": False}),
             ):
            result = await question_generation_service.generate_questions(
                document_id=str(document_id),
                user_id="student",
                question_count=10,
                difficulty="medium",
                question_type="multiple_choice",
                question_style_counts={"knowledge": 3, "cloze": 2, "calculation": 5},
                question_set_metadata={"purpose": "student_review"},
            )

        self.assertEqual(result["question_count"], 10)
        self.assertEqual(result["generation_method"], "extractive_fallback")
        self.assertEqual(
            Counter(question["review_question_style"] for question in result["questions"]),
            Counter({"knowledge": 3, "cloze": 2, "calculation": 5}),
        )
        self.assertEqual(len({question["question"] for question in result["questions"]}), 10)
        self.assertTrue(all(question["grounding_excerpt"] for question in result["questions"]))
        self.assertTrue(all("demo" not in question["question"].lower() for question in result["questions"]))

    async def test_student_review_generation_falls_back_when_claude_times_out(self):
        from app.services import llm_service, question_generation_service

        db = AsyncMongoMockClient().student_review_provider_fallback
        document_id = ObjectId()
        await db.documents.insert_one({
            "_id": document_id,
            "user_id": "student",
            "media_kind": "document",
            "original_filename": "ham-so.pdf",
            "deleted_at": None,
        })
        await db.document_chunks.insert_one({
            "document_id": str(document_id),
            "user_id": "student",
            "chunk_index": 0,
            "content": "Hàm bậc hai có đồ thị là parabol.",
        })
        questions = [{
            "question": f"Câu hỏi {index}?",
            "options": {"A": "Một", "B": "Hai", "C": "Ba", "D": "Bốn"},
            "correct_answer": "A",
            "explanation": "Theo tài liệu.",
            "difficulty": "medium",
            "question_type": "multiple_choice",
        } for index in range(3)]

        with patch.object(question_generation_service, "get_database", return_value=db), \
             patch.object(question_generation_service.settings, "AI_TEXT_PROVIDER", "claude"), \
             patch.object(question_generation_service, "is_claude_available", return_value=True), \
             patch.object(question_generation_service, "claude_generate_json", side_effect=TimeoutError("claude timeout")), \
             patch.object(llm_service, "claude_generate_json", side_effect=TimeoutError("claude timeout")), \
             patch.object(llm_service, "is_groq_available", return_value=True), \
             patch.object(llm_service, "generate_json", return_value=json.dumps(questions)) as groq, \
             patch.object(question_generation_service, "extract_keywords", return_value=[]), \
             patch.object(
                 question_generation_service,
                 "select_diverse_questions",
                 side_effect=lambda items, count: (items[:count], {"applied": False}),
             ):
            result = await question_generation_service.generate_questions(
                document_id=str(document_id),
                user_id="student",
                question_count=3,
                difficulty="medium",
                question_type="multiple_choice",
                question_set_metadata={"purpose": "student_review"},
            )

        self.assertEqual(result["question_count"], 3)
        groq.assert_called_once()

    async def test_student_review_generator_rejects_invalid_multiple_choice_shapes(self):
        from app.services import question_generation_service

        valid = {
            "question": "Đồ thị hàm bậc hai là gì?",
            "options": {"A": "Parabol", "B": "Đường thẳng", "C": "Đường tròn", "D": "Điểm"},
            "correct_answer": "A",
            "explanation": "Theo tài liệu.",
            "difficulty": "medium",
            "question_type": "multiple_choice",
        }
        invalid_questions = []
        for options in (
            {"A": "Một", "B": "Hai"},
            {"A": "Một", "B": "Hai", "C": "Ba"},
            {"A": "Một", "B": "Hai", "C": "Ba", "D": "Bốn", "E": "Năm"},
            {"": "Một", "B": "Hai", "C": "Ba", "D": "Bốn"},
            {"A": "", "B": "Hai", "C": "Ba", "D": "Bốn"},
            {"A": "Trùng", "B": "Trùng", "C": "Ba", "D": "Bốn"},
        ):
            invalid_questions.append({**valid, "options": options})
        invalid_questions.extend([
            {**valid, "explanation": " "},
            {**valid, "correct_answer": "E"},
        ])

        for index, question in enumerate(invalid_questions):
            with self.subTest(index=index):
                db = AsyncMongoMockClient()[f"student_review_invalid_{index}"]
                document_id = ObjectId()
                await db.documents.insert_one({
                    "_id": document_id,
                    "user_id": "student",
                    "media_kind": "document",
                    "original_filename": "ham-so.pdf",
                    "deleted_at": None,
                })
                await db.document_chunks.insert_one({
                    "document_id": str(document_id),
                    "user_id": "student",
                    "chunk_index": 0,
                    "content": "Hàm bậc hai có đồ thị là parabol.",
                })
                with patch.object(question_generation_service, "get_database", return_value=db), patch.object(
                    question_generation_service.settings, "AI_TEXT_PROVIDER", "claude"
                ), patch.object(
                    question_generation_service, "is_claude_available", return_value=True
                ), patch.object(
                    question_generation_service, "generate_json_with_failover", return_value=json.dumps([question])
                ), patch.object(
                    question_generation_service, "extract_keywords", return_value=[]
                ):
                    with self.assertRaises(ValueError):
                        await question_generation_service.generate_questions(
                            document_id=str(document_id),
                            user_id="student",
                            question_count=1,
                            difficulty="medium",
                            question_type="multiple_choice",
                            question_set_metadata={"purpose": "student_review"},
                        )
                self.assertEqual(await db.question_sets.count_documents({}), 0)

    async def test_existing_generator_merges_trusted_metadata_and_keeps_grounding(self):
        from app.services import question_generation_service

        db = AsyncMongoMockClient().student_review_generator_seam
        user_id = str(ObjectId())
        document_id = ObjectId()
        excerpt = "Hàm bậc hai có đồ thị là một parabol. " * 20
        await db.documents.insert_one({
            "_id": document_id,
            "user_id": user_id,
            "media_kind": "document",
            "original_filename": "ham-so.pdf",
            "deleted_at": None,
        })
        await db.document_chunks.insert_one({
            "document_id": str(document_id),
            "user_id": user_id,
            "chunk_index": 0,
            "content": excerpt,
        })
        questions = [
            {
                "question": f"Câu hỏi số {index} về hàm bậc hai?",
                "options": {"A": "Parabol", "B": "Đường thẳng", "C": "Đường tròn", "D": "Điểm"},
                "correct_answer": "A",
                "explanation": "Theo tài liệu, đồ thị là parabol.",
                "difficulty": "medium",
                "question_type": "multiple_choice",
                "bloom_level": "understand",
                "language": "vi",
                "source_chunk_ids": [f"{document_id}:0"],
                "grounding_excerpt": excerpt,
            }
            for index in range(3)
        ]
        metadata = {
            "purpose": "student_review",
            "review_id": str(ObjectId()),
            "bank_status": "private",
            "promotion_status": "not_submitted",
            "curriculum_version": "2018",
            "chapter_id": str(ObjectId()),
            "source_document_id": str(document_id),
        }

        with patch.object(question_generation_service, "get_database", return_value=db), patch.object(
            question_generation_service.settings, "AI_TEXT_PROVIDER", "claude"
        ), patch.object(
            question_generation_service, "is_claude_available", return_value=True
        ), patch.object(
            question_generation_service, "generate_json_with_failover", return_value=json.dumps(questions)
        ), patch.object(
            question_generation_service, "resolve_context", new=AsyncMock(return_value=[])
        ), patch.object(
            question_generation_service, "extract_keywords", return_value=[]
        ), patch.object(
            question_generation_service,
            "select_diverse_questions",
            side_effect=lambda items, count: (items[:count], {"applied": False}),
        ):
            result = await question_generation_service.generate_questions(
                document_id=str(document_id),
                user_id=user_id,
                question_count=3,
                difficulty="medium",
                question_type="multiple_choice",
                subject_id=str(ObjectId()),
                grade=10,
                topic_id=str(ObjectId()),
                question_set_metadata=metadata,
            )

        stored = await db.question_sets.find_one({"_id": ObjectId(result["_id"])})
        for key, value in metadata.items():
            self.assertEqual(stored[key], value)
        self.assertEqual(stored["questions"][0]["source_chunk_ids"], [f"{document_id}:0"])
        self.assertEqual(stored["questions"][0]["grounding_excerpt"], excerpt.strip()[:500])


class StudentReviewPurposeSeparationTests(unittest.IsolatedAsyncioTestCase):
    async def test_official_question_routes_exclude_student_review_but_keep_legacy_sets(self):
        from app.routers import admin_content, questions

        db = AsyncMongoMockClient().student_review_purpose
        user = actor()
        document_id = str(ObjectId())
        now = datetime.now(timezone.utc)
        common = {
            "document_id": document_id,
            "user_id": user.id,
            "document_name": "Tài liệu",
            "question_count": 3,
            "difficulty": "medium",
            "question_type": "multiple_choice",
            "questions": [],
            "published_question_count": 1,
            "audience_type": "all",
            "created_at": now,
            "updated_at": now,
            "deleted_at": None,
        }
        legacy_id = (await db.question_sets.insert_one(dict(common))).inserted_id
        review_id = (await db.question_sets.insert_one({**common, "purpose": "student_review"})).inserted_id
        await db.documents.insert_one({"_id": ObjectId(document_id), "user_id": user.id})

        with patch("app.routers.questions.get_database", return_value=db):
            history = await questions.list_my_history(
                current_user=user,
                search=None,
                question_type=None,
                difficulty=None,
                document_id=None,
                cursor=None,
                limit=20,
            )
            by_document = await questions.get_questions_by_document(document_id, current_user=user)
            published = await questions.list_published_question_sets(
                current_user=user,
                search=None,
                subject_id=None,
                chapter_id=None,
                limit=20,
            )
            with self.assertRaises(HTTPException) as hidden:
                await questions.get_question_set(str(review_id), current_user=user)
        with patch("app.routers.admin_content.get_database", return_value=db):
            official_exams = await admin_content.list_admin_exams(
                page=1,
                page_size=30,
                search=None,
                user_id=None,
                status_filter="active",
                created_from=None,
                created_to=None,
                sort_by="created_at",
                sort_order="desc",
                current_user=actor("admin"),
            )

        self.assertEqual([item.id for item in history.items], [str(legacy_id)])
        self.assertEqual([item.id for item in by_document], [str(legacy_id)])
        self.assertEqual([item.id for item in published.items], [str(legacy_id)])
        self.assertEqual([item.id for item in official_exams.items], [str(legacy_id)])
        self.assertEqual(hidden.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
