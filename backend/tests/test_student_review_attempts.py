import builtins
import json
import random
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from bson import ObjectId
from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient
from pydantic import ValidationError

from app.routers.student_reviews import (
    SubmitStudentReviewAttemptRequest,
    get_student_review_attempt_route,
    list_student_review_attempts_route,
    list_student_reviews_route,
    start_student_review_attempt_route,
    submit_student_review_attempt_route,
)
from app.schemas.auth import UserResponse
from app.services.student_review_service import start_attempt, submit_attempt


def actor(role="student", user_id=None):
    user_id = user_id or str(ObjectId())
    return UserResponse(
        id=user_id,
        email=f"{role}-{user_id}@example.com",
        full_name=role,
        role=role,
        created_at=datetime.now(timezone.utc),
    )


class StudentReviewAttemptTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.db = AsyncMongoMockClient().student_review_attempts
        self.student = actor()
        self.other = actor()
        self.review_id = ObjectId()
        self.document_id = ObjectId()
        self.question_set_id = ObjectId()
        self.now = datetime.now(timezone.utc)
        await self.db.documents.insert_one({
            "_id": self.document_id,
            "user_id": self.student.id,
            "status": "indexed",
            "deleted_at": None,
        })
        await self.db.student_reviews.insert_one({
            "_id": self.review_id,
            "user_id": self.student.id,
            "document_id": str(self.document_id),
            "question_set_id": str(self.question_set_id),
            "title": "Ôn tập hàm số",
            "state": "ready",
            "created_at": self.now,
            "updated_at": self.now,
        })
        await self.db.question_sets.insert_one({
            "_id": self.question_set_id,
            "user_id": self.student.id,
            "purpose": "student_review",
            "review_id": str(self.review_id),
            "bank_status": "private",
            "promotion_status": "not_submitted",
            "source_document_id": str(self.document_id),
            "deleted_at": None,
            "created_at": self.now,
            "questions": [
                {
                    "_id": ObjectId(),
                    "question": "Đồ thị hàm bậc hai là gì?",
                    "options": {"A": "Parabol", "B": "Đường thẳng", "C": "Đường tròn", "D": "Điểm"},
                    "correct_answer": "A",
                    "explanation": "Theo định nghĩa trong tài liệu.",
                    "question_type": "multiple_choice",
                    "source_chunk_ids": [f"{self.document_id}:0"],
                    "grounding_excerpt": "Đồ thị hàm bậc hai là một parabol.",
                },
                {
                    "id": "explicit-question",
                    "question": "Hệ số nào quyết định chiều parabol?",
                    "options": {"A": "a", "B": "b", "C": "c", "D": "x"},
                    "correct_answer": "A",
                    "explanation": "Dấu của a quyết định chiều parabol.",
                    "question_type": "multiple_choice",
                    "source_chunk_ids": [f"{self.document_id}:1"],
                    "grounding_excerpt": "Dấu của hệ số a quyết định chiều parabol.",
                },
                {
                    "question": "Trục đối xứng của parabol là gì?",
                    "options": {"A": "x=-b/(2a)", "B": "x=b/a", "C": "y=0", "D": "x=0"},
                    "correct_answer": "A",
                    "explanation": "Công thức trục đối xứng.",
                    "question_type": "multiple_choice",
                    "source_chunk_ids": [f"{self.document_id}:2"],
                    "grounding_excerpt": "Trục đối xứng có phương trình x=-b/(2a).",
                },
            ],
        })
        self.db_patch = patch("app.routers.student_reviews.get_database", return_value=self.db)
        self.db_patch.start()
        self.addCleanup(self.db_patch.stop)

    async def _start(self, seed=0):
        return await start_attempt(self.db, self.student.id, str(self.review_id), rng=random.Random(seed))

    @staticmethod
    def _correct_answers(attempt):
        return {question["question_id"]: question["correct_option_id"] for question in attempt["questions"]}

    async def test_start_returns_safe_payload_and_stores_server_snapshot(self):
        response = await self._start()

        self.assertEqual(set(response["questions"][0]), {"id", "text", "options"})
        self.assertEqual(set(response["questions"][0]["options"][0]), {"id", "text"})
        encoded = json.dumps(response, default=str)
        self.assertNotIn("correct_option_id", encoded)
        self.assertNotIn("explanation", encoded)
        stored = await self.db.student_review_attempts.find_one({"_id": response["_id"]})
        self.assertEqual(response["started_at"], response["created_at"])
        self.assertEqual(stored["started_at"], stored["created_at"])
        self.assertEqual(stored["review_id"], str(self.review_id))
        self.assertEqual(stored["question_set_id"], str(self.question_set_id))
        self.assertEqual(stored["status"], "in_progress")
        self.assertTrue(all(question.get("correct_option_id") for question in stored["questions"]))
        self.assertTrue(all("explanation" in question and "source" in question for question in stored["questions"]))

    async def test_reattempt_reuses_question_ids_with_new_shuffle_and_no_ai_import(self):
        imported = []
        real_import = builtins.__import__

        def guarded_import(name, *args, **kwargs):
            imported.append(name)
            if name == "app.services.question_generation_service":
                raise AssertionError("attempt start imported the question generator")
            return real_import(name, *args, **kwargs)

        with patch("builtins.__import__", side_effect=guarded_import):
            first = await self._start(0)
            second = await self._start(4)

        first_ids = [item["id"] for item in first["questions"]]
        second_ids = [item["id"] for item in second["questions"]]
        self.assertEqual(set(first_ids), set(second_ids))
        self.assertNotEqual(
            [(q["id"], [option["id"] for option in q["options"]]) for q in first["questions"]],
            [(q["id"], [option["id"] for option in q["options"]]) for q in second["questions"]],
        )
        self.assertNotIn("app.services.question_generation_service", imported)
        self.assertEqual(await self.db.question_sets.count_documents({}), 1)

    async def test_start_rejects_wrong_state_or_tampered_set_without_attempt(self):
        await self.db.student_reviews.update_one({"_id": self.review_id}, {"$set": {"state": "generating"}})
        with self.assertRaises(ValueError):
            await self._start()
        await self.db.student_reviews.update_one({"_id": self.review_id}, {"$set": {"state": "ready"}})

        for field, value in (
            ("user_id", self.other.id),
            ("purpose", "assessment"),
            ("review_id", str(ObjectId())),
            ("bank_status", "published"),
        ):
            with self.subTest(field=field):
                original = (await self.db.question_sets.find_one({"_id": self.question_set_id}))[field]
                await self.db.question_sets.update_one({"_id": self.question_set_id}, {"$set": {field: value}})
                with self.assertRaises(ValueError):
                    await self._start()
                await self.db.question_sets.update_one({"_id": self.question_set_id}, {"$set": {field: original}})

        self.assertEqual(await self.db.student_review_attempts.count_documents({}), 0)

    async def test_start_rejects_duplicate_question_ids_and_malformed_options(self):
        question_set = await self.db.question_sets.find_one({"_id": self.question_set_id})
        questions = question_set["questions"]
        questions[0]["id"] = "duplicate"
        questions[1]["id"] = "duplicate"
        await self.db.question_sets.update_one({"_id": self.question_set_id}, {"$set": {"questions": questions}})
        with self.assertRaises(ValueError):
            await self._start()

        questions[1]["id"] = "unique"
        questions[0]["options"] = {"A": "Only one"}
        await self.db.question_sets.update_one({"_id": self.question_set_id}, {"$set": {"questions": questions}})
        with self.assertRaises(ValueError):
            await self._start()
        self.assertEqual(await self.db.student_review_attempts.count_documents({}), 0)

    async def test_start_rejects_every_invalid_four_choice_or_explanation_shape(self):
        original = await self.db.question_sets.find_one({"_id": self.question_set_id})
        base_question = original["questions"][0]
        invalid_questions = []
        for options in (
            {"A": "Một", "B": "Hai"},
            {"A": "Một", "B": "Hai", "C": "Ba"},
            {"A": "Một", "B": "Hai", "C": "Ba", "D": "Bốn", "E": "Năm"},
            {"": "Một", "B": "Hai", "C": "Ba", "D": "Bốn"},
            {"A": "", "B": "Hai", "C": "Ba", "D": "Bốn"},
            {"A": "Trùng", "B": "Trùng", "C": "Ba", "D": "Bốn"},
        ):
            invalid_questions.append({**base_question, "options": options})
        invalid_questions.extend([
            {**base_question, "explanation": " "},
            {**base_question, "correct_answer": "E"},
        ])

        for index, invalid in enumerate(invalid_questions):
            with self.subTest(index=index):
                await self.db.question_sets.update_one(
                    {"_id": self.question_set_id},
                    {"$set": {"questions": [invalid]}},
                )
                with self.assertRaises(ValueError):
                    await self._start()
        self.assertEqual(await self.db.student_review_attempts.count_documents({}), 0)

    def test_submission_schema_accepts_only_string_answer_map(self):
        valid = SubmitStudentReviewAttemptRequest(answers={"q1": "A"})
        self.assertEqual(valid.answers, {"q1": "A"})
        for values in (
            {"answers": {"q1": 1}},
            {"answers": ["A"]},
            {"answers": {"q1": "A"}, "score": 100},
        ):
            with self.subTest(values=values), self.assertRaises(ValidationError):
                SubmitStudentReviewAttemptRequest(**values)

    async def test_submit_rejects_unknown_missing_and_malformed_answers_without_writes(self):
        response = await self._start()
        stored = await self.db.student_review_attempts.find_one({"_id": response["_id"]})
        correct = self._correct_answers(stored)
        question_id = next(iter(correct))
        invalid_payloads = [
            {},
            {**correct, "unknown-question": "A"},
            {key: value for key, value in correct.items() if key != question_id},
            {**correct, question_id: "unknown-option"},
            {**correct, question_id: 1},
        ]
        for answers in invalid_payloads:
            with self.subTest(answers=answers), self.assertRaises(ValueError):
                await submit_attempt(self.db, self.student.id, str(response["_id"]), answers)
            unchanged = await self.db.student_review_attempts.find_one({"_id": response["_id"]})
            self.assertEqual(unchanged["status"], "in_progress")
            self.assertNotIn("answers", unchanged)

    async def test_submit_scores_snapshot_once_and_returns_explanations_and_sources(self):
        response = await self._start()
        stored = await self.db.student_review_attempts.find_one({"_id": response["_id"]})
        answers = self._correct_answers(stored)
        wrong_question = stored["questions"][0]
        answers[wrong_question["question_id"]] = next(
            option["id"] for option in wrong_question["options"]
            if option["id"] != wrong_question["correct_option_id"]
        )

        completed = await submit_attempt(self.db, self.student.id, str(response["_id"]), answers)

        self.assertEqual(completed["status"], "completed")
        self.assertEqual(completed["score"], 66.67)
        self.assertEqual(completed["correct_count"], 2)
        self.assertEqual(completed["total_count"], 3)
        self.assertEqual(completed["answers"], answers)
        self.assertEqual(len(completed["results"]), 3)
        self.assertTrue(all("explanation" in item and "source" in item for item in completed["results"]))
        persisted = await self.db.student_review_attempts.find_one({"_id": response["_id"]})
        self.assertEqual(persisted["score"], 66.67)

    async def test_duplicate_submit_returns_original_completion_unchanged(self):
        response = await self._start()
        stored = await self.db.student_review_attempts.find_one({"_id": response["_id"]})
        started_at = stored["started_at"]
        answers = self._correct_answers(stored)
        first = await submit_attempt(self.db, self.student.id, str(response["_id"]), answers)
        changed = {
            question["question_id"]: next(option["id"] for option in question["options"] if option["id"] != question["correct_option_id"])
            for question in stored["questions"]
        }

        second = await submit_attempt(self.db, self.student.id, str(response["_id"]), changed)

        self.assertEqual(second, first)
        self.assertEqual(first["started_at"], started_at)
        self.assertEqual(second["started_at"], started_at)
        persisted = await self.db.student_review_attempts.find_one({"_id": response["_id"]})
        self.assertEqual(persisted["answers"], answers)
        self.assertEqual(persisted["completed_at"], first["completed_at"])
        self.assertEqual(persisted["started_at"], started_at)

    async def test_routes_are_student_only_and_owner_scoped(self):
        response = await self._start()
        lecturer = actor("lecturer")
        payload = SubmitStudentReviewAttemptRequest(answers={})
        calls = (
            lambda: start_student_review_attempt_route(str(self.review_id), current_user=lecturer),
            lambda: list_student_review_attempts_route(str(self.review_id), current_user=lecturer),
            lambda: get_student_review_attempt_route(str(response["_id"]), current_user=lecturer),
            lambda: submit_student_review_attempt_route(str(response["_id"]), payload, current_user=lecturer),
        )
        for call in calls:
            with self.assertRaises(HTTPException) as raised:
                await call()
            self.assertEqual(raised.exception.status_code, 403)

        foreign_review_id = ObjectId()
        await self.db.student_reviews.insert_one({
            "_id": foreign_review_id,
            "user_id": self.other.id,
            "state": "ready",
            "created_at": self.now,
        })
        owner_calls = (
            lambda: start_student_review_attempt_route(str(foreign_review_id), current_user=self.student),
            lambda: list_student_review_attempts_route(str(foreign_review_id), current_user=self.student),
            lambda: get_student_review_attempt_route(str(response["_id"]), current_user=self.other),
            lambda: submit_student_review_attempt_route(str(response["_id"]), payload, current_user=self.other),
        )
        for call in owner_calls:
            with self.assertRaises(HTTPException) as raised:
                await call()
            self.assertEqual(raised.exception.status_code, 404)

    async def test_attempt_list_and_detail_are_safe_until_completion(self):
        older = await self._start(0)
        newer = await self._start(4)
        await self.db.student_review_attempts.update_one(
            {"_id": older["_id"]}, {"$set": {"created_at": self.now - timedelta(minutes=1)}}
        )
        await self.db.student_review_attempts.update_one(
            {"_id": newer["_id"]}, {"$set": {"created_at": self.now}}
        )

        listed = await list_student_review_attempts_route(str(self.review_id), current_user=self.student)
        detail = await get_student_review_attempt_route(str(older["_id"]), current_user=self.student)
        stored_older = await self.db.student_review_attempts.find_one({"_id": older["_id"]})
        stored_newer = await self.db.student_review_attempts.find_one({"_id": newer["_id"]})

        self.assertEqual([item["id"] for item in listed["items"]], [str(newer["_id"]), str(older["_id"])])
        self.assertEqual(detail["review_id"], str(self.review_id))
        self.assertEqual(detail["started_at"], stored_older["started_at"].isoformat())
        self.assertEqual(listed["items"][0]["started_at"], stored_newer["started_at"].isoformat())
        self.assertNotIn("results", detail)
        self.assertNotIn("explanation", json.dumps(detail, default=str))

        stored = await self.db.student_review_attempts.find_one({"_id": older["_id"]})
        completed = await submit_attempt(self.db, self.student.id, str(older["_id"]), self._correct_answers(stored))
        completed_detail = await get_student_review_attempt_route(str(older["_id"]), current_user=self.student)
        self.assertEqual(completed_detail["score"], completed["score"])
        self.assertEqual(completed_detail["started_at"], stored_older["started_at"].isoformat())
        self.assertIn("results", completed_detail)

    async def test_review_list_aggregates_completed_attempt_history_once(self):
        empty_review_id = ObjectId()
        await self.db.student_reviews.insert_one({
            "_id": empty_review_id,
            "user_id": self.student.id,
            "state": "ready",
            "title": "Chưa làm",
            "created_at": self.now - timedelta(days=1),
        })
        first = await self._start(0)
        second = await self._start(4)
        stored_first = await self.db.student_review_attempts.find_one({"_id": first["_id"]})
        stored_second = await self.db.student_review_attempts.find_one({"_id": second["_id"]})
        all_correct = self._correct_answers(stored_first)
        all_wrong = {
            question["question_id"]: next(option["id"] for option in question["options"] if option["id"] != question["correct_option_id"])
            for question in stored_second["questions"]
        }
        await submit_attempt(self.db, self.student.id, str(first["_id"]), all_correct)
        await submit_attempt(self.db, self.student.id, str(second["_id"]), all_wrong)
        await self.db.student_review_attempts.update_one(
            {"_id": first["_id"]}, {"$set": {"completed_at": self.now - timedelta(hours=1)}}
        )
        await self.db.student_review_attempts.update_one(
            {"_id": second["_id"]}, {"$set": {"completed_at": self.now}}
        )
        await self._start(2)

        real_reviews = self.db.student_reviews

        class AggregateOnlyReviews:
            def __init__(self):
                self.calls = 0

            def aggregate(inner_self, pipeline):
                inner_self.calls += 1
                return real_reviews.aggregate(pipeline)

            def find(inner_self, *_args, **_kwargs):
                raise AssertionError("review list must use one aggregation")

        aggregate_reviews = AggregateOnlyReviews()

        class AggregateDB:
            def __getitem__(_self, name):
                return aggregate_reviews if name == "student_reviews" else self.db[name]

        with patch("app.routers.student_reviews.get_database", return_value=AggregateDB()):
            listed = await list_student_reviews_route(current_user=self.student)

        self.assertEqual(aggregate_reviews.calls, 1)
        rows = {item["id"]: item for item in listed["items"]}
        self.assertEqual(rows[str(self.review_id)]["attempt_count"], 3)
        self.assertEqual(rows[str(self.review_id)]["latest_score"], 0.0)
        self.assertEqual(rows[str(self.review_id)]["best_score"], 100.0)
        self.assertEqual(rows[str(empty_review_id)]["attempt_count"], 0)
        self.assertIsNone(rows[str(empty_review_id)]["latest_score"])
        self.assertIsNone(rows[str(empty_review_id)]["best_score"])
        persisted = await self.db.student_reviews.find_one({"_id": self.review_id})
        self.assertNotIn("attempt_count", persisted)

    async def test_attempts_and_reattempt_survive_source_document_deletion(self):
        first = await self._start()
        stored = await self.db.student_review_attempts.find_one({"_id": first["_id"]})
        completed = await submit_attempt(self.db, self.student.id, str(first["_id"]), self._correct_answers(stored))
        await self.db.documents.delete_one({"_id": self.document_id})

        existing = await get_student_review_attempt_route(str(first["_id"]), current_user=self.student)
        retry = await self._start(4)

        self.assertEqual(existing["results"], completed["results"])
        self.assertEqual(
            {item["id"] for item in retry["questions"]},
            {question["question_id"] for question in stored["questions"]},
        )
        self.assertIsNotNone(await self.db.question_sets.find_one({"_id": self.question_set_id}))


if __name__ == "__main__":
    unittest.main()
