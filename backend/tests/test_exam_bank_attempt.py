import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

from bson import ObjectId
from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient

from app.exam_bank.constants.collections import EXAMS
from app.exam_bank.schemas.blueprint import BlueprintConstraints, ExamBlueprintCreate
from app.exam_bank.schemas.question import QuestionBankCreate
from app.exam_bank.services import attempt_service, blueprint_service, exam_service, question_bank_service


async def _seed_approved_question(db, owner_id, **overrides):
    base = dict(
        subject_id="math",
        grade=10,
        curriculum_version="2018",
        bloom_level="remember",
        difficulty="easy",
        question_type="multiple_choice",
        content="Câu hỏi mẫu",
        options={"A": "1", "B": "2", "C": "3", "D": "4"},
        correct_answer="B",
        explanation="Giải thích",
        points=1.0,
    )
    base.update(overrides)
    created = await question_bank_service.create_question(db, QuestionBankCreate(**base), owner_id=owner_id)
    created = await question_bank_service.review_question(
        db, created.id, target_status="reviewing", version=created.version, actor_id=owner_id, is_admin=False
    )
    created = await question_bank_service.review_question(
        db, created.id, target_status="approved", version=created.version, actor_id=owner_id, is_admin=False
    )
    return created


class ExamAttemptTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_exam_bank_attempt"]
        self.teacher_id = "teacher-1"
        self.student_id = "student-1"

    async def _publish_exam(self, *, question_type="multiple_choice", duration_minutes=30):
        await _seed_approved_question(self.db, self.teacher_id, question_type=question_type, points=2.0)
        await _seed_approved_question(self.db, self.teacher_id, question_type=question_type, points=2.0)

        blueprint = await blueprint_service.create_blueprint(
            self.db,
            ExamBlueprintCreate(
                name="KT",
                subject_id="math",
                grade=10,
                curriculum_version="2018",
                total_points=4.0,
                duration_minutes=duration_minutes,
                constraints=BlueprintConstraints(),
            ),
            owner_id=self.teacher_id,
        )
        await blueprint_service.validate_blueprint(self.db, blueprint.id, actor_id=self.teacher_id, is_admin=False)
        _, exams = await exam_service.generate_exams(
            self.db, blueprint_id=blueprint.id, code_count=1, seed=1, actor_id=self.teacher_id, is_admin=False
        )
        exam = exams[0]
        published = await exam_service.publish_exam(
            self.db, exam.id, version=exam.version, audience_type="all", target_class_ids=[], actor_id=self.teacher_id, is_admin=False
        )
        return published

    async def test_start_creates_attempt_with_server_due_at(self):
        exam = await self._publish_exam(duration_minutes=30)
        started = await attempt_service.start_attempt(self.db, exam.id, student_id=self.student_id)
        self.assertEqual(started.status, "in_progress")
        delta = started.due_at - started.started_at
        self.assertAlmostEqual(delta.total_seconds(), 30 * 60, delta=2)

    async def test_due_at_is_timezone_aware_after_reload_from_db(self):
        """Regression: Motor trả datetime NAIVE dù ghi vào là aware — nếu
        response trả thẳng giá trị naive, JSON thiếu 'Z' khiến trình duyệt
        hiểu nhầm là giờ địa phương (`new Date(...)`), lệch hàng giờ, đủ để
        đồng hồ đếm ngược tưởng hết giờ ngay khi vừa bắt đầu (xem `_aware()`).
        Test bằng cách ĐỌC LẠI từ DB (không dùng object vừa insert, để bắt
        đúng giá trị Motor trả về, giống hệt luồng request thật)."""
        exam = await self._publish_exam(duration_minutes=30)
        started = await attempt_service.start_attempt(self.db, exam.id, student_id=self.student_id)
        reloaded = await attempt_service.get_attempt(self.db, started.id, student_id=self.student_id)
        self.assertIsNotNone(reloaded.due_at.tzinfo)
        self.assertIsNotNone(reloaded.started_at.tzinfo)
        self.assertGreater(reloaded.due_at, reloaded.server_now)

    async def test_another_student_cannot_read_my_attempt(self):
        """Chốt bảo mật của trang "Xem lại bài làm".

        Trang đó nhận attempt_id từ URL, nên id là thứ người dùng gõ được. Không
        có chốt này thì đổi một chữ số trong địa chỉ là đọc được bài làm, điểm
        và nhận xét AI của bạn cùng lớp.

        Phải là 403 chứ không phải 404: 404 cũng chặn được đọc, nhưng lẫn với ca
        "không tồn tại" nên người vận hành đọc log không phân biệt được ai đang
        dò id của người khác.
        """
        exam = await self._publish_exam()
        cua_toi = await attempt_service.start_attempt(self.db, exam.id, student_id=self.student_id)

        with self.assertRaises(HTTPException) as ctx:
            await attempt_service.get_attempt(self.db, cua_toi.id, student_id="student-2")

        self.assertEqual(ctx.exception.status_code, 403)

    async def test_another_student_cannot_write_to_my_attempt(self):
        """Đọc bị chặn thì ghi cũng phải bị chặn. Autosave và submit đi qua cùng
        `_load_own_attempt`, nhưng cùng-đường-hôm-nay không có nghĩa là
        cùng-đường-mãi-mãi — chốt riêng để việc tách ra sau này không âm thầm
        mở cửa."""
        exam = await self._publish_exam()
        cua_toi = await attempt_service.start_attempt(self.db, exam.id, student_id=self.student_id)

        with self.assertRaises(HTTPException) as ctx:
            await attempt_service.autosave(
                self.db, cua_toi.id, version=1, answers={"q": "x"}, student_id="student-2"
            )
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_start_twice_returns_same_attempt(self):
        exam = await self._publish_exam()
        first = await attempt_service.start_attempt(self.db, exam.id, student_id=self.student_id)
        second = await attempt_service.start_attempt(self.db, exam.id, student_id=self.student_id)
        self.assertEqual(first.id, second.id)

    async def test_retake_blocked_when_allow_retake_false(self):
        exam = await self._publish_exam()
        started = await attempt_service.start_attempt(self.db, exam.id, student_id=self.student_id)
        await attempt_service.submit_attempt(
            self.db, started.id, version=1, answers={}, student_id=self.student_id
        )
        with self.assertRaises(HTTPException) as ctx:
            await attempt_service.start_attempt(self.db, exam.id, student_id=self.student_id)
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_retake_creates_new_attempt_when_allowed(self):
        exam = await self._publish_exam()
        await exam_service.set_allow_retake(
            self.db, exam.id, version=exam.version, allow_retake=True, actor_id=self.teacher_id, is_admin=False
        )
        first = await attempt_service.start_attempt(self.db, exam.id, student_id=self.student_id)
        await attempt_service.submit_attempt(
            self.db, first.id, version=1, answers={}, student_id=self.student_id
        )
        second = await attempt_service.start_attempt(self.db, exam.id, student_id=self.student_id)
        self.assertNotEqual(first.id, second.id)

    async def test_resume_in_progress_attempt_without_allow_retake(self):
        exam = await self._publish_exam()
        first = await attempt_service.start_attempt(self.db, exam.id, student_id=self.student_id)
        second = await attempt_service.start_attempt(self.db, exam.id, student_id=self.student_id)
        self.assertEqual(first.id, second.id)

    async def test_start_rejects_unpublished_exam(self):
        await _seed_approved_question(self.db, self.teacher_id)
        blueprint = await blueprint_service.create_blueprint(
            self.db,
            ExamBlueprintCreate(
                name="KT2", subject_id="math", grade=10, curriculum_version="2018",
                total_points=1.0, duration_minutes=10, constraints=BlueprintConstraints(),
            ),
            owner_id=self.teacher_id,
        )
        await blueprint_service.validate_blueprint(self.db, blueprint.id, actor_id=self.teacher_id, is_admin=False)
        _, exams = await exam_service.generate_exams(
            self.db, blueprint_id=blueprint.id, code_count=1, seed=1, actor_id=self.teacher_id, is_admin=False
        )
        with self.assertRaises(HTTPException) as ctx:
            await attempt_service.start_attempt(self.db, exams[0].id, student_id=self.student_id)
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_autosave_then_submit_grades_multiple_choice_immediately(self):
        exam = await self._publish_exam(question_type="multiple_choice")
        started = await attempt_service.start_attempt(self.db, exam.id, student_id=self.student_id)
        exam_doc = await self.db[EXAMS].find_one({"_id": ObjectId(exam.id)})
        qids = exam_doc["question_ids"]

        saved = await attempt_service.autosave(
            self.db, started.id, version=1, answers={qids[0]: "B"}, student_id=self.student_id
        )
        self.assertEqual(saved.answers[qids[0]], "B")

        submitted = await attempt_service.submit_attempt(
            self.db, started.id, version=saved.version, answers={qids[0]: "B", qids[1]: "A"}, student_id=self.student_id
        )
        self.assertEqual(submitted.status, "graded")
        self.assertEqual(submitted.max_score, 4.0)
        self.assertEqual(submitted.total_score, 2.0)  # đúng câu 1 (2đ), sai câu 2

    async def test_submit_objective_exam_notifies_owner_as_graded(self):
        exam = await self._publish_exam()
        started = await attempt_service.start_attempt(self.db, exam.id, student_id=self.student_id)

        await attempt_service.submit_attempt(
            self.db, started.id, version=1, answers={}, student_id=self.student_id
        )

        notice = await self.db["admin_notifications"].find_one(
            {"dedupe_key": f"submission:{started.id}"}
        )
        self.assertIsNotNone(notice)
        self.assertEqual(notice["target_user_ids"], [self.teacher_id])
        self.assertIn("Đã chấm xong", notice["content"])
        self.assertEqual(notice["action_url"], f"/exams/{exam.id}/grading")

    async def test_notification_failure_does_not_fail_saved_submission(self):
        exam = await self._publish_exam()
        started = await attempt_service.start_attempt(self.db, exam.id, student_id=self.student_id)

        with patch(
            "app.exam_bank.services.attempt_service.upsert_submission_notification",
            new=AsyncMock(return_value=False),
        ):
            submitted = await attempt_service.submit_attempt(
                self.db, started.id, version=1, answers={}, student_id=self.student_id
            )

        self.assertEqual(submitted.status, "graded")
        stored = await self.db["exam_attempts"].find_one({"_id": ObjectId(started.id)})
        self.assertEqual(stored["status"], "graded")

    async def test_submit_short_answer_queues_ai_grading_stays_submitted(self):
        exam = await self._publish_exam(question_type="short_answer")
        started = await attempt_service.start_attempt(self.db, exam.id, student_id=self.student_id)
        exam_doc = await self.db[EXAMS].find_one({"_id": ObjectId(exam.id)})
        qids = exam_doc["question_ids"]

        submitted = await attempt_service.submit_attempt(
            self.db, started.id, version=1, answers={qids[0]: "câu trả lời 1", qids[1]: "câu trả lời 2"}, student_id=self.student_id
        )
        self.assertEqual(submitted.status, "submitted")
        self.assertEqual(submitted.total_score, 0.0)

        jobs = [j async for j in self.db["background_jobs"].find({"job_type": "grade_essay_answer"})]
        self.assertEqual(len(jobs), 2)

    async def test_grade_essay_answer_job_updates_score_and_status(self):
        exam = await self._publish_exam(question_type="short_answer")
        started = await attempt_service.start_attempt(self.db, exam.id, student_id=self.student_id)
        exam_doc = await self.db[EXAMS].find_one({"_id": ObjectId(exam.id)})
        qids = exam_doc["question_ids"]
        await attempt_service.submit_attempt(
            self.db, started.id, version=1, answers={qids[0]: "trả lời 1", qids[1]: "trả lời 2"}, student_id=self.student_id
        )

        with patch(
            "app.exam_bank.services.grading_service.grade_short_answer",
            side_effect=[(1.5, 0.8, "Khá tốt"), (2.0, 0.9, "Đúng hoàn toàn")],
        ):
            await attempt_service.grade_essay_answer_job(self.db, {"attempt_id": started.id, "question_id": qids[0]})
            result = await attempt_service.grade_essay_answer_job(
                self.db, {"attempt_id": started.id, "question_id": qids[1]}
            )

        self.assertEqual(result["score"], 2.0)
        final = await attempt_service.get_attempt(self.db, started.id, student_id=self.student_id)
        self.assertEqual(final.status, "graded")
        self.assertEqual(final.total_score, 3.5)
        graded_q1 = next(r for r in final.results if r.question_id == qids[0])
        self.assertEqual(graded_q1.ai_confidence, 0.8)

    async def test_last_essay_job_updates_existing_notification(self):
        exam = await self._publish_exam(question_type="short_answer")
        started = await attempt_service.start_attempt(self.db, exam.id, student_id=self.student_id)
        exam_doc = await self.db[EXAMS].find_one({"_id": ObjectId(exam.id)})

        await attempt_service.submit_attempt(
            self.db, started.id, version=1, answers={}, student_id=self.student_id
        )
        pending = await self.db["admin_notifications"].find_one(
            {"dedupe_key": f"submission:{started.id}"}
        )
        self.assertIsNotNone(pending)
        self.assertIn("Đang chấm", pending["content"])

        with patch(
            "app.exam_bank.services.grading_service.grade_short_answer",
            return_value=(1.0, 0.9, "Tốt"),
        ):
            for question_id in exam_doc["question_ids"]:
                await attempt_service.grade_essay_answer_job(
                    self.db, {"attempt_id": started.id, "question_id": question_id}
                )

        notices = await self.db["admin_notifications"].find(
            {"dedupe_key": f"submission:{started.id}"}
        ).to_list(None)
        self.assertEqual(len(notices), 1)
        self.assertIn("Đã chấm xong", notices[0]["content"])

    async def test_teacher_override_replaces_ai_score(self):
        exam = await self._publish_exam(question_type="short_answer")
        started = await attempt_service.start_attempt(self.db, exam.id, student_id=self.student_id)
        exam_doc = await self.db[EXAMS].find_one({"_id": ObjectId(exam.id)})
        qids = exam_doc["question_ids"]
        submitted = await attempt_service.submit_attempt(
            self.db, started.id, version=1, answers={qids[0]: "x", qids[1]: "y"}, student_id=self.student_id
        )

        overridden = await attempt_service.override_score(
            self.db, started.id, version=submitted.version, question_id=qids[0],
            teacher_score=2.0, teacher_feedback="Chấm tay", actor_id=self.teacher_id, is_admin=False,
        )
        result = next(r for r in overridden.results if r.question_id == qids[0])
        self.assertEqual(result.teacher_score, 2.0)
        self.assertEqual(result.final_score, 2.0)
        self.assertEqual(overridden.total_score, 2.0)

    async def test_override_rejects_non_owner_teacher(self):
        exam = await self._publish_exam(question_type="short_answer")
        started = await attempt_service.start_attempt(self.db, exam.id, student_id=self.student_id)
        exam_doc = await self.db[EXAMS].find_one({"_id": ObjectId(exam.id)})
        qids = exam_doc["question_ids"]
        submitted = await attempt_service.submit_attempt(
            self.db, started.id, version=1, answers={qids[0]: "x"}, student_id=self.student_id
        )
        with self.assertRaises(HTTPException) as ctx:
            await attempt_service.override_score(
                self.db, started.id, version=submitted.version, question_id=qids[0],
                teacher_score=2.0, teacher_feedback=None, actor_id="someone-else", is_admin=False,
            )
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_override_rejects_score_above_question_maximum(self):
        exam = await self._publish_exam(question_type="short_answer")
        started = await attempt_service.start_attempt(self.db, exam.id, student_id=self.student_id)
        exam_doc = await self.db[EXAMS].find_one({"_id": ObjectId(exam.id)})
        qid = exam_doc["question_ids"][0]
        submitted = await attempt_service.submit_attempt(
            self.db, started.id, version=1, answers={qid: "x"}, student_id=self.student_id
        )
        with self.assertRaises(HTTPException) as ctx:
            await attempt_service.override_score(
                self.db, started.id, version=submitted.version, question_id=qid,
                teacher_score=2.25, teacher_feedback=None, actor_id=self.teacher_id, is_admin=False,
            )
        self.assertEqual(ctx.exception.status_code, 422)

    async def test_invalid_exam_and_attempt_ids_return_not_found(self):
        with self.assertRaises(HTTPException) as exam_ctx:
            await attempt_service.list_attempts_for_exam(
                self.db, "not-an-object-id", actor_id=self.teacher_id, is_admin=False
            )
        self.assertEqual(exam_ctx.exception.status_code, 404)

        with self.assertRaises(HTTPException) as attempt_ctx:
            await attempt_service.get_attempt(
                self.db, "not-an-object-id", student_id=self.student_id
            )
        self.assertEqual(attempt_ctx.exception.status_code, 404)

    async def test_teacher_attempt_list_includes_student_display_name(self):
        exam = await self._publish_exam()
        student_oid = ObjectId()
        await self.db["users"].insert_one({
            "_id": student_oid,
            "full_name": "Nguyễn Minh Anh",
            "email": "minh.anh@example.com",
        })
        await attempt_service.start_attempt(self.db, exam.id, student_id=str(student_oid))

        attempts = await attempt_service.list_attempts_for_exam(
            self.db, exam.id, actor_id=self.teacher_id, is_admin=False
        )
        self.assertEqual(attempts[0].student_name, "Nguyễn Minh Anh")
        self.assertEqual(attempts[0].student_email, "minh.anh@example.com")

    async def test_autosave_after_deadline_auto_finalizes(self):
        exam = await self._publish_exam(duration_minutes=10)
        started = await attempt_service.start_attempt(self.db, exam.id, student_id=self.student_id)
        past = datetime.now(timezone.utc) - timedelta(minutes=1)
        await self.db["exam_attempts"].update_one({"_id": ObjectId(started.id)}, {"$set": {"due_at": past}})

        result = await attempt_service.autosave(
            self.db, started.id, version=1, answers={}, student_id=self.student_id
        )
        self.assertIn(result.status, ("graded", "submitted"))
        self.assertTrue(result.auto_submitted)

    async def test_sweep_expired_attempts_auto_submits(self):
        exam = await self._publish_exam(duration_minutes=10)
        started = await attempt_service.start_attempt(self.db, exam.id, student_id=self.student_id)
        past = datetime.now(timezone.utc) - timedelta(minutes=1)
        await self.db["exam_attempts"].update_one({"_id": ObjectId(started.id)}, {"$set": {"due_at": past}})

        count = await attempt_service.sweep_expired_attempts(self.db)
        self.assertEqual(count, 1)
        final = await attempt_service.get_attempt(self.db, started.id, student_id=self.student_id)
        self.assertTrue(final.auto_submitted)
        notice = await self.db["admin_notifications"].find_one(
            {"dedupe_key": f"submission:{started.id}"}
        )
        self.assertIsNotNone(notice)

    async def test_get_exam_questions_for_student_hides_answers(self):
        exam = await self._publish_exam()
        preview = await exam_service.get_exam_questions_for_student(self.db, exam.id)
        self.assertTrue(preview.hide_answers)
        self.assertEqual(len(preview.questions), 2)
        for q in preview.questions:
            self.assertIsNone(q.correct_answer)
            self.assertIsNone(q.explanation)

    async def test_get_exam_questions_rejects_unpublished_exam(self):
        await _seed_approved_question(self.db, self.teacher_id)
        blueprint = await blueprint_service.create_blueprint(
            self.db,
            ExamBlueprintCreate(
                name="KT3", subject_id="math", grade=10, curriculum_version="2018",
                total_points=1.0, duration_minutes=10, constraints=BlueprintConstraints(),
            ),
            owner_id=self.teacher_id,
        )
        await blueprint_service.validate_blueprint(self.db, blueprint.id, actor_id=self.teacher_id, is_admin=False)
        _, exams = await exam_service.generate_exams(
            self.db, blueprint_id=blueprint.id, code_count=1, seed=1, actor_id=self.teacher_id, is_admin=False
        )
        with self.assertRaises(HTTPException) as ctx:
            await exam_service.get_exam_questions_for_student(self.db, exams[0].id)
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_get_attempt_rejects_other_student(self):
        exam = await self._publish_exam()
        started = await attempt_service.start_attempt(self.db, exam.id, student_id=self.student_id)
        with self.assertRaises(HTTPException) as ctx:
            await attempt_service.get_attempt(self.db, started.id, student_id="other-student")
        self.assertEqual(ctx.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
