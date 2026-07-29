import unittest

from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient

from app.core.concurrency import VersionConflict
from app.exam_bank.schemas.question import QuestionBankCreate, QuestionBankReviewRequest, QuestionBankUpdate
from app.exam_bank.services import question_bank_service


def _create_payload(**overrides):
    base = dict(
        subject_id="math",
        grade=10,
        curriculum_version="2018",
        bloom_level="remember",
        difficulty="easy",
        question_type="multiple_choice",
        content="1 + 1 = ?",
        options={"A": "1", "B": "2", "C": "3", "D": "4"},
        correct_answer="B",
        explanation="1+1=2",
    )
    base.update(overrides)
    return QuestionBankCreate(**base)


class QuestionBankServiceTests(unittest.IsolatedAsyncioTestCase):
    """Ngân hàng câu hỏi: CRUD, workflow duyệt, ownership, version conflict."""

    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_exam_bank_question"]
        self.owner_id = "teacher-1"
        self.other_teacher_id = "teacher-2"

    async def test_create_question_starts_as_draft_version_1(self):
        result = await question_bank_service.create_question(self.db, _create_payload(), owner_id=self.owner_id)
        self.assertEqual(result.status, "draft")
        self.assertEqual(result.version, 1)
        self.assertEqual(result.owner_id, self.owner_id)

    async def test_workflow_transitions_through_full_lifecycle(self):
        created = await question_bank_service.create_question(self.db, _create_payload(), owner_id=self.owner_id)

        for target in ("reviewing", "approved", "published"):
            updated = await question_bank_service.review_question(
                self.db,
                created.id,
                target_status=target,
                version=created.version,
                actor_id=self.owner_id,
                is_admin=False,
            )
            self.assertEqual(updated.status, target)
            created = updated

    async def test_invalid_transition_rejected(self):
        created = await question_bank_service.create_question(self.db, _create_payload(), owner_id=self.owner_id)
        with self.assertRaises(HTTPException) as ctx:
            await question_bank_service.review_question(
                self.db, created.id, target_status="published", version=created.version, actor_id=self.owner_id, is_admin=False
            )
        self.assertEqual(ctx.exception.status_code, 400)

    # ── Ownership ──────────────────────────────────────────────────────
    async def test_ownership_isolation_prevents_reading_other_teachers_question(self):
        created = await question_bank_service.create_question(self.db, _create_payload(), owner_id=self.owner_id)
        with self.assertRaises(HTTPException) as ctx:
            await question_bank_service.get_question(
                self.db, created.id, actor_id=self.other_teacher_id, is_admin=False
            )
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_ownership_isolation_prevents_updating_other_teachers_question(self):
        created = await question_bank_service.create_question(self.db, _create_payload(), owner_id=self.owner_id)
        with self.assertRaises(HTTPException) as ctx:
            await question_bank_service.update_question(
                self.db,
                created.id,
                QuestionBankUpdate(version=created.version, content="Sửa trộm"),
                actor_id=self.other_teacher_id,
                is_admin=False,
            )
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_admin_can_access_any_teachers_question(self):
        created = await question_bank_service.create_question(self.db, _create_payload(), owner_id=self.owner_id)
        result = await question_bank_service.get_question(self.db, created.id, actor_id="admin-1", is_admin=True)
        self.assertEqual(result.id, created.id)

    async def test_list_questions_scoped_to_owner_when_not_admin(self):
        await question_bank_service.create_question(self.db, _create_payload(), owner_id=self.owner_id)
        await question_bank_service.create_question(self.db, _create_payload(), owner_id=self.other_teacher_id)

        items, total = await question_bank_service.list_questions(self.db, owner_id=self.owner_id)
        self.assertEqual(total, 1)
        self.assertEqual(items[0].owner_id, self.owner_id)

    # ── Version conflict ───────────────────────────────────────────────
    async def test_update_with_stale_version_raises_conflict(self):
        created = await question_bank_service.create_question(self.db, _create_payload(), owner_id=self.owner_id)

        await question_bank_service.update_question(
            self.db,
            created.id,
            QuestionBankUpdate(version=created.version, content="Sửa lần 1"),
            actor_id=self.owner_id,
            is_admin=False,
        )

        # Client B vẫn dùng version cũ (đã bị lần sửa 1 tăng lên).
        with self.assertRaises(HTTPException) as ctx:
            await question_bank_service.update_question(
                self.db,
                created.id,
                QuestionBankUpdate(version=created.version, content="Sửa lần 2 (dữ liệu cũ)"),
                actor_id=self.owner_id,
                is_admin=False,
            )
        self.assertEqual(ctx.exception.status_code, 409)

    async def test_editing_approved_question_resets_to_draft(self):
        created = await question_bank_service.create_question(self.db, _create_payload(), owner_id=self.owner_id)
        created = await question_bank_service.review_question(
            self.db, created.id, target_status="reviewing", version=created.version, actor_id=self.owner_id, is_admin=False
        )
        created = await question_bank_service.review_question(
            self.db, created.id, target_status="approved", version=created.version, actor_id=self.owner_id, is_admin=False
        )
        self.assertEqual(created.status, "approved")

        updated = await question_bank_service.update_question(
            self.db,
            created.id,
            QuestionBankUpdate(version=created.version, content="Sửa nội dung sau khi đã duyệt"),
            actor_id=self.owner_id,
            is_admin=False,
        )
        self.assertEqual(updated.status, "draft")

    # ── Bulk actions ───────────────────────────────────────────────────
    async def test_bulk_approve_only_changes_questions_in_reviewing_state(self):
        q1 = await question_bank_service.create_question(self.db, _create_payload(), owner_id=self.owner_id)
        q2 = await question_bank_service.create_question(self.db, _create_payload(), owner_id=self.owner_id)
        await question_bank_service.review_question(
            self.db, q1.id, target_status="reviewing", version=q1.version, actor_id=self.owner_id, is_admin=False
        )
        # q2 vẫn ở draft — không thể approve trực tiếp từ draft.

        changed = await question_bank_service.bulk_update_status(
            self.db, [q1.id, q2.id], target_status="approved", actor_id=self.owner_id, is_admin=False
        )
        self.assertEqual(changed, 1)

        q1_after = await question_bank_service.get_question(self.db, q1.id, actor_id=self.owner_id, is_admin=False)
        q2_after = await question_bank_service.get_question(self.db, q2.id, actor_id=self.owner_id, is_admin=False)
        self.assertEqual(q1_after.status, "approved")
        self.assertEqual(q2_after.status, "draft")

    async def test_bulk_actions_skip_questions_owned_by_others(self):
        other_q = await question_bank_service.create_question(self.db, _create_payload(), owner_id=self.other_teacher_id)
        changed = await question_bank_service.bulk_update_status(
            self.db, [other_q.id], target_status="archived", actor_id=self.owner_id, is_admin=False
        )
        self.assertEqual(changed, 0)


if __name__ == "__main__":
    unittest.main()
