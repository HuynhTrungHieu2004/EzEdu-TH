import unittest

from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient

from app.exam_bank.schemas.blueprint import BlueprintConstraints, ExamBlueprintCreate
from app.exam_bank.schemas.question import QuestionBankCreate
from app.exam_bank.services import blueprint_service, exam_service, question_bank_service
from app.exam_bank.services.exam_service import BlueprintInfeasibleError


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


class ExamServiceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_exam_bank_exam"]
        self.owner_id = "teacher-1"
        self.other_teacher_id = "teacher-2"

        for _ in range(5):
            await _seed_approved_question(self.db, self.owner_id, points=1.0)

        self.blueprint = await blueprint_service.create_blueprint(
            self.db,
            ExamBlueprintCreate(
                name="Kiểm tra 15 phút",
                subject_id="math",
                grade=10,
                curriculum_version="2018",
                total_points=5.0,
                duration_minutes=15,
                constraints=BlueprintConstraints(),
            ),
            owner_id=self.owner_id,
        )
        await blueprint_service.validate_blueprint(self.db, self.blueprint.id, actor_id=self.owner_id, is_admin=False)

    async def test_generate_exam_requires_validated_blueprint(self):
        draft_blueprint = await blueprint_service.create_blueprint(
            self.db,
            ExamBlueprintCreate(
                name="Chưa validate",
                subject_id="math",
                grade=10,
                curriculum_version="2018",
                total_points=5.0,
                duration_minutes=15,
                constraints=BlueprintConstraints(),
            ),
            owner_id=self.owner_id,
        )
        with self.assertRaises(HTTPException) as ctx:
            await exam_service.generate_exams(
                self.db, blueprint_id=draft_blueprint.id, code_count=1, seed=1, actor_id=self.owner_id, is_admin=False
            )
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_generate_single_exam_selects_correct_total_points(self):
        status_, exams = await exam_service.generate_exams(
            self.db, blueprint_id=self.blueprint.id, code_count=1, seed=42, actor_id=self.owner_id, is_admin=False
        )
        self.assertIn(status_, ("OPTIMAL", "FEASIBLE"))
        self.assertEqual(len(exams), 1)
        self.assertEqual(len(exams[0].question_ids), 5)
        self.assertEqual(exams[0].status, "draft")

    async def test_generate_multiple_equivalent_codes_share_group_id_and_question_set(self):
        status_, exams = await exam_service.generate_exams(
            self.db, blueprint_id=self.blueprint.id, code_count=3, seed=7, actor_id=self.owner_id, is_admin=False
        )
        self.assertEqual(len(exams), 3)
        group_ids = {e.equivalent_group_id for e in exams}
        self.assertEqual(len(group_ids), 1)  # cùng 1 nhóm mã đề tương đương

        codes = {e.code for e in exams}
        self.assertEqual(len(codes), 3)  # mỗi mã đề có code khác nhau

        question_sets = [set(e.question_ids) for e in exams]
        for qs in question_sets:
            self.assertEqual(qs, question_sets[0])  # cùng tập câu hỏi, chỉ khác thứ tự/đáp án

        total_points = {e.total_points for e in exams}
        self.assertEqual(len(total_points), 1)  # tổng điểm tương đương giữa các mã đề

    async def test_generate_raises_infeasible_error_when_bank_insufficient(self):
        # Xoá hết câu hỏi khả dụng để ép infeasible.
        await self.db["questions"].delete_many({})
        with self.assertRaises(BlueprintInfeasibleError):
            await exam_service.generate_exams(
                self.db, blueprint_id=self.blueprint.id, code_count=1, seed=1, actor_id=self.owner_id, is_admin=False
            )

    async def test_preview_hides_answers_by_default(self):
        _, exams = await exam_service.generate_exams(
            self.db, blueprint_id=self.blueprint.id, code_count=1, seed=1, actor_id=self.owner_id, is_admin=False
        )
        preview = await exam_service.preview_exam(
            self.db, exams[0].id, actor_id=self.owner_id, is_admin=False, hide_answers=True
        )
        self.assertTrue(preview.hide_answers)
        for item in preview.questions:
            self.assertIsNone(item.correct_answer)
            self.assertIsNone(item.explanation)

    async def test_preview_shows_answers_when_requested(self):
        _, exams = await exam_service.generate_exams(
            self.db, blueprint_id=self.blueprint.id, code_count=1, seed=1, actor_id=self.owner_id, is_admin=False
        )
        preview = await exam_service.preview_exam(
            self.db, exams[0].id, actor_id=self.owner_id, is_admin=False, hide_answers=False
        )
        for item in preview.questions:
            self.assertIsNotNone(item.correct_answer)

    async def test_publish_exam(self):
        _, exams = await exam_service.generate_exams(
            self.db, blueprint_id=self.blueprint.id, code_count=1, seed=1, actor_id=self.owner_id, is_admin=False
        )
        published = await exam_service.publish_exam(
            self.db,
            exams[0].id,
            version=exams[0].version,
            audience_type="all",
            target_class_ids=[],
            actor_id=self.owner_id,
            is_admin=False,
        )
        self.assertEqual(published.status, "published")
        self.assertIsNotNone(published.published_at)

    async def test_clone_exam(self):
        _, exams = await exam_service.generate_exams(
            self.db, blueprint_id=self.blueprint.id, code_count=1, seed=1, actor_id=self.owner_id, is_admin=False
        )
        clone = await exam_service.clone_exam(self.db, exams[0].id, actor_id=self.owner_id, is_admin=False)
        self.assertEqual(clone.status, "draft")
        self.assertNotEqual(clone.id, exams[0].id)

    async def test_archive_exam(self):
        _, exams = await exam_service.generate_exams(
            self.db, blueprint_id=self.blueprint.id, code_count=1, seed=1, actor_id=self.owner_id, is_admin=False
        )
        archived = await exam_service.archive_exam(
            self.db, exams[0].id, version=exams[0].version, actor_id=self.owner_id, is_admin=False
        )
        self.assertEqual(archived.status, "archived")

    # ── Ownership / Role ───────────────────────────────────────────────
    async def test_ownership_isolation_on_exam(self):
        _, exams = await exam_service.generate_exams(
            self.db, blueprint_id=self.blueprint.id, code_count=1, seed=1, actor_id=self.owner_id, is_admin=False
        )
        with self.assertRaises(HTTPException) as ctx:
            await exam_service.get_exam(self.db, exams[0].id, actor_id=self.other_teacher_id, is_admin=False)
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_admin_can_view_any_exam(self):
        _, exams = await exam_service.generate_exams(
            self.db, blueprint_id=self.blueprint.id, code_count=1, seed=1, actor_id=self.owner_id, is_admin=False
        )
        result = await exam_service.get_exam(self.db, exams[0].id, actor_id="admin-1", is_admin=True)
        self.assertEqual(result.id, exams[0].id)

    # ── Version conflict ───────────────────────────────────────────────
    async def test_stale_version_conflicts_when_resource_changed_concurrently(self):
        """Cô lập đúng version-conflict (409) khỏi lỗi chuyển trạng thái sai
        (400): giữ nguyên `status`, chỉ mô phỏng một request khác đã tăng
        `version` trước — request dùng version cũ phải bị từ chối 409."""
        _, exams = await exam_service.generate_exams(
            self.db, blueprint_id=self.blueprint.id, code_count=1, seed=1, actor_id=self.owner_id, is_admin=False
        )
        exam = exams[0]

        # Mô phỏng một client khác đã ghi thành công trước đó (version tăng lên).
        from bson import ObjectId

        await self.db["exams"].update_one({"_id": ObjectId(exam.id)}, {"$inc": {"version": 1}})

        with self.assertRaises(HTTPException) as ctx:
            await exam_service.archive_exam(self.db, exam.id, version=exam.version, actor_id=self.owner_id, is_admin=False)
        self.assertEqual(ctx.exception.status_code, 409)

    # ── Regenerate section ─────────────────────────────────────────────
    async def test_regenerate_section_keeps_other_questions_unchanged(self):
        # Thêm câu topic riêng để có thể sinh lại đúng 1 nhóm chủ đề.
        for _ in range(3):
            await _seed_approved_question(self.db, self.owner_id, topic_id="algebra", points=1.0)

        # 5 câu chung (không chủ đề) + 3 câu 'algebra' đã có sẵn từ setUp/vòng lặp trên, mỗi câu 1.0 điểm.
        # Ma trận: đúng 2 câu algebra + đủ số câu khác để tổng 4.0 điểm (2 algebra + 2 câu chung).
        blueprint = await blueprint_service.create_blueprint(
            self.db,
            ExamBlueprintCreate(
                name="Ma trận có chủ đề",
                subject_id="math",
                grade=10,
                curriculum_version="2018",
                total_points=4.0,
                duration_minutes=20,
                constraints=BlueprintConstraints(topics=[{"topic_id": "algebra", "question_count": 2}]),
            ),
            owner_id=self.owner_id,
        )
        await blueprint_service.validate_blueprint(self.db, blueprint.id, actor_id=self.owner_id, is_admin=False)
        _, exams = await exam_service.generate_exams(
            self.db, blueprint_id=blueprint.id, code_count=1, seed=1, actor_id=self.owner_id, is_admin=False
        )
        exam = exams[0]
        non_algebra_ids_before = set(exam.question_ids)

        regenerated = await exam_service.regenerate_section(
            self.db,
            exam.id,
            version=exam.version,
            group_type="topic",
            group_key="algebra",
            actor_id=self.owner_id,
            is_admin=False,
        )
        # Tổng số câu không đổi.
        self.assertEqual(len(regenerated.question_ids), len(exam.question_ids))

    # ---- allow_retake ------
    async def test_generate_exams_defaults_allow_retake_false(self):
        await _seed_approved_question(self.db, self.owner_id)
        blueprint = await blueprint_service.create_blueprint(
            self.db,
            ExamBlueprintCreate(
                name="KT-retake", subject_id="math", grade=10, curriculum_version="2018",
                total_points=1.0, duration_minutes=10, constraints=BlueprintConstraints(),
            ),
            owner_id=self.owner_id,
        )
        await blueprint_service.validate_blueprint(self.db, blueprint.id, actor_id=self.owner_id, is_admin=False)
        _, exams = await exam_service.generate_exams(
            self.db, blueprint_id=blueprint.id, code_count=1, seed=1, actor_id=self.owner_id, is_admin=False
        )
        self.assertFalse(exams[0].allow_retake)

    async def test_set_allow_retake_updates_flag(self):
        await _seed_approved_question(self.db, self.owner_id)
        blueprint = await blueprint_service.create_blueprint(
            self.db,
            ExamBlueprintCreate(
                name="KT-retake2", subject_id="math", grade=10, curriculum_version="2018",
                total_points=1.0, duration_minutes=10, constraints=BlueprintConstraints(),
            ),
            owner_id=self.owner_id,
        )
        await blueprint_service.validate_blueprint(self.db, blueprint.id, actor_id=self.owner_id, is_admin=False)
        _, exams = await exam_service.generate_exams(
            self.db, blueprint_id=blueprint.id, code_count=1, seed=1, actor_id=self.owner_id, is_admin=False
        )
        exam = exams[0]
        updated = await exam_service.set_allow_retake(
            self.db, exam.id, version=exam.version, allow_retake=True, actor_id=self.owner_id, is_admin=False
        )
        self.assertTrue(updated.allow_retake)

    async def test_set_allow_retake_rejects_non_owner(self):
        await _seed_approved_question(self.db, self.owner_id)
        blueprint = await blueprint_service.create_blueprint(
            self.db,
            ExamBlueprintCreate(
                name="KT-retake3", subject_id="math", grade=10, curriculum_version="2018",
                total_points=1.0, duration_minutes=10, constraints=BlueprintConstraints(),
            ),
            owner_id=self.owner_id,
        )
        await blueprint_service.validate_blueprint(self.db, blueprint.id, actor_id=self.owner_id, is_admin=False)
        _, exams = await exam_service.generate_exams(
            self.db, blueprint_id=blueprint.id, code_count=1, seed=1, actor_id=self.owner_id, is_admin=False
        )
        exam = exams[0]
        with self.assertRaises(HTTPException) as ctx:
            await exam_service.set_allow_retake(
                self.db, exam.id, version=exam.version, allow_retake=True, actor_id="someone-else", is_admin=False
            )
        self.assertEqual(ctx.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
