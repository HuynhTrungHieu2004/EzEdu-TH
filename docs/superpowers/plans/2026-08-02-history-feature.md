# Lịch sử học liệu/đề thi (giảng viên) & lịch sử làm bài (học sinh) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Giảng viên xem được lịch sử học liệu (Cloudinary) + đề thi (MongoDB) đã tạo với xem/tải, sửa, xóa mềm, thống kê sử dụng; học sinh xem lại lịch sử làm đề thi giảng viên giao + ôn tập, làm lại được (ôn tập luôn được, đề thi chỉ khi giảng viên bật `allow_retake`).

**Architecture:** 2 endpoint mới/mở rộng theo role, mỗi endpoint gọi song song các query đã có sẵn (documents, exams, exam_attempts, question_attempts), merge + sort + skip/limit ngay trên server (không cursor phức tạp, không event-log). Trước khi làm phần history, phải sửa 2 lỗ hổng phát hiện khi rà code thật: `DELETE /documents/{id}` hiện xóa CỨNG và cascade xóa `question_sets` (làm vỡ lịch sử học sinh), và đề thi (`exams`) có field `deleted_at` trong schema nhưng CHƯA có endpoint nào set giá trị thật.

**Tech Stack:** FastAPI + Motor (async MongoDB driver) backend, React + Vite + TypeScript frontend, `mongomock_motor` cho test, `unittest.IsolatedAsyncioTestCase` theo đúng pattern có sẵn ở `backend/tests/test_exam_bank_attempt.py`.

## Global Constraints

- Không migrate dữ liệu cũ — mọi field mới đều có default, đọc bằng `.get(field, default)`.
- Test ở tầng service/router-function (gọi thẳng hàm Python), KHÔNG dùng `TestClient`/HTTP — đúng quy ước hiện có trong `backend/tests/` (ngoại trừ 1 file duy nhất `test_correlation.py` dùng TestClient, không phải chuẩn chung).
- Tái dùng `components/ui`: `DataTable`, `FilterBar`, `Pagination`, `ConfirmDialog`, `Tabs`, `Select`, `Alert` — không viết lại các primitive này.
- Vai trò giảng viên trong code là `{"user", "lecturer"}` (KHÔNG phải `"teacher"`) — xem `TEACHER_ONLY = ['lecturer', 'user']` ở `frontend/src/App.tsx:78` và `_ALLOWED_ROLES` ở `backend/app/exam_bank/api/deps.py`.
- Học sinh là role `"student"`.

---

### Task 1: Cho phép giảng viên bật/tắt làm lại đề thi (`allow_retake`)

**Files:**
- Modify: `backend/app/exam_bank/schemas/exam.py` (thêm field + request schema)
- Modify: `backend/app/exam_bank/services/exam_service.py:106-140` (`generate_exams` set default), thêm hàm `set_allow_retake`
- Modify: `backend/app/exam_bank/api/exams.py` (thêm route)
- Test: `backend/tests/test_exam_bank_exam.py`
- Modify: `frontend/src/api/examBankApi.ts` (thêm field vào `ExamItem` + hàm `setAllowRetake`)

**Interfaces:**
- Produces: `exam_service.set_allow_retake(db, exam_id, *, version: int, allow_retake: bool, actor_id: str, is_admin: bool) -> ExamResponse`
- Produces: `ExamResponse.allow_retake: bool` (default `False`) — Task 2/5/6 đọc field này.
- Produces route: `PATCH /exams/{exam_id}/retake-policy` — frontend Task 8 gọi.

- [ ] **Step 1: Viết test cho `set_allow_retake` (thất bại trước)**

Thêm vào cuối `backend/tests/test_exam_bank_exam.py` (xem đầu file để copy đúng import/helper `_seed_approved_question`, `self.teacher_id`, `self.db` đã có sẵn trong class test hiện tại — nếu file dùng tên class/setUp khác, thêm class mới theo mẫu `test_exam_bank_attempt.py`):

```python
    async def test_generate_exams_defaults_allow_retake_false(self):
        await _seed_approved_question(self.db, self.teacher_id)
        blueprint = await blueprint_service.create_blueprint(
            self.db,
            ExamBlueprintCreate(
                name="KT-retake", subject_id="math", grade=10, curriculum_version="2018",
                total_points=1.0, duration_minutes=10, constraints=BlueprintConstraints(),
            ),
            owner_id=self.teacher_id,
        )
        await blueprint_service.validate_blueprint(self.db, blueprint.id, actor_id=self.teacher_id, is_admin=False)
        _, exams = await exam_service.generate_exams(
            self.db, blueprint_id=blueprint.id, code_count=1, seed=1, actor_id=self.teacher_id, is_admin=False
        )
        self.assertFalse(exams[0].allow_retake)

    async def test_set_allow_retake_updates_flag(self):
        await _seed_approved_question(self.db, self.teacher_id)
        blueprint = await blueprint_service.create_blueprint(
            self.db,
            ExamBlueprintCreate(
                name="KT-retake2", subject_id="math", grade=10, curriculum_version="2018",
                total_points=1.0, duration_minutes=10, constraints=BlueprintConstraints(),
            ),
            owner_id=self.teacher_id,
        )
        await blueprint_service.validate_blueprint(self.db, blueprint.id, actor_id=self.teacher_id, is_admin=False)
        _, exams = await exam_service.generate_exams(
            self.db, blueprint_id=blueprint.id, code_count=1, seed=1, actor_id=self.teacher_id, is_admin=False
        )
        exam = exams[0]
        updated = await exam_service.set_allow_retake(
            self.db, exam.id, version=exam.version, allow_retake=True, actor_id=self.teacher_id, is_admin=False
        )
        self.assertTrue(updated.allow_retake)

    async def test_set_allow_retake_rejects_non_owner(self):
        await _seed_approved_question(self.db, self.teacher_id)
        blueprint = await blueprint_service.create_blueprint(
            self.db,
            ExamBlueprintCreate(
                name="KT-retake3", subject_id="math", grade=10, curriculum_version="2018",
                total_points=1.0, duration_minutes=10, constraints=BlueprintConstraints(),
            ),
            owner_id=self.teacher_id,
        )
        await blueprint_service.validate_blueprint(self.db, blueprint.id, actor_id=self.teacher_id, is_admin=False)
        _, exams = await exam_service.generate_exams(
            self.db, blueprint_id=blueprint.id, code_count=1, seed=1, actor_id=self.teacher_id, is_admin=False
        )
        exam = exams[0]
        with self.assertRaises(HTTPException) as ctx:
            await exam_service.set_allow_retake(
                self.db, exam.id, version=exam.version, allow_retake=True, actor_id="someone-else", is_admin=False
            )
        self.assertEqual(ctx.exception.status_code, 403)
```

Nếu `HTTPException` chưa import trong file test này, thêm `from fastapi import HTTPException` ở đầu file.

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `cd backend && python -m pytest tests/test_exam_bank_exam.py -k "allow_retake" -v`
Expected: FAIL — `AttributeError: 'ExamResponse' object has no attribute 'allow_retake'` (hoặc lỗi tương tự vì `set_allow_retake` chưa tồn tại).

- [ ] **Step 3: Thêm field + schema request**

`backend/app/exam_bank/schemas/exam.py` — thêm class mới sau `ExamPublishRequest` (dòng 37-40) và thêm field vào `ExamResponse`:

```python
class ExamRetakePolicyRequest(BaseModel):
    version: int = Field(ge=1)
    allow_retake: bool
```

Trong `ExamResponse`, thêm field sau `target_class_ids` (dòng 56):

```python
    allow_retake: bool = False
```

- [ ] **Step 4: Cập nhật `_to_response`, `generate_exams`, thêm `set_allow_retake`**

`backend/app/exam_bank/services/exam_service.py` — trong `_to_response` (dòng 25-47), thêm dòng trước `deleted_at=doc.get("deleted_at"),`:

```python
        allow_retake=doc.get("allow_retake", False),
```

Trong `generate_exams`, hàm build `doc` dict (dòng 107-128), thêm key sau `"target_class_ids": [],`:

```python
            "allow_retake": False,
```

Thêm hàm mới sau `archive_exam` (cuối file):

```python
async def set_allow_retake(
    db, exam_id: str, *, version: int, allow_retake: bool, actor_id: str, is_admin: bool
) -> ExamResponse:
    existing = await _load_owned_exam(db, exam_id, actor_id=actor_id, is_admin=is_admin)
    try:
        updated = await compare_and_set(
            db[EXAMS],
            filter_query={"_id": existing["_id"]},
            expected_version=version,
            update={"$set": {"allow_retake": allow_retake, "updated_by": actor_id, "updated_at": _now()}},
        )
    except VersionConflict:
        raise version_conflict_http_error()
    return _to_response(updated)
```

- [ ] **Step 5: Thêm route**

`backend/app/exam_bank/api/exams.py` — thêm import `ExamRetakePolicyRequest` vào khối import từ `app.exam_bank.schemas.exam` (dòng 9-16), thêm route sau `archive_exam` (cuối file):

```python
@router.patch("/exams/{exam_id}/retake-policy", response_model=ExamResponse)
async def set_allow_retake(
    exam_id: str,
    payload: ExamRetakePolicyRequest,
    current_user: UserResponse = Depends(require_exam_bank_actor),
):
    db = get_database()
    return await exam_service.set_allow_retake(
        db, exam_id, version=payload.version, allow_retake=payload.allow_retake,
        actor_id=current_user.id, is_admin=is_admin_actor(current_user),
    )
```

- [ ] **Step 6: Chạy test, xác nhận PASS**

Run: `cd backend && python -m pytest tests/test_exam_bank_exam.py -k "allow_retake" -v`
Expected: PASS (3 tests)

- [ ] **Step 7: Cập nhật frontend type + API**

`frontend/src/api/examBankApi.ts` — thêm vào `ExamItem` (dòng 137-154), sau `target_class_ids: string[];`:

```typescript
  allow_retake: boolean;
```

Thêm hàm vào `examBankApi` object, sau `publishExam` (dòng 332-339):

```typescript
  setAllowRetake: async (id: string, version: number, allowRetake: boolean): Promise<ExamItem> => {
    const response = await client.patch<ExamItem>(`/exams/${id}/retake-policy`, {
      version,
      allow_retake: allowRetake,
    });
    return response.data;
  },
```

- [ ] **Step 8: Commit**

```bash
git add backend/app/exam_bank/schemas/exam.py backend/app/exam_bank/services/exam_service.py backend/app/exam_bank/api/exams.py backend/tests/test_exam_bank_exam.py frontend/src/api/examBankApi.ts
git commit -m "feat: add allow_retake toggle for exam_bank exams"
```

---

### Task 2: Cho phép học sinh làm lại đề thi khi `allow_retake=true`

**Files:**
- Modify: `backend/app/exam_bank/repositories/indexes.py` (đổi unique index)
- Modify: `backend/app/exam_bank/services/attempt_service.py:98-160` (`start_attempt`)
- Test: `backend/tests/test_exam_bank_attempt.py`

**Interfaces:**
- Consumes: `exam["allow_retake"]` (Task 1)
- Produces: `attempt_service.start_attempt` giờ tạo attempt MỚI (không reuse) khi bản ghi mới nhất đã `submitted`/`graded` VÀ `exam["allow_retake"]==True`; vẫn resume attempt `in_progress`; vẫn 403 nếu đã có attempt hoàn tất và `allow_retake=False` (hành vi cũ, test cũ `test_start_twice_returns_same_attempt` không đổi vì helper `_publish_exam` không set `allow_retake`).

**Lưu ý migration index:** unique index cũ `attempt_exam_student` trên `(exam_id, student_id)` phải bị DROP trước khi tạo index mới trên `(exam_id, student_id, attempt_number)` — nếu chỉ thêm index mới mà không xóa cái cũ, insert attempt thứ 2 (retake) sẽ vẫn bị chặn bởi `DuplicateKeyError` từ index cũ dù code mới đã cho phép.

- [ ] **Step 1: Viết test cho retake (thất bại trước)**

Thêm vào `backend/tests/test_exam_bank_attempt.py`, sau `test_start_twice_returns_same_attempt` (dòng 95-99):

```python
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
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `cd backend && python -m pytest tests/test_exam_bank_attempt.py -k retake -v`
Expected: FAIL — `test_retake_creates_new_attempt_when_allowed` fails vì hiện `start_attempt` luôn trả lại attempt cũ; `test_retake_blocked_when_allow_retake_false` fails vì hiện không raise 403.

- [ ] **Step 3: Sửa index**

`backend/app/exam_bank/repositories/indexes.py` — đổi dòng 46 và thêm danh sách index cần drop trước:

```python
_LEGACY_INDEXES_TO_DROP: tuple = (
    (EXAM_ATTEMPTS, "attempt_exam_student"),
)
```

Đổi dòng định nghĩa index (dòng 46) từ:
```python
    IndexSpec(EXAM_ATTEMPTS, [("exam_id", ASCENDING), ("student_id", ASCENDING)], "attempt_exam_student", unique=True),
```
thành:
```python
    IndexSpec(
        EXAM_ATTEMPTS,
        [("exam_id", ASCENDING), ("student_id", ASCENDING), ("attempt_number", ASCENDING)],
        "attempt_exam_student_number",
        unique=True,
    ),
```

Sửa `ensure_exam_bank_indexes` (dòng 51-56) để drop index cũ trước khi tạo index mới:

```python
async def ensure_exam_bank_indexes(db) -> None:
    for collection, index_name in _LEGACY_INDEXES_TO_DROP:
        try:
            await db[collection].drop_index(index_name)
        except Exception:  # noqa: BLE001 - không tồn tại thì bỏ qua, không chặn startup
            pass
    for spec in EXAM_BANK_INDEXES:
        try:
            await db[spec.collection].create_index(spec.keys, name=spec.name, unique=spec.unique)
        except Exception as e:  # noqa: BLE001 - không chặn startup vì 1 index lỗi
            logger.error("exam_bank.index_creation_failed", extra={"index": spec.name, "error": str(e)})
```

- [ ] **Step 4: Sửa `start_attempt`**

`backend/app/exam_bank/services/attempt_service.py` — thay thế toàn bộ hàm `start_attempt` (dòng 98-160) bằng:

```python
async def start_attempt(db, exam_id: str, *, student_id: str) -> AttemptStartResponse:
    exam_oid = _object_id_or_404(exam_id, "Không tìm thấy đề thi.")
    exam = await db[EXAMS].find_one({"_id": exam_oid, "deleted_at": None})
    if exam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy đề thi.")
    if exam["status"] != "published":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Đề thi chưa được publish.")

    latest = await db[EXAM_ATTEMPTS].find_one(
        {"exam_id": exam_id, "student_id": student_id}, sort=[("attempt_number", -1)]
    )
    if latest is not None and latest["status"] == "in_progress":
        return AttemptStartResponse(
            id=str(latest["_id"]),
            exam_id=exam_id,
            exam_code=latest["exam_code"],
            started_at=_aware(latest["started_at"]),
            due_at=_aware(latest["due_at"]),
            server_now=_now(),
            status=latest["status"],
        )
    if latest is not None and not exam.get("allow_retake", False):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Đề thi này không cho phép làm lại.")

    next_attempt_number = (latest.get("attempt_number", 1) + 1) if latest is not None else 1
    now = _now()
    due_at = now + timedelta(minutes=exam["duration_minutes"])
    doc = {
        "exam_id": exam_id,
        "exam_code": exam["code"],
        "student_id": student_id,
        "attempt_number": next_attempt_number,
        "status": "in_progress",
        "answers": {},
        "started_at": now,
        "due_at": due_at,
        "submitted_at": None,
        "auto_submitted": False,
        "total_score": 0.0,
        "max_score": 0.0,
        "results": [],
        "version": 1,
        "created_at": now,
        "updated_at": now,
    }
    try:
        insert_result = await db[EXAM_ATTEMPTS].insert_one(doc)
    except DuplicateKeyError:
        # Race: 2 request "start" đồng thời cùng attempt_number — request thua cuộc đọc lại bản mới nhất.
        existing = await db[EXAM_ATTEMPTS].find_one(
            {"exam_id": exam_id, "student_id": student_id}, sort=[("attempt_number", -1)]
        )
        return AttemptStartResponse(
            id=str(existing["_id"]),
            exam_id=exam_id,
            exam_code=existing["exam_code"],
            started_at=_aware(existing["started_at"]),
            due_at=_aware(existing["due_at"]),
            server_now=_now(),
            status=existing["status"],
        )
    doc["_id"] = insert_result.inserted_id
    return AttemptStartResponse(
        id=str(doc["_id"]),
        exam_id=exam_id,
        exam_code=doc["exam_code"],
        started_at=now,
        due_at=due_at,
        server_now=now,
        status="in_progress",
    )
```

Chú thích docstring module ở đầu file (dòng 1-9) vẫn đúng, không cần sửa.

- [ ] **Step 5: Chạy test, xác nhận PASS**

Run: `cd backend && python -m pytest tests/test_exam_bank_attempt.py -v`
Expected: PASS toàn bộ file (bao gồm cả test cũ `test_start_twice_returns_same_attempt`, `test_start_creates_attempt_with_server_due_at`, v.v. — không được phép có test nào trong file này bị đỏ).

- [ ] **Step 6: Commit**

```bash
git add backend/app/exam_bank/repositories/indexes.py backend/app/exam_bank/services/attempt_service.py backend/tests/test_exam_bank_attempt.py
git commit -m "feat: allow multi-attempt exam retake when teacher enables allow_retake"
```

---

### Task 3: Sửa xóa học liệu thành xóa mềm thật (giữ lịch sử học sinh)

**Files:**
- Modify: `backend/app/routers/documents.py:1491-1590` (`delete_document`)
- Test: `backend/tests/test_documents_cloudinary.py`

**Interfaces:**
- Produces: `DELETE /documents/{id}` giờ set `deleted_at`/`status="deleted"` thay vì `delete_one`, KHÔNG còn xóa `question_sets` liên quan. Task 6 (student attempt-history) dựa vào `document["deleted_at"]` còn tồn tại sau khi xóa để tính `source_deleted`.

- [ ] **Step 1: Viết test cho soft-delete (thất bại trước)**

Thêm class mới vào cuối `backend/tests/test_documents_cloudinary.py` (theo đúng mẫu `patch("app.routers.documents.get_database", ...)` đã dùng ở `DocumentUploadDedupTests.asyncSetUp`, dòng 36-45):

```python
class DocumentSoftDeleteTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_document_soft_delete"]
        self.patches = [
            patch("app.routers.documents.get_database", return_value=self.db),
            patch("app.services.system_settings_service.get_database", return_value=self.db),
        ]
        for p in self.patches:
            p.start()
            self.addCleanup(p.stop)
        self.user = _actor("lecturer")

    async def _seed_document_with_question_set(self):
        now = datetime.now(timezone.utc)
        doc_id = ObjectId()
        await self.db["documents"].insert_one({
            "_id": doc_id,
            "user_id": self.user.id,
            "original_filename": "note.pdf",
            "file_type": "pdf",
            "file_size": 10,
            "cloudinary_url": "https://res.cloudinary.com/demo/raw/upload/v1/documents/note",
            "cloudinary_public_id": "documents/note_abc",
            "cloudinary_resource_type": "raw",
            "media_kind": "document",
            "status": "completed",
            "error_message": None,
            "checksum": "abc",
            "reuse_count": 0,
            "version": 1,
            "created_by": self.user.id,
            "updated_by": self.user.id,
            "created_at": now,
            "updated_at": now,
            "deleted_at": None,
        })
        await self.db["question_sets"].insert_one({
            "document_id": str(doc_id),
            "document_name": "note.pdf",
            "user_id": self.user.id,
            "created_at": now,
        })
        return doc_id

    async def test_delete_document_soft_deletes_and_keeps_question_sets(self):
        doc_id = await self._seed_document_with_question_set()
        with patch("app.routers.documents.enqueue_cloudinary_cleanup", new=AsyncMock()):
            await documents_router.delete_document(str(doc_id), None, None, self.user)

        deleted_doc = await self.db["documents"].find_one({"_id": doc_id})
        self.assertIsNotNone(deleted_doc, "document phải vẫn còn trong DB (xóa mềm)")
        self.assertIsNotNone(deleted_doc["deleted_at"])

        remaining_qs = await self.db["question_sets"].count_documents({"document_id": str(doc_id)})
        self.assertEqual(remaining_qs, 1, "question_sets phải KHÔNG bị xóa cascade")

    async def test_deleted_document_no_longer_listed(self):
        doc_id = await self._seed_document_with_question_set()
        with patch("app.routers.documents.enqueue_cloudinary_cleanup", new=AsyncMock()):
            await documents_router.delete_document(str(doc_id), None, None, self.user)

        listed = await documents_router.list_documents(current_user=self.user)
        self.assertEqual(listed, [])
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `cd backend && python -m pytest tests/test_documents_cloudinary.py -k soft_delete -v`
Expected: FAIL — `test_delete_document_soft_deletes_and_keeps_question_sets` fail vì document bị xóa cứng (`deleted_doc` là `None`) và `question_sets` bị xóa (count = 0).

- [ ] **Step 3: Sửa `delete_document`**

`backend/app/routers/documents.py` — trong hàm `delete_document` (dòng 1491-1590+), xóa dòng xóa `question_sets` (dòng 1561-1563):

```python
    await db["question_sets"].delete_many(
        {"document_id": document_id, "user_id": current_user.id}
    )
```

Thay khối cuối (dòng 1570-1576):
```python
    await db["documents"].delete_one(
        {
            "_id": document["_id"],
            "user_id": current_user.id,
            "status": "deleting",
        }
    )
```
thành:
```python
    await db["documents"].update_one(
        {
            "_id": document["_id"],
            "user_id": current_user.id,
            "status": "deleting",
        },
        {
            "$set": {
                "status": "deleted",
                "deleted_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
            }
        },
    )
```

Giữ nguyên mọi dòng khác (Cloudinary cleanup, ChromaDB, `document_chunks`/`document_contents`/`verification_issues`/`verification_sessions` — các collection này không liên quan tới lịch sử học sinh, vẫn xóa cứng bình thường).

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `cd backend && python -m pytest tests/test_documents_cloudinary.py -v`
Expected: PASS toàn bộ file (không được có test cũ nào đỏ — đặc biệt các test dedup ở `DocumentUploadDedupTests` dùng chung `deleted_at: None` filter, không bị ảnh hưởng vì chỉ đổi hành vi DELETE).

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/documents.py backend/tests/test_documents_cloudinary.py
git commit -m "fix: soft-delete documents instead of hard-delete to preserve student practice history"
```

---

### Task 4: Thêm xóa mềm cho đề thi

**Files:**
- Modify: `backend/app/exam_bank/services/exam_service.py` (thêm `delete_exam`)
- Modify: `backend/app/exam_bank/api/exams.py` (thêm route DELETE)
- Test: `backend/tests/test_exam_bank_exam.py`
- Modify: `frontend/src/api/examBankApi.ts` (thêm hàm `deleteExam`)

**Interfaces:**
- Produces: `exam_service.delete_exam(db, exam_id, *, version: int, actor_id: str, is_admin: bool) -> ExamResponse` — set `deleted_at`.
- Produces route: `DELETE /exams/{exam_id}?version=` — Task 8 (frontend teacher content-history) gọi khi bấm Xóa.
- Produces: `examBankApi.deleteExam(id: string, version: number): Promise<ExamItem>` — Task 8 gọi trực tiếp hàm này, KHÔNG phải chỉ điều hướng sang trang khác.

- [ ] **Step 1: Viết test (thất bại trước)**

Thêm vào `backend/tests/test_exam_bank_exam.py`:

```python
    async def test_delete_exam_sets_deleted_at(self):
        await _seed_approved_question(self.db, self.teacher_id)
        blueprint = await blueprint_service.create_blueprint(
            self.db,
            ExamBlueprintCreate(
                name="KT-del", subject_id="math", grade=10, curriculum_version="2018",
                total_points=1.0, duration_minutes=10, constraints=BlueprintConstraints(),
            ),
            owner_id=self.teacher_id,
        )
        await blueprint_service.validate_blueprint(self.db, blueprint.id, actor_id=self.teacher_id, is_admin=False)
        _, exams = await exam_service.generate_exams(
            self.db, blueprint_id=blueprint.id, code_count=1, seed=1, actor_id=self.teacher_id, is_admin=False
        )
        exam = exams[0]
        await exam_service.delete_exam(self.db, exam.id, version=exam.version, actor_id=self.teacher_id, is_admin=False)

        with self.assertRaises(HTTPException) as ctx:
            await exam_service.get_exam(self.db, exam.id, actor_id=self.teacher_id, is_admin=False)
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_delete_exam_rejects_non_owner(self):
        await _seed_approved_question(self.db, self.teacher_id)
        blueprint = await blueprint_service.create_blueprint(
            self.db,
            ExamBlueprintCreate(
                name="KT-del2", subject_id="math", grade=10, curriculum_version="2018",
                total_points=1.0, duration_minutes=10, constraints=BlueprintConstraints(),
            ),
            owner_id=self.teacher_id,
        )
        await blueprint_service.validate_blueprint(self.db, blueprint.id, actor_id=self.teacher_id, is_admin=False)
        _, exams = await exam_service.generate_exams(
            self.db, blueprint_id=blueprint.id, code_count=1, seed=1, actor_id=self.teacher_id, is_admin=False
        )
        exam = exams[0]
        with self.assertRaises(HTTPException) as ctx:
            await exam_service.delete_exam(self.db, exam.id, version=exam.version, actor_id="someone-else", is_admin=False)
        self.assertEqual(ctx.exception.status_code, 403)
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `cd backend && python -m pytest tests/test_exam_bank_exam.py -k delete_exam -v`
Expected: FAIL — `AttributeError: module 'exam_service' has no attribute 'delete_exam'`

- [ ] **Step 3: Thêm `delete_exam`**

`backend/app/exam_bank/services/exam_service.py` — thêm hàm sau `set_allow_retake` (thêm ở Task 1):

```python
async def delete_exam(db, exam_id: str, *, version: int, actor_id: str, is_admin: bool) -> ExamResponse:
    existing = await _load_owned_exam(db, exam_id, actor_id=actor_id, is_admin=is_admin)
    try:
        updated = await compare_and_set(
            db[EXAMS],
            filter_query={"_id": existing["_id"]},
            expected_version=version,
            update={"$set": {"deleted_at": _now(), "updated_by": actor_id, "updated_at": _now()}},
        )
    except VersionConflict:
        raise version_conflict_http_error()
    return _to_response(updated)
```

- [ ] **Step 4: Thêm route**

`backend/app/exam_bank/api/exams.py` — thêm sau route `set_allow_retake` (thêm ở Task 1):

```python
@router.delete("/exams/{exam_id}", response_model=ExamResponse)
async def delete_exam(
    exam_id: str,
    version: int = Query(...),
    current_user: UserResponse = Depends(require_exam_bank_actor),
):
    db = get_database()
    return await exam_service.delete_exam(
        db, exam_id, version=version, actor_id=current_user.id, is_admin=is_admin_actor(current_user)
    )
```

- [ ] **Step 5: Thêm hàm frontend `deleteExam`**

`frontend/src/api/examBankApi.ts` — thêm vào `examBankApi` object, ngay sau `setAllowRetake` (đã thêm ở Task 1):

```typescript
  deleteExam: async (id: string, version: number): Promise<ExamItem> => {
    const response = await client.delete<ExamItem>(`/exams/${id}`, { params: { version } });
    return response.data;
  },
```

- [ ] **Step 6: Chạy test, xác nhận PASS**

Run: `cd backend && python -m pytest tests/test_exam_bank_exam.py -v`
Expected: PASS toàn bộ file

- [ ] **Step 7: Commit**

```bash
git add backend/app/exam_bank/services/exam_service.py backend/app/exam_bank/api/exams.py backend/tests/test_exam_bank_exam.py frontend/src/api/examBankApi.ts
git commit -m "feat: add soft-delete endpoint for exam_bank exams"
```

---

### Task 5: Backend — API lịch sử nội dung cho giảng viên

**Files:**
- Create: `backend/app/routers/teacher_history.py`
- Modify: `backend/app/main.py` (đăng ký router)
- Test: `backend/tests/test_teacher_history.py`

**Interfaces:**
- Consumes: `documents` collection (`user_id`, `deleted_at`, `original_filename`, `cloudinary_url`, `created_at`), `exams` collection (`owner_id`, `deleted_at`, `code`, `created_at`, `blueprint_id`), `question_sets`/`question_attempts`/`exam_attempts` cho thống kê.
- Produces: `GET /teacher/content-history?type=all|document|exam&search=&skip=0&limit=50` → `{"items": [...], "total": int, "skip": int, "limit": int}`, mỗi item: `{"id","item_type":"document"|"exam","title","created_at","cloudinary_url": str|None,"blueprint_id": str|None,"attempt_count": int|None,"avg_score": float|None,"last_attempt_at": str|None}`.

- [ ] **Step 1: Viết test (thất bại trước)**

Tạo `backend/tests/test_teacher_history.py`:

```python
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from bson import ObjectId
from mongomock_motor import AsyncMongoMockClient

from app.routers import teacher_history
from app.schemas.auth import UserResponse


def _actor(role: str = "lecturer") -> UserResponse:
    return UserResponse(
        id=str(ObjectId()), email=f"{role}@example.com", full_name=role, role=role, created_at=datetime.now(timezone.utc)
    )


class TeacherContentHistoryTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_teacher_history"]
        self.patch = patch("app.routers.teacher_history.get_database", return_value=self.db)
        self.patch.start()
        self.addCleanup(self.patch.stop)
        self.teacher = _actor("lecturer")

    async def _seed_document(self, *, created_at, deleted_at=None):
        doc_id = ObjectId()
        await self.db["documents"].insert_one({
            "_id": doc_id, "user_id": self.teacher.id, "original_filename": "bai1.pdf",
            "cloudinary_url": "https://res.cloudinary.com/demo/raw/upload/v1/documents/bai1",
            "created_at": created_at, "deleted_at": deleted_at,
        })
        return doc_id

    async def _seed_exam(self, *, created_at, deleted_at=None):
        exam_id = ObjectId()
        await self.db["exams"].insert_one({
            "_id": exam_id, "owner_id": self.teacher.id, "code": "101", "blueprint_id": "bp-1",
            "created_at": created_at, "deleted_at": deleted_at, "allow_retake": True, "version": 3,
        })
        return exam_id

    async def test_merges_documents_and_exams_sorted_by_created_at_desc(self):
        older = datetime.now(timezone.utc) - timedelta(days=2)
        newer = datetime.now(timezone.utc) - timedelta(days=1)
        await self._seed_document(created_at=older)
        await self._seed_exam(created_at=newer)

        result = await teacher_history.get_content_history(
            type="all", search=None, skip=0, limit=50, current_user=self.teacher
        )
        self.assertEqual(result["total"], 2)
        self.assertEqual(result["items"][0]["item_type"], "exam")
        self.assertEqual(result["items"][1]["item_type"], "document")
        self.assertTrue(result["items"][0]["allow_retake"])
        self.assertEqual(result["items"][0]["version"], 3)
        self.assertIsNone(result["items"][1]["allow_retake"])

    async def test_filters_by_type(self):
        await self._seed_document(created_at=datetime.now(timezone.utc))
        await self._seed_exam(created_at=datetime.now(timezone.utc))

        result = await teacher_history.get_content_history(
            type="document", search=None, skip=0, limit=50, current_user=self.teacher
        )
        self.assertEqual(result["total"], 1)
        self.assertEqual(result["items"][0]["item_type"], "document")

    async def test_excludes_soft_deleted_items(self):
        await self._seed_document(created_at=datetime.now(timezone.utc), deleted_at=datetime.now(timezone.utc))
        result = await teacher_history.get_content_history(
            type="all", search=None, skip=0, limit=50, current_user=self.teacher
        )
        self.assertEqual(result["total"], 0)

    async def test_computes_attempt_stats_for_exam(self):
        exam_id = await self._seed_exam(created_at=datetime.now(timezone.utc))
        await self.db["exam_attempts"].insert_many([
            {"exam_id": str(exam_id), "student_id": "s1", "status": "graded", "total_score": 8.0, "created_at": datetime.now(timezone.utc)},
            {"exam_id": str(exam_id), "student_id": "s2", "status": "graded", "total_score": 6.0, "created_at": datetime.now(timezone.utc)},
        ])
        result = await teacher_history.get_content_history(
            type="exam", search=None, skip=0, limit=50, current_user=self.teacher
        )
        item = result["items"][0]
        self.assertEqual(item["attempt_count"], 2)
        self.assertEqual(item["avg_score"], 7.0)

    async def test_does_not_leak_other_teacher_content(self):
        await self._seed_document(created_at=datetime.now(timezone.utc))
        other = _actor("lecturer")
        await self.db["documents"].insert_one({
            "_id": ObjectId(), "user_id": other.id, "original_filename": "khac.pdf",
            "cloudinary_url": "x", "created_at": datetime.now(timezone.utc), "deleted_at": None,
        })
        result = await teacher_history.get_content_history(
            type="all", search=None, skip=0, limit=50, current_user=self.teacher
        )
        self.assertEqual(result["total"], 1)
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `cd backend && python -m pytest tests/test_teacher_history.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.routers.teacher_history'`

- [ ] **Step 3: Tạo `backend/app/routers/teacher_history.py`**

```python
"""Lịch sử học liệu + đề thi của giảng viên — gộp 2 collection hiện có
(`documents`, `exams`) thành 1 danh sách sort theo created_at, kèm thống kê
lượt làm bài. Không dùng event-log tập trung (xem
docs/superpowers/specs/2026-08-02-history-feature-design.md) — merge trực
tiếp ở đây vì cả hai nguồn đã có sẵn field owner/deleted_at cần thiết."""

from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, Query
from bson import ObjectId

from app.database.mongodb import get_database
from app.routers.auth import get_current_user
from app.schemas.auth import UserResponse

router = APIRouter()

ContentType = Literal["all", "document", "exam"]


async def _document_items(db, *, user_id: str, search: Optional[str]) -> List[Dict[str, Any]]:
    query: Dict[str, Any] = {"user_id": user_id, "deleted_at": None}
    if search:
        query["original_filename"] = {"$regex": search, "$options": "i"}
    items = []
    async for doc in db["documents"].find(query):
        items.append({
            "id": str(doc["_id"]),
            "item_type": "document",
            "title": doc["original_filename"],
            "created_at": doc["created_at"],
            "cloudinary_url": doc.get("cloudinary_url"),
            "blueprint_id": None,
        })
    return items


async def _exam_items(db, *, owner_id: str, search: Optional[str]) -> List[Dict[str, Any]]:
    query: Dict[str, Any] = {"owner_id": owner_id, "deleted_at": None}
    if search:
        query["code"] = {"$regex": search, "$options": "i"}
    items = []
    async for doc in db["exams"].find(query):
        items.append({
            "id": str(doc["_id"]),
            "item_type": "exam",
            "title": f"Đề {doc['code']}",
            "created_at": doc["created_at"],
            "cloudinary_url": None,
            "blueprint_id": doc.get("blueprint_id"),
            "allow_retake": doc.get("allow_retake", False),
            "version": doc.get("version", 1),
        })
    return items


async def _attach_stats(db, items: List[Dict[str, Any]]) -> None:
    exam_ids = [item["id"] for item in items if item["item_type"] == "exam"]
    if not exam_ids:
        return
    try:
        cursor = db["exam_attempts"].aggregate([
            {"$match": {"exam_id": {"$in": exam_ids}}},
            {"$group": {
                "_id": "$exam_id",
                "attempt_count": {"$sum": 1},
                "avg_score": {"$avg": "$total_score"},
                "last_attempt_at": {"$max": "$created_at"},
            }},
        ])
        stats_by_exam_id = {doc["_id"]: doc async for doc in cursor}
    except Exception:  # noqa: BLE001 - thống kê là phụ, lỗi không được làm hỏng danh sách chính
        stats_by_exam_id = {}

    for item in items:
        if item["item_type"] != "exam":
            continue
        stats = stats_by_exam_id.get(item["id"])
        item["attempt_count"] = stats["attempt_count"] if stats else None
        item["avg_score"] = round(stats["avg_score"], 2) if stats else None
        item["last_attempt_at"] = stats["last_attempt_at"] if stats else None


@router.get("/content-history")
async def get_content_history(
    type: ContentType = Query("all"),
    search: Optional[str] = Query(None, max_length=200),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: UserResponse = Depends(get_current_user),
):
    db = get_database()
    items: List[Dict[str, Any]] = []
    if type in ("all", "document"):
        items.extend(await _document_items(db, user_id=current_user.id, search=search))
    if type in ("all", "exam"):
        items.extend(await _exam_items(db, owner_id=current_user.id, search=search))

    items.sort(key=lambda item: item["created_at"], reverse=True)
    total = len(items)
    page = items[skip : skip + limit]
    await _attach_stats(db, page)
    for item in page:
        item.setdefault("attempt_count", None)
        item.setdefault("avg_score", None)
        item.setdefault("last_attempt_at", None)
        item.setdefault("allow_retake", None)
        item.setdefault("version", None)

    return {"items": page, "total": total, "skip": skip, "limit": limit}
```

- [ ] **Step 4: Đăng ký router trong `main.py`**

`backend/app/main.py` — thêm `teacher_history` vào import ở dòng 16 (cùng dòng với `documents, questions, ...`), thêm dòng đăng ký sau dòng 240 (`app.include_router(documents.router, ...)`):

```python
app.include_router(teacher_history.router, prefix=f"{settings.API_V1_STR}/teacher", tags=["Teacher History"])
```

- [ ] **Step 5: Chạy test, xác nhận PASS**

Run: `cd backend && python -m pytest tests/test_teacher_history.py -v`
Expected: PASS toàn bộ 5 test

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/teacher_history.py backend/app/main.py backend/tests/test_teacher_history.py
git commit -m "feat: add teacher content history endpoint merging documents and exams"
```

---

### Task 6: Backend — mở rộng lịch sử làm bài của học sinh (gồm cả đề thi)

**Files:**
- Modify: `backend/app/routers/questions.py:1077-1109` (`list_my_attempt_history`)
- Test: `backend/tests/test_questions_attempt_history.py` (tạo mới — kiểm tra nhanh chưa có file test riêng cho endpoint này trước khi tạo)

**Interfaces:**
- Consumes: `exam_attempts` collection, `exams.allow_retake`/`exams.deleted_at` (Task 1, Task 4), `documents.deleted_at` (Task 3).
- Produces: mỗi row giờ có thêm `item_type: "practice"|"exam"`, `source_deleted: bool`, `can_retake: bool` — frontend Task 9 (`LearningHistoryPage.tsx`) dùng để disable nút Làm lại.

- [ ] **Step 1: Kiểm tra chưa có file test trùng tên**

Run: `ls backend/tests/test_questions_attempt_history.py`
Expected: `No such file or directory` — xác nhận tạo file mới, không đè lên test có sẵn.

- [ ] **Step 2: Viết test (thất bại trước)**

Tạo `backend/tests/test_questions_attempt_history.py`:

```python
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from bson import ObjectId
from mongomock_motor import AsyncMongoMockClient

from app.routers import questions as questions_router
from app.schemas.auth import UserResponse


def _actor(role: str = "student") -> UserResponse:
    return UserResponse(
        id=str(ObjectId()), email=f"{role}@example.com", full_name=role, role=role, created_at=datetime.now(timezone.utc)
    )


class AttemptHistoryTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_attempt_history"]
        self.patch = patch("app.routers.questions.get_database", return_value=self.db)
        self.patch.start()
        self.addCleanup(self.patch.stop)
        self.student = _actor("student")

    async def test_merges_practice_and_exam_attempts(self):
        qs_id = ObjectId()
        await self.db["question_sets"].insert_one({"_id": qs_id, "document_name": "Chương 1"})
        await self.db["question_attempts"].insert_one({
            "_id": ObjectId(), "question_set_id": str(qs_id), "document_id": "doc-1", "user_id": self.student.id,
            "score": 8, "max_score": 10, "percent": 80.0, "created_at": datetime.now(timezone.utc),
        })
        exam_id = ObjectId()
        await self.db["exams"].insert_one({
            "_id": exam_id, "code": "101", "allow_retake": False, "deleted_at": None,
        })
        await self.db["exam_attempts"].insert_one({
            "_id": ObjectId(), "exam_id": str(exam_id), "exam_code": "101", "student_id": self.student.id,
            "status": "graded", "total_score": 7.0, "max_score": 10.0, "created_at": datetime.now(timezone.utc),
        })

        rows = await questions_router.list_my_attempt_history(current_user=self.student)
        item_types = sorted(r["item_type"] for r in rows)
        self.assertEqual(item_types, ["exam", "practice"])

    async def test_exam_item_marks_source_deleted_when_exam_removed(self):
        exam_id = ObjectId()
        await self.db["exams"].insert_one({
            "_id": exam_id, "code": "101", "allow_retake": True, "deleted_at": datetime.now(timezone.utc),
        })
        await self.db["exam_attempts"].insert_one({
            "_id": ObjectId(), "exam_id": str(exam_id), "exam_code": "101", "student_id": self.student.id,
            "status": "graded", "total_score": 7.0, "max_score": 10.0, "created_at": datetime.now(timezone.utc),
        })
        rows = await questions_router.list_my_attempt_history(current_user=self.student)
        self.assertTrue(rows[0]["source_deleted"])
        self.assertFalse(rows[0]["can_retake"])

    async def test_exam_item_can_retake_only_when_allowed_and_finished(self):
        exam_id = ObjectId()
        await self.db["exams"].insert_one({
            "_id": exam_id, "code": "101", "allow_retake": True, "deleted_at": None,
        })
        await self.db["exam_attempts"].insert_one({
            "_id": ObjectId(), "exam_id": str(exam_id), "exam_code": "101", "student_id": self.student.id,
            "status": "graded", "total_score": 7.0, "max_score": 10.0, "created_at": datetime.now(timezone.utc),
        })
        rows = await questions_router.list_my_attempt_history(current_user=self.student)
        self.assertTrue(rows[0]["can_retake"])

    async def test_practice_item_can_always_retake(self):
        qs_id = ObjectId()
        await self.db["question_sets"].insert_one({"_id": qs_id, "document_name": "Chương 1"})
        await self.db["question_attempts"].insert_one({
            "_id": ObjectId(), "question_set_id": str(qs_id), "document_id": "doc-1", "user_id": self.student.id,
            "score": 8, "max_score": 10, "percent": 80.0, "created_at": datetime.now(timezone.utc),
        })
        rows = await questions_router.list_my_attempt_history(current_user=self.student)
        self.assertTrue(rows[0]["can_retake"])
        self.assertFalse(rows[0]["source_deleted"])
```

- [ ] **Step 3: Chạy test, xác nhận FAIL**

Run: `cd backend && python -m pytest tests/test_questions_attempt_history.py -v`
Expected: FAIL — `KeyError: 'item_type'` (field chưa tồn tại trong response hiện tại)

- [ ] **Step 4: Sửa `list_my_attempt_history`**

`backend/app/routers/questions.py` — thay thế toàn bộ hàm `list_my_attempt_history` (dòng 1077-1109) bằng:

```python
@router.get("/attempts/my-history")
async def list_my_attempt_history(
    current_user: UserResponse = Depends(get_current_user),
):
    """Return the signed-in student's recent exam and practice history."""
    if getattr(current_user, "role", "user") != "student":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Chỉ sinh viên mới có lịch sử học tập.")

    db = get_database()
    rows = []

    cursor_db = (
        db["question_attempts"]
        .find({"user_id": current_user.id})
        .sort("created_at", -1)
        .limit(100)
    )
    async for item in cursor_db:
        question_set = None
        try:
            question_set = await db["question_sets"].find_one({"_id": ObjectId(item["question_set_id"])})
        except Exception:
            pass
        rows.append({
            "id": str(item["_id"]),
            "item_type": "practice",
            "question_set_id": item["question_set_id"],
            "document_id": item["document_id"],
            "title": (question_set or {}).get("document_name", "Bộ câu hỏi"),
            "score": item["score"],
            "max_score": item["max_score"],
            "percent": item["percent"],
            "created_at": item["created_at"],
            "source_deleted": False,
            "can_retake": True,
        })

    exam_cursor = (
        db["exam_attempts"]
        .find({"student_id": current_user.id})
        .sort("created_at", -1)
        .limit(100)
    )
    async for item in exam_cursor:
        exam = None
        try:
            exam = await db["exams"].find_one({"_id": ObjectId(item["exam_id"])})
        except Exception:
            pass
        source_deleted = bool(exam and exam.get("deleted_at") is not None) or exam is None
        finished = item["status"] in ("submitted", "graded")
        can_retake = bool(exam and exam.get("allow_retake", False) and not source_deleted and finished)
        max_score = item.get("max_score", 0.0)
        total_score = item.get("total_score", 0.0)
        rows.append({
            "id": str(item["_id"]),
            "item_type": "exam",
            "exam_id": item["exam_id"],
            "title": f"Đề {item.get('exam_code', '')}",
            "score": total_score,
            "max_score": max_score,
            "percent": round(total_score / max_score * 100, 1) if max_score else 0.0,
            "created_at": item["created_at"],
            "source_deleted": source_deleted,
            "can_retake": can_retake,
        })

    rows.sort(key=lambda row: row["created_at"], reverse=True)
    return rows[:100]
```

- [ ] **Step 5: Chạy test, xác nhận PASS**

Run: `cd backend && python -m pytest tests/test_questions_attempt_history.py -v`
Expected: PASS toàn bộ 4 test

- [ ] **Step 6: Chạy lại toàn bộ test suite backend để chắc không phá gì khác**

Run: `cd backend && python -m pytest tests/ -v`
Expected: PASS toàn bộ (không có regression từ việc đổi field `document_name`→`title` trong response)

- [ ] **Step 7: Commit**

```bash
git add backend/app/routers/questions.py backend/tests/test_questions_attempt_history.py
git commit -m "feat: merge exam_bank attempts into student attempt history with retake gating"
```

---

### Task 7: Frontend — cập nhật API layer

**Files:**
- Modify: `frontend/src/api/questionApi.ts` (`LearningHistoryItem`, `listMyLearningHistory`)
- Modify: `frontend/src/api/documentApi.ts` (không đổi — `delete` đã đúng, chỉ xác nhận)
- Create: `frontend/src/api/teacherHistoryApi.ts`

**Interfaces:**
- Consumes: Task 5 (`GET /teacher/content-history`), Task 6 (`GET /questions/attempts/my-history` field mới).
- Produces: `teacherHistoryApi.list(...)`, `LearningHistoryItem` mới — Task 8/9 dùng.

- [ ] **Step 1: Sửa `LearningHistoryItem` khớp response mới của Task 6**

`frontend/src/api/questionApi.ts` — thay `LearningHistoryItem` (dòng 102-110) bằng:

```typescript
export interface LearningHistoryItem {
  id: string;
  item_type: 'practice' | 'exam';
  question_set_id?: string;
  document_id?: string;
  exam_id?: string;
  title: string;
  score: number;
  max_score: number;
  percent: number;
  created_at: string;
  source_deleted: boolean;
  can_retake: boolean;
}
```

- [ ] **Step 2: Tạo `frontend/src/api/teacherHistoryApi.ts`**

```typescript
import client from './client';

export type ContentHistoryType = 'all' | 'document' | 'exam';

export interface ContentHistoryItem {
  id: string;
  item_type: 'document' | 'exam';
  title: string;
  created_at: string;
  cloudinary_url: string | null;
  blueprint_id: string | null;
  attempt_count: number | null;
  avg_score: number | null;
  last_attempt_at: string | null;
  allow_retake: boolean | null;
  version: number | null;
}

export interface ContentHistoryResponse {
  items: ContentHistoryItem[];
  total: number;
  skip: number;
  limit: number;
}

export const teacherHistoryApi = {
  list: async (params: {
    type?: ContentHistoryType;
    search?: string;
    skip?: number;
    limit?: number;
  } = {}): Promise<ContentHistoryResponse> => {
    const response = await client.get<ContentHistoryResponse>('/teacher/content-history', { params });
    return response.data;
  },
};
```

- [ ] **Step 3: Kiểm tra frontend build không lỗi type**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: Không lỗi liên quan tới `LearningHistoryItem`/`teacherHistoryApi` (lỗi ở các file Task 9 chưa sửa là dự kiến, sẽ hết ở Task 9 — nếu ở bước này `LearningHistoryPage.tsx` báo lỗi thiếu `document_name`, đó là tín hiệu ĐÚNG cho biết Task 9 cần sửa nó).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/questionApi.ts frontend/src/api/teacherHistoryApi.ts
git commit -m "feat: add teacherHistoryApi and update LearningHistoryItem shape"
```

---

### Task 8: Frontend — trang lịch sử nội dung cho giảng viên

**Files:**
- Create: `frontend/src/pages/teacher/ContentHistoryPage.tsx`
- Modify: `frontend/src/App.tsx` (route + lazy import)
- Modify: `frontend/src/components/AppLayout.tsx` (nav item)

**Interfaces:**
- Consumes: `teacherHistoryApi.list` (Task 7), `documentApi.delete` (đã có), `examBankApi.setAllowRetake`/`examBankApi.deleteExam` (Task 1/Task 4), `ConfirmDialog`/`DataTable`/`FilterBar`/`Pagination`/`Tabs` từ `components/ui`.
- Bảng có cột checkbox "Cho làm lại" cho item loại `exam` — gọi `examBankApi.setAllowRetake` khi tick/bỏ tick; nút Xóa gọi `examBankApi.deleteExam` cho item loại `exam` (KHÔNG chỉ điều hướng sang trang khác).

- [ ] **Step 1: Tạo trang**

Tạo `frontend/src/pages/teacher/ContentHistoryPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, ExternalLink, Pencil } from 'lucide-react';
import { teacherHistoryApi } from '../../api/teacherHistoryApi';
import type { ContentHistoryItem, ContentHistoryType } from '../../api/teacherHistoryApi';
import { documentApi } from '../../api/documentApi';
import { examBankApi } from '../../api/examBankApi';
import { getApiErrorDetail } from '../../api/errors';
import {
  Alert,
  ConfirmDialog,
  DataTable,
  FilterBar,
  Input,
  Pagination,
  PageHeader,
  Tabs,
  useToast,
} from '../../components/ui';
import type { DataTableColumn, TabItem } from '../../components/ui';

const PAGE_SIZE = 20;

const TABS: TabItem[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'document', label: 'Học liệu' },
  { id: 'exam', label: 'Đề thi' },
];

export default function ContentHistoryPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [type, setType] = useState<ContentHistoryType>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<ContentHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ContentHistoryItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    teacherHistoryApi
      .list({ type, search: search || undefined, skip: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE })
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((err) => setError(getApiErrorDetail(err) ?? 'Không tải được lịch sử.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [type, search, page]);

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      if (pendingDelete.item_type === 'document') {
        await documentApi.delete(pendingDelete.id);
      } else {
        await examBankApi.deleteExam(pendingDelete.id, pendingDelete.version ?? 1);
      }
      toast({ tone: 'success', title: 'Đã xóa khỏi lịch sử.' });
      setPendingDelete(null);
      load();
    } catch (err) {
      toast({ tone: 'error', title: getApiErrorDetail(err) ?? 'Xóa thất bại.' });
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleRetake = async (row: ContentHistoryItem) => {
    if (row.item_type !== 'exam' || row.version === null) return;
    setTogglingId(row.id);
    try {
      await examBankApi.setAllowRetake(row.id, row.version, !row.allow_retake);
      load();
    } catch (err) {
      toast({ tone: 'error', title: getApiErrorDetail(err) ?? 'Cập nhật thất bại.' });
    } finally {
      setTogglingId(null);
    }
  };

  const columns: DataTableColumn<ContentHistoryItem>[] = [
    { key: 'title', label: 'Tên', render: (row) => row.title },
    {
      key: 'item_type',
      label: 'Loại',
      render: (row) => (row.item_type === 'document' ? 'Học liệu' : 'Đề thi'),
    },
    {
      key: 'created_at',
      label: 'Ngày tạo',
      render: (row) => new Date(row.created_at).toLocaleString('vi-VN'),
    },
    {
      key: 'attempt_count',
      label: 'Số lượt làm',
      render: (row) => (row.item_type === 'exam' ? row.attempt_count ?? '—' : '—'),
    },
    {
      key: 'avg_score',
      label: 'Điểm TB',
      render: (row) => (row.item_type === 'exam' ? row.avg_score ?? '—' : '—'),
    },
    {
      key: 'allow_retake',
      label: 'Cho làm lại',
      render: (row) =>
        row.item_type === 'exam' ? (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={row.allow_retake ?? false}
              disabled={togglingId === row.id}
              onChange={() => handleToggleRetake(row)}
            />
          </label>
        ) : (
          '—'
        ),
    },
    {
      key: 'actions',
      label: 'Hành động',
      render: (row) => (
        <div style={{ display: 'flex', gap: 8 }}>
          {row.item_type === 'document' && row.cloudinary_url && (
            <a href={row.cloudinary_url} target="_blank" rel="noreferrer" className="btn-secondary">
              <ExternalLink size={16} /> Xem
            </a>
          )}
          {row.item_type === 'exam' && row.blueprint_id && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => navigate(`/exam-blueprints/${row.blueprint_id}`)}
            >
              <Pencil size={16} /> Sửa
            </button>
          )}
          <button type="button" className="btn-danger" onClick={() => setPendingDelete(row)}>
            <Trash2 size={16} /> Xóa
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="page">
      <div className="page-wide">
        <PageHeader
          eyebrow="Giảng viên"
          title="Lịch sử học liệu & đề thi"
          description="Xem, sửa, xóa và theo dõi thống kê sử dụng."
        />

        <Tabs
          items={TABS}
          value={type}
          onChange={(id) => {
            setType(id as ContentHistoryType);
            setPage(1);
          }}
          ariaLabel="Lọc theo loại nội dung"
        />

        <FilterBar>
          <Input
            placeholder="Tìm theo tên..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </FilterBar>

        {error && <Alert tone="error">{error}</Alert>}

        <DataTable
          columns={columns}
          data={items}
          rowKey={(row) => row.id}
          loading={loading}
          emptyMessage="Chưa có học liệu hoặc đề thi nào."
        />

        <Pagination
          page={page}
          totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
          total={total}
          onPageChange={setPage}
          label="mục"
        />

        <ConfirmDialog
          open={pendingDelete !== null}
          onClose={() => setPendingDelete(null)}
          onConfirm={handleDelete}
          title="Xóa khỏi lịch sử?"
          description={pendingDelete ? `"${pendingDelete.title}" sẽ bị xóa khỏi danh sách quản lý.` : undefined}
          confirmLabel="Xóa"
          confirmVariant="danger"
          busy={deleting}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Thêm route + lazy import**

`frontend/src/App.tsx` — thêm lazy import sau dòng 56 (`const ExamGradingPage = ...`):

```typescript
const ContentHistoryPage = lazy(() => import('./pages/teacher/ContentHistoryPage'));
```

Thêm route sau route `/exams/:examId/grading` (dòng ~200-203):

```tsx
        <Route
          path="/teacher/content-history"
          element={<AppLayout><RoleRoute allow={TEACHER_ONLY}><ContentHistoryPage /></RoleRoute></AppLayout>}
        />
```

- [ ] **Step 3: Thêm nav item**

`frontend/src/components/AppLayout.tsx` — thêm vào mảng nav giảng viên, sau `{ to: '/documents', label: 'Học liệu', icon: <Library size={ICON} /> },` (dòng 166):

```typescript
            { to: '/teacher/content-history', label: 'Lịch sử', icon: <ClipboardList size={ICON} /> },
```

(nếu `ClipboardList` chưa import ở đầu file — đã import sẵn, dùng lại ở dòng 169 cho `/exam-blueprints`, xác nhận trước khi thêm bằng `grep -n "ClipboardList" frontend/src/components/AppLayout.tsx`)

- [ ] **Step 4: Verify bằng browser preview**

Run dev server (`frontend`, đã có trong `.claude/launch.json`), đăng nhập tài khoản role `lecturer`/`user`, vào `/teacher/content-history`, kiểm tra:
- Tab Tất cả/Học liệu/Đề thi lọc đúng
- Search lọc theo tên
- Bấm Xóa 1 học liệu → confirm dialog → item biến mất khỏi bảng
- Nếu học liệu có `cloudinary_url` → nút Xem mở đúng file

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/teacher/ContentHistoryPage.tsx frontend/src/App.tsx frontend/src/components/AppLayout.tsx
git commit -m "feat: add teacher content history page"
```

---

### Task 9: Frontend — cập nhật trang lịch sử học sinh (filter + retake gating)

**⚠️ Sửa lại lúc review (phát hiện sau khi Task 9 làm lần đầu):** Bản thiết kế ban đầu nhắm vào `frontend/src/pages/LearningHistoryPage.tsx`, nhưng file đó **là dead code** — không route nào trong `App.tsx` trỏ tới. Route `/learning-history` thật sự render `frontend/src/pages/student/ProgressPage.tsx` (đã gộp từ `LearningHistoryPage` + `StudentStatisticsPage` cũ ở một đợt redesign trước, xem docstring đầu file `ProgressPage.tsx`). Task này phải sửa `ProgressPage.tsx`, và xóa hẳn `LearningHistoryPage.tsx` (đã xác nhận với người dùng — dead code, xóa cho gọn).

**Files:**
- Modify: `frontend/src/pages/student/ProgressPage.tsx`
- Delete: `frontend/src/pages/LearningHistoryPage.tsx`

**Interfaces:**
- Consumes: `LearningHistoryItem` mới (Task 7: `item_type`, `title`, `source_deleted`, `can_retake`, `exam_id?`, `question_set_id?`), `Tabs`/`Tooltip` từ `components/ui`.

**Quyết định thiết kế:** phần thống kê tổng quan ở trên (`StatGrid`: đã hoàn thành/chưa làm/điểm TB/điểm cao nhất) CHỈ tính trên item `item_type==='practice'` — giữ nguyên đúng hành vi cũ, vì các số này gắn với khái niệm "bài luyện tập đã giao" (`assignedCount` từ `listPublished()`, vốn chỉ về question_sets), không liên quan đề thi giảng viên giao có hẹn giờ. Phần danh sách "Các lần làm bài" bên dưới mới là nơi thêm tab lọc (Tất cả/Đề thi GV giao/Ôn tập) + khoá nút làm lại — đây là tính năng chính task này thêm.

- [ ] **Step 1: Xóa file dead code**

```bash
git rm frontend/src/pages/LearningHistoryPage.tsx
```

- [ ] **Step 2: Sửa `ProgressPage.tsx`**

Thay toàn bộ nội dung file bằng:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { History, RotateCcw, TrendingUp } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  PageHeader,
  Select,
  Skeleton,
  StatGrid,
  StatTile,
  Tabs,
  Tooltip,
} from '../../components/ui';
import type { TabItem } from '../../components/ui';
import { questionApi } from '../../api/questionApi';
import type { LearningHistoryItem } from '../../api/questionApi';
import '../dashboard.css';

type LoadState = 'loading' | 'ready' | 'error';
type RangeKey = 'all' | '7' | '30' | '90';
type ItemFilter = 'all' | 'exam' | 'practice';

const RANGE_OPTIONS: Array<{ value: RangeKey; label: string }> = [
  { value: 'all', label: 'Toàn bộ thời gian' },
  { value: '7', label: '7 ngày qua' },
  { value: '30', label: '30 ngày qua' },
  { value: '90', label: '90 ngày qua' },
];

const ITEM_FILTER_TABS: TabItem[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'exam', label: 'Đề thi GV giao' },
  { id: 'practice', label: 'Ôn tập' },
];

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Nhãn đánh giá kèm màu — luôn có chữ, không chỉ dựa vào màu để truyền đạt. */
function verdictOf(percent: number): { label: string; variant: 'success' | 'warning' | 'error' } {
  if (percent >= 80) return { label: 'Tốt', variant: 'success' };
  if (percent >= 50) return { label: 'Đạt', variant: 'warning' };
  return { label: 'Cần ôn tập', variant: 'error' };
}

/** Đích điều hướng khi bấm vào 1 dòng lịch sử — khác nhau theo loại. */
function retakePathOf(item: LearningHistoryItem): string {
  return item.item_type === 'practice'
    ? `/question-sets/${item.question_set_id}`
    : `/take-exam/${item.exam_id}`;
}

/**
 * Tiến độ học tập — gộp từ hai trang cũ.
 *
 * `LearningHistoryPage` và `StudentStatisticsPage` trước đây gọi đúng cùng hai
 * API (`listMyLearningHistory` + `listPublished`) rồi mỗi trang tự tính lại số
 * liệu. Đó là hai góc nhìn của một tập dữ liệu, không phải hai chức năng, nên
 * gộp thành một trang: phần tổng quan ở trên, phần chi tiết ở dưới.
 * Xem docs/ui-redesign/01-audit-report.md §6.3 (lỗi M4).
 *
 * Phần tổng quan (StatGrid) chỉ tính trên item ôn tập (`item_type==='practice'`)
 * — các số này gắn với "bài luyện tập đã giao" (`assignedCount`), không liên
 * quan đề thi giảng viên giao. Phần danh sách chi tiết bên dưới gộp cả 2 loại,
 * có tab lọc + khoá nút làm lại theo `can_retake`/`source_deleted`.
 */
export default function ProgressPage() {
  const [state, setState] = useState<LoadState>('loading');
  const [attempts, setAttempts] = useState<LearningHistoryItem[]>([]);
  const [assignedCount, setAssignedCount] = useState(0);
  const [range, setRange] = useState<RangeKey>('all');
  const [itemFilter, setItemFilter] = useState<ItemFilter>('all');
  // Thời điểm "bây giờ" cho bộ lọc khoảng ngày. Đọc đồng hồ đúng một lần bằng
  // hàm khởi tạo lười của useState — cách duy nhất gọi Date.now() mà không bị
  // coi là gọi hàm không thuần khiết ngay trong thân render. "Vài ngày" không
  // cần chính xác tới từng giây nên giá trị cố định trong vòng đời trang là đủ.
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    // Một lần tải cho cả phần tổng quan và phần chi tiết.
    Promise.all([questionApi.listMyLearningHistory(), questionApi.listPublished()])
      .then(([history, published]) => {
        if (cancelled) return;
        setAttempts(history ?? []);
        setAssignedCount(published.items?.length ?? 0);
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const practiceAttempts = useMemo(
    () => attempts.filter((item) => item.item_type === 'practice'),
    [attempts],
  );

  const filtered = useMemo(() => {
    let list = attempts;
    if (itemFilter !== 'all') {
      list = list.filter((item) => item.item_type === itemFilter);
    }
    if (range !== 'all') {
      const days = Number(range);
      const cutoff = now - days * 24 * 60 * 60 * 1000;
      list = list.filter((item) => {
        const t = new Date(item.created_at).getTime();
        return Number.isFinite(t) && t >= cutoff;
      });
    }
    return list;
  }, [attempts, itemFilter, range, now]);

  const stats = useMemo(() => {
    // Chỉ tính trên item ôn tập — xem quyết định thiết kế ở docstring trên.
    const completedIds = new Set(practiceAttempts.map((item) => item.question_set_id));
    const average =
      practiceAttempts.length > 0
        ? practiceAttempts.reduce((sum, item) => sum + item.percent, 0) / practiceAttempts.length
        : null;
    const best = practiceAttempts.length > 0 ? Math.max(...practiceAttempts.map((item) => item.percent)) : null;

    // Bài yếu nhất để gợi ý ôn lại: lấy lần làm gần nhất của mỗi bộ đề rồi chọn điểm thấp nhất.
    const latestBySet = new Map<string, LearningHistoryItem>();
    for (const attempt of practiceAttempts) {
      if (attempt.question_set_id && !latestBySet.has(attempt.question_set_id)) {
        latestBySet.set(attempt.question_set_id, attempt);
      }
    }
    const weakest = [...latestBySet.values()].sort((a, b) => a.percent - b.percent)[0] ?? null;

    return {
      completed: completedIds.size,
      pending: Math.max(0, assignedCount - completedIds.size),
      average,
      best,
      weakest,
    };
  }, [practiceAttempts, assignedCount]);

  const hasData = attempts.length > 0;

  return (
    <>
      <PageHeader
        eyebrow="Học tập"
        title="Tiến độ"
        description="Kết quả từng lần làm bài và mức tiến bộ của bạn theo thời gian."
        actions={
          stats.weakest ? (
            <Link to={`/question-sets/${stats.weakest.question_set_id}`}>
              <Button leadingIcon={<RotateCcw size={16} aria-hidden="true" />}>
                Ôn lại bài yếu nhất
              </Button>
            </Link>
          ) : (
            <Link to="/published-questions">
              <Button>Tới bài luyện tập</Button>
            </Link>
          )
        }
      />

      {state === 'loading' && (
        <div className="ez-stack">
          <Skeleton height="6rem" />
          <Skeleton height="16rem" />
        </div>
      )}

      {state === 'error' && (
        <ErrorState
          title="Không tải được tiến độ học tập"
          description="Kết nối tới hệ thống đang gặp sự cố. Bạn có thể thử lại."
          onRetry={() => window.location.reload()}
        />
      )}

      {state === 'ready' && !hasData && (
        <EmptyState
          icon={<History size={28} />}
          title="Bạn chưa có lần làm bài nào"
          description="Hoàn thành một bài luyện tập, kết quả và mức tiến bộ sẽ hiện ở đây."
          actions={
            <Link to="/published-questions">
              <Button>Bắt đầu bài luyện tập đầu tiên</Button>
            </Link>
          }
        />
      )}

      {state === 'ready' && hasData && (
        <>
          {/* Phần tổng quan — trước đây là cả một trang riêng, chỉ tính trên ôn tập */}
          <StatGrid style={{ marginBottom: 'var(--ez-space-8)' }}>
            <StatTile label="Bài đã hoàn thành" value={stats.completed} />
            <StatTile label="Bài chưa làm" value={stats.pending} />
            <StatTile
              label="Điểm trung bình"
              value={stats.average === null ? '—' : `${stats.average.toFixed(1)}%`}
              hint={`Từ ${practiceAttempts.length} lượt làm`}
            />
            <StatTile
              label="Kết quả cao nhất"
              value={stats.best === null ? '—' : `${stats.best.toFixed(1)}%`}
            />
          </StatGrid>

          {/* Phần chi tiết — trước đây là trang Lịch sử, giờ gộp cả đề thi GV giao */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle as="h2">Các lần làm bài</CardTitle>
              </div>
              <Select
                aria-label="Lọc theo khoảng thời gian"
                value={range}
                onChange={(event) => setRange(event.target.value as RangeKey)}
                style={{ width: 'auto' }}
              >
                {RANGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </CardHeader>
            <CardBody>
              <Tabs
                items={ITEM_FILTER_TABS}
                value={itemFilter}
                onChange={(id) => setItemFilter(id as ItemFilter)}
                ariaLabel="Lọc theo loại"
              />
              {filtered.length === 0 ? (
                <EmptyState
                  compact
                  icon={<TrendingUp size={24} />}
                  title="Không có lần làm bài nào trong khoảng này"
                  description="Hãy chọn khoảng thời gian hoặc loại rộng hơn."
                  actions={
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setRange('all');
                        setItemFilter('all');
                      }}
                    >
                      Xem toàn bộ
                    </Button>
                  }
                />
              ) : (
                <div>
                  {filtered.map((item) => {
                    const verdict = verdictOf(item.percent);
                    const canOpen = !item.source_deleted && item.can_retake;
                    const rowContent = (
                      <>
                        <span className="dash-row-main">
                          <span className="dash-row-title">{item.title}</span>
                          <span className="dash-row-meta">
                            <span>{formatDateTime(item.created_at)}</span>
                            <span>
                              {item.score}/{item.max_score} câu đúng
                            </span>
                          </span>
                        </span>
                        <span className="dash-row-trail">
                          <Badge variant={item.item_type === 'exam' ? 'info' : 'neutral'}>
                            {item.item_type === 'exam' ? 'Đề thi' : 'Ôn tập'}
                          </Badge>
                          <Badge variant={verdict.variant}>{verdict.label}</Badge>
                          <span className="dash-score">{item.percent.toFixed(1)}%</span>
                        </span>
                      </>
                    );
                    if (!canOpen) {
                      const disabledRow = (
                        <span key={item.id} className="dash-row dash-row-disabled" aria-disabled="true">
                          {rowContent}
                        </span>
                      );
                      return item.source_deleted ? (
                        <Tooltip key={item.id} label="Tài liệu/đề thi gốc đã bị xóa">
                          {disabledRow}
                        </Tooltip>
                      ) : (
                        disabledRow
                      );
                    }
                    return (
                      <Link key={item.id} to={retakePathOf(item)} className="dash-row">
                        {rowContent}
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </>
  );
}
```

- [ ] **Step 3: Kiểm tra `Badge` component có variant `neutral`/`info`**

Run: `grep -n "BadgeVariant" frontend/src/components/ui/Badge.tsx`
Expected: xác nhận `neutral`/`info` nằm trong danh sách variant hợp lệ. Nếu tên khác (ví dụ chỉ có `default`/`success`/`warning`/`error`), đổi 2 chỗ dùng `Badge variant={...}` cho loại item ở trên cho khớp đúng tên variant thật.

- [ ] **Step 4: Thêm CSS cho `.dash-row-disabled` nếu chưa có**

Run: `grep -n "dash-row" frontend/src/pages/dashboard.css`
Nếu chưa có class `.dash-row-disabled`, thêm vào cuối `frontend/src/pages/dashboard.css`:
```css
.dash-row-disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
```

- [ ] **Step 5: Kiểm tra frontend build không lỗi type**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: không lỗi mới trong `ProgressPage.tsx` (lỗi ở 3 file còn lại của Task 10 — `PublishedQuestionSetsPage.tsx`, `StudentStatisticsPage.tsx`, `StudentDashboardPage.tsx` — là dự kiến, Task 10 xử lý).

- [ ] **Step 6: Verify bằng browser preview**

Đăng nhập tài khoản role `student`, vào `/learning-history` (route thật render `ProgressPage`):
- Phần tổng quan (StatGrid) vẫn đúng như trước, không đổi vì chỉ tính trên ôn tập
- Tab Tất cả/Đề thi GV giao/Ôn tập trong phần "Các lần làm bài" lọc đúng số dòng
- Item ôn tập luôn bấm vào được (điều hướng `/question-sets/:id`)
- Item đề thi `can_retake=false` không bấm vào được (dòng mờ, `cursor: not-allowed`), `can_retake=true` bấm vào được, điều hướng `/take-exam/:examId`
- Item `source_deleted=true` có tooltip giải thích khi hover, dòng disabled

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/student/ProgressPage.tsx frontend/src/pages/dashboard.css
git commit -m "feat: add exam/practice filter and retake gating to student progress page"
```

---

### Task 10: Frontend — sửa 4 trang khác đang dùng chung endpoint bị đổi ở Task 6

**Bối cảnh (phát hiện lúc review Task 6, không có trong bản thiết kế ban đầu):** `GET /questions/attempts/my-history` (Task 6) đổi field `document_name`→`title` và giờ trả về CẢ dòng `item_type=exam` lẫn `practice`. Trước Task 6, endpoint này chỉ trả về dòng ôn tập (practice). 4 trang dưới đây gọi `questionApi.listMyLearningHistory()` và giả định 100% dữ liệu là ôn tập (dùng `question_set_id` làm key, đọc `document_name`) — nếu không sửa, sau khi Task 6 lên production: hiện title rỗng, và ở `PublishedQuestionSetsPage.tsx` dòng `exam` (không có `question_set_id`) sẽ làm `Map` dedupe sai.

**⚠️ Cập nhật lúc review Task 9:** `ProgressPage.tsx` KHÔNG còn thuộc phạm vi task này nữa — Task 9 (đã sửa lại) đã trực tiếp cập nhật file đó với đầy đủ tab lọc + gating (vì đó chính là trang `/learning-history` thật, không phải file dead code ban đầu tưởng nhầm). Task 10 giờ chỉ còn đúng 3 file phụ dưới đây.

**Nguyên tắc sửa (giống nhau cho cả 3 file):** các trang này CHỈ quan tâm tiến độ ôn tập (question_set), không cần biết về đề thi giảng viên giao (đã có `ProgressPage.tsx`/Task 9 lo phần đó) — nên cách an toàn nhất, đúng đúng phạm vi gốc của 3 trang này, là lọc `item_type === 'practice'` ngay sau khi nhận dữ liệu (giữ nguyên hành vi cũ 100%), rồi đổi `.document_name` → `.title`.

**Files:**
- Modify: `frontend/src/pages/PublishedQuestionSetsPage.tsx`
- Modify: `frontend/src/pages/StudentStatisticsPage.tsx`
- Modify: `frontend/src/pages/student/StudentDashboardPage.tsx`

**Interfaces:**
- Consumes: `LearningHistoryItem` từ Task 7 (đã có `item_type`/`title`).

- [ ] **Step 1: Sửa `PublishedQuestionSetsPage.tsx`**

Dòng 22-26 hiện tại:
```typescript
        const [result, history] = await Promise.all([
          questionApi.listPublished(search.trim(), controller.signal),
          questionApi.listMyLearningHistory(),
        ]);
        setItems(result.items);
        setAttempts(history);
```
Đổi thành:
```typescript
        const [result, history] = await Promise.all([
          questionApi.listPublished(search.trim(), controller.signal),
          questionApi.listMyLearningHistory(),
        ]);
        setItems(result.items);
        setAttempts(history.filter((item) => item.item_type === 'practice'));
```

Dòng 121 hiện tại: `<h3 style={styles.cardTitle}>{item.document_name}</h3>` → đổi thành `<h3 style={styles.cardTitle}>{item.title}</h3>`

- [ ] **Step 2: Sửa `StudentStatisticsPage.tsx`**

Dòng 14-19 hiện tại:
```typescript
    Promise.all([questionApi.listMyLearningHistory(), questionApi.listPublished()])
      .then(([history, published]) => {
        setAttempts(history);
        setAssignedCount(published.items.length);
      })
```
Đổi thành:
```typescript
    Promise.all([questionApi.listMyLearningHistory(), questionApi.listPublished()])
      .then(([history, published]) => {
        setAttempts(history.filter((item) => item.item_type === 'practice'));
        setAssignedCount(published.items.length);
      })
```

Dòng 79 hiện tại: `<td>{item.document_name}</td>` → đổi thành `<td>{item.title}</td>`

- [ ] **Step 3: Sửa `StudentDashboardPage.tsx`**

Dòng 48-53 hiện tại:
```typescript
    Promise.all([questionApi.listPublished(), questionApi.listMyLearningHistory()])
      .then(([publishedRes, historyRes]) => {
        if (cancelled) return;
        setPublished(publishedRes.items ?? []);
        setHistory(historyRes ?? []);
        setState('ready');
      })
```
Đổi thành:
```typescript
    Promise.all([questionApi.listPublished(), questionApi.listMyLearningHistory()])
      .then(([publishedRes, historyRes]) => {
        if (cancelled) return;
        setPublished(publishedRes.items ?? []);
        setHistory((historyRes ?? []).filter((item) => item.item_type === 'practice'));
        setState('ready');
      })
```

Đổi cả 3 chỗ đọc `document_name` sang `title`:
- Dòng 151: `{nextSet.document_name || 'Bài luyện tập'}` → `{nextSet.title || 'Bài luyện tập'}`
- Dòng 274: `{set.document_name || 'Bài luyện tập'}` → `{set.title || 'Bài luyện tập'}`
- Dòng 328: `<span className="dash-row-title">{item.document_name}</span>` → `<span className="dash-row-title">{item.title}</span>`

- [ ] **Step 4: Kiểm tra không còn chỗ nào đọc `document_name` từ `LearningHistoryItem` ngoài các chỗ đã sửa (và ngoài `ProgressPage.tsx` đã tự xử lý ở Task 9)**

Run: `grep -rn "\.document_name" frontend/src --include="*.tsx" --include="*.ts"`
Expected: không còn kết quả nào. Nếu còn sót (ngoài các chỗ đã liệt kê ở Task 9), sửa nốt theo đúng pattern trên.

- [ ] **Step 5: Kiểm tra frontend build không lỗi type**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: không lỗi

- [ ] **Step 6: Verify bằng browser preview**

Đăng nhập tài khoản role `student`, vào lần lượt `/published-questions`, `/student-statistics` (hoặc route đang trỏ tới `StudentStatisticsPage`), dashboard học sinh — xác nhận tên bài luyện tập hiện đúng (không rỗng), số liệu tiến độ không lẫn dữ liệu đề thi.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/PublishedQuestionSetsPage.tsx frontend/src/pages/StudentStatisticsPage.tsx frontend/src/pages/student/StudentDashboardPage.tsx
git commit -m "fix: update remaining learning-history consumers for title rename and mixed item types"
```

---

## Sau khi hoàn thành tất cả task

Chạy toàn bộ test suite backend 1 lần cuối để xác nhận không có regression giữa các task:

```bash
cd backend && python -m pytest tests/ -v
```

Chạy typecheck frontend:

```bash
cd frontend && npx tsc -b --noEmit
```
