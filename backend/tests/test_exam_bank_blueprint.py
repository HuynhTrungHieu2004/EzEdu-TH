import unittest

from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient

from app.exam_bank.schemas.blueprint import BlueprintConstraints, ExamBlueprintCreate, ExamBlueprintUpdate, BloomConstraint
from app.exam_bank.services import blueprint_service, question_bank_service
from app.exam_bank.schemas.question import QuestionBankCreate


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
    # Đưa thẳng lên approved để dùng được cho sinh đề (chỉ approved/published mới là candidate hợp lệ).
    created = await question_bank_service.review_question(
        db, created.id, target_status="reviewing", version=created.version, actor_id=owner_id, is_admin=False
    )
    created = await question_bank_service.review_question(
        db, created.id, target_status="approved", version=created.version, actor_id=owner_id, is_admin=False
    )
    return created


def _blueprint_payload(**overrides):
    base = dict(
        name="Kiểm tra 15 phút",
        subject_id="math",
        grade=10,
        curriculum_version="2018",
        total_points=5.0,
        duration_minutes=15,
        constraints=BlueprintConstraints(),
    )
    base.update(overrides)
    return ExamBlueprintCreate(**base)


class BlueprintServiceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_exam_bank_blueprint"]
        self.owner_id = "teacher-1"
        self.other_teacher_id = "teacher-2"

    async def test_create_blueprint_starts_as_draft(self):
        result = await blueprint_service.create_blueprint(self.db, _blueprint_payload(), owner_id=self.owner_id)
        self.assertEqual(result.status, "draft")
        self.assertEqual(result.version, 1)

    async def test_validate_valid_blueprint_returns_optimal_or_feasible_and_transitions_to_validated(self):
        for _ in range(5):
            await _seed_approved_question(self.db, self.owner_id, points=1.0)

        blueprint = await blueprint_service.create_blueprint(
            self.db, _blueprint_payload(total_points=5.0), owner_id=self.owner_id
        )
        result = await blueprint_service.validate_blueprint(
            self.db, blueprint.id, actor_id=self.owner_id, is_admin=False
        )
        self.assertIn(result.status, ("OPTIMAL", "FEASIBLE"))

        refreshed = await blueprint_service.get_blueprint(self.db, blueprint.id, actor_id=self.owner_id, is_admin=False)
        self.assertEqual(refreshed.status, "validated")

    async def test_validate_infeasible_blueprint_reports_missing_and_does_not_transition(self):
        # Chỉ có 2 câu remember, nhưng ma trận yêu cầu 4 câu ở mức 'analyze'.
        for _ in range(2):
            await _seed_approved_question(self.db, self.owner_id, bloom_level="remember", points=1.0)

        blueprint = await blueprint_service.create_blueprint(
            self.db,
            _blueprint_payload(
                total_points=4.0,
                constraints=BlueprintConstraints(bloom_distribution=[BloomConstraint(bloom_level="analyze", question_count=4)]),
            ),
            owner_id=self.owner_id,
        )
        result = await blueprint_service.validate_blueprint(self.db, blueprint.id, actor_id=self.owner_id, is_admin=False)

        self.assertEqual(result.status, "INFEASIBLE")
        self.assertTrue(any(m.group_type == "bloom_level" and m.group_key == "analyze" for m in result.missing))

        refreshed = await blueprint_service.get_blueprint(self.db, blueprint.id, actor_id=self.owner_id, is_admin=False)
        self.assertEqual(refreshed.status, "draft")  # KHÔNG chuyển sang validated khi infeasible

    # ── Ownership / Role ───────────────────────────────────────────────
    async def test_ownership_isolation_on_blueprint(self):
        blueprint = await blueprint_service.create_blueprint(self.db, _blueprint_payload(), owner_id=self.owner_id)
        with self.assertRaises(HTTPException) as ctx:
            await blueprint_service.get_blueprint(self.db, blueprint.id, actor_id=self.other_teacher_id, is_admin=False)
        self.assertEqual(ctx.exception.status_code, 403)

    # ── Version conflict ───────────────────────────────────────────────
    async def test_update_blueprint_with_stale_version_conflicts(self):
        blueprint = await blueprint_service.create_blueprint(self.db, _blueprint_payload(), owner_id=self.owner_id)
        await blueprint_service.update_blueprint(
            self.db, blueprint.id, ExamBlueprintUpdate(version=blueprint.version, name="Đổi tên lần 1"), actor_id=self.owner_id, is_admin=False
        )
        with self.assertRaises(HTTPException) as ctx:
            await blueprint_service.update_blueprint(
                self.db, blueprint.id, ExamBlueprintUpdate(version=blueprint.version, name="Đổi tên lần 2 (cũ)"), actor_id=self.owner_id, is_admin=False
            )
        self.assertEqual(ctx.exception.status_code, 409)

    async def test_cannot_update_blueprint_after_validated(self):
        await _seed_approved_question(self.db, self.owner_id, points=1.0)
        blueprint = await blueprint_service.create_blueprint(
            self.db, _blueprint_payload(total_points=1.0), owner_id=self.owner_id
        )
        await blueprint_service.validate_blueprint(self.db, blueprint.id, actor_id=self.owner_id, is_admin=False)
        refreshed = await blueprint_service.get_blueprint(self.db, blueprint.id, actor_id=self.owner_id, is_admin=False)

        with self.assertRaises(HTTPException) as ctx:
            await blueprint_service.update_blueprint(
                self.db, blueprint.id, ExamBlueprintUpdate(version=refreshed.version, name="Không được sửa nữa"), actor_id=self.owner_id, is_admin=False
            )
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_clone_blueprint_resets_to_draft(self):
        await _seed_approved_question(self.db, self.owner_id, points=1.0)
        blueprint = await blueprint_service.create_blueprint(
            self.db, _blueprint_payload(total_points=1.0), owner_id=self.owner_id
        )
        await blueprint_service.validate_blueprint(self.db, blueprint.id, actor_id=self.owner_id, is_admin=False)

        clone = await blueprint_service.clone_blueprint(self.db, blueprint.id, actor_id=self.owner_id, is_admin=False)
        self.assertEqual(clone.status, "draft")
        self.assertNotEqual(clone.id, blueprint.id)


if __name__ == "__main__":
    unittest.main()
