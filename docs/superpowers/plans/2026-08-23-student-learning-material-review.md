# Student Learning Material Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a student upload a PDF, DOCX, or PPTX learning document, have AI classify it and create a private multiple-choice review set, then save, attempt, review, and retry that set from review history.

**Architecture:** Reuse the existing document extraction/indexing, curriculum taxonomy, question generation, background job, question-set detail, and practice-attempt flows. Add one thin `student_reviews` orchestration resource that owns lifecycle, idempotency, history aggregates, and student-only authorization; mark generated question sets with `purpose=student_review` so official assessments remain isolated.

**Tech Stack:** FastAPI, MongoDB/Motor, existing background worker and LLM services, React 19, TypeScript, Vite, Axios, existing Playwright setup.

**Spec:** `docs/superpowers/specs/2026-08-23-student-learning-material-review-design.md`

## Global Constraints

- Do not add dependencies or a second upload/question-generation pipeline.
- Students may upload only PDF, DOCX, or PPTX files up to 20 MB; video and transcription endpoints remain lecturer/admin-only.
- Every student review, document, question set, and attempt access must verify `user_id` ownership on the server.
- AI is used only for taxonomy classification and grounded question generation. Validation, authorization, idempotency, scoring, shuffling, persistence, and history aggregates remain deterministic.
- Taxonomy classification may select only existing `curriculum_taxonomy` nodes; it must never create nodes.
- Never store chain-of-thought. Store only normalized outputs, confidence, source chunk IDs, and short grounding excerpts.
- A deleted source document must not delete an already generated review set or its attempts.
- Existing question sets without `purpose` continue to behave as assessments.
- Use `client_request_id` plus a unique index to make review creation safe to retry.
- Each task stops after its focused tests pass; do not refactor adjacent exam-bank code.

## File Structure

| File | Responsibility |
|---|---|
| `backend/app/routers/student_reviews.py` | Student review create/status/detail/history/classification/attempt endpoints |
| `backend/app/services/student_review_service.py` | Lifecycle transitions, ownership checks, generation orchestration, shuffle/scoring, history aggregates |
| `backend/app/services/document_classification_service.py` | Strict taxonomy candidate prompt, confidence thresholds, normalized classification result |
| `backend/app/services/question_generation_service.py` | Reused generator; accept review metadata and preserve grounding fields |
| `backend/app/routers/documents.py` | Permit student document upload/extract/index/delete without broadening video permissions |
| `backend/app/worker.py` | Register classification and review-generation job handlers |
| `backend/app/main.py` | Include router and create required indexes during startup |
| `backend/tests/test_student_review_documents.py` | Student upload permissions, validation, classification trigger |
| `backend/tests/test_student_reviews.py` | Lifecycle, idempotency, generation, ownership, partial generation |
| `backend/tests/test_student_review_attempts.py` | Shuffle, scoring, history, repeat attempt behavior |
| `frontend/src/api/studentReviewApi.ts` | Typed API boundary for documents, classifications, reviews, and attempts |
| `frontend/src/pages/student/StudentLearningMaterialsPage.tsx` | Upload, processing, classification confirmation, generation configuration |
| `frontend/src/pages/student/StudentReviewHistoryPage.tsx` | Saved review list with latest/best score and retry action |
| `frontend/src/pages/student/PracticeAttemptPage.tsx` | Start and submit server-controlled review attempts |
| `frontend/src/App.tsx` | Student routes |
| `frontend/src/components/AppLayout.tsx` | Review-history navigation entry |
| `frontend/tests/student-review.spec.ts` | One durable browser flow using the checked-in demo PDF |

---

## Task 1: Add the Student Review Persistence Contract

**Interfaces:** Produces MongoDB collections `student_reviews`, `student_review_attempts`, and indexes consumed by all later tasks. Does not expose HTTP yet.

**Files:**

- Create: `backend/app/services/student_review_service.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_student_reviews.py`

- [ ] Write the failing index and state-transition tests:

```python
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
```

- [ ] Run `./.venv/bin/python -m pytest backend/tests/test_student_reviews.py -q` and confirm it fails because the service does not exist.

- [ ] Implement only the persisted state contract and indexes:

```python
REVIEW_STATES = {
    "classifying", "needs_confirmation", "ready_to_generate",
    "generating", "ready", "failed",
}

ALLOWED_TRANSITIONS = {
    "classifying": {"needs_confirmation", "ready_to_generate", "failed"},
    "needs_confirmation": {"ready_to_generate", "failed"},
    "ready_to_generate": {"generating", "failed"},
    "generating": {"ready", "failed"},
    "ready": set(),
    "failed": set(),
}

async def ensure_student_review_indexes(db):
    await db.student_reviews.create_index(
        [("user_id", 1), ("client_request_id", 1)], unique=True
    )
    await db.student_reviews.create_index([("user_id", 1), ("created_at", -1)])
    await db.student_review_attempts.create_index(
        [("review_id", 1), ("user_id", 1), ("created_at", -1)]
    )

def validate_transition(current: str, target: str) -> None:
    if target not in ALLOWED_TRANSITIONS[current]:
        raise ValueError(f"Invalid student review transition: {current} -> {target}")
```

- [ ] Call `ensure_student_review_indexes(db)` from the existing FastAPI lifespan index setup in `backend/app/main.py`.

- [ ] Run `./.venv/bin/python -m pytest backend/tests/test_student_reviews.py -q` and confirm it passes.

- [ ] Commit with `git add backend/app/services/student_review_service.py backend/app/main.py backend/tests/test_student_reviews.py && git commit -m "feat: add student review persistence contract"` when executing in a Git worktree. The current supplied folder is not a Git repository, so record the checkpoint without committing if that remains true.

---

## Task 2: Allow Safe Student Document Ingestion

**Interfaces:** Consumes existing upload/extract/index/delete endpoints. Produces indexed student-owned documents for classification. Lecturer/admin video behavior remains unchanged.

**Files:**

- Modify: `backend/app/routers/documents.py`
- Create: `backend/tests/test_student_review_documents.py`

- [ ] Write failing tests for the permission boundary and file restrictions:

```python
async def test_student_can_upload_pdf(client, student_token):
    response = await client.post(
        "/api/documents/upload",
        headers={"Authorization": f"Bearer {student_token}"},
        files={"file": ("lesson.pdf", b"%PDF-1.4 demo", "application/pdf")},
    )
    assert response.status_code == 201

async def test_student_cannot_upload_video(client, student_token):
    response = await client.post(
        "/api/documents/upload",
        headers={"Authorization": f"Bearer {student_token}"},
        files={"file": ("lesson.mp4", b"video", "video/mp4")},
    )
    assert response.status_code == 400

async def test_student_cannot_extract_another_users_document(client, student_token, teacher_document):
    response = await client.post(
        f"/api/documents/{teacher_document['_id']}/extract",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert response.status_code == 404
```

- [ ] Run `./.venv/bin/python -m pytest backend/tests/test_student_review_documents.py -q` and confirm the PDF test fails with the current lecturer/admin guard.

- [ ] Add a local document permission helper rather than broadening `ensure_lecturer_or_admin` used elsewhere:

```python
STUDENT_REVIEW_EXTENSIONS = {".pdf", ".docx", ".pptx"}
STUDENT_REVIEW_MAX_BYTES = 20 * 1024 * 1024

def ensure_document_actor(user: dict) -> None:
    if user.get("role") not in {"student", "user", "lecturer", "admin", "super_admin"}:
        raise HTTPException(status_code=403, detail="Document access denied")
```

- [ ] Apply `ensure_document_actor` only to ordinary upload, extract, index, status, and delete endpoints; retain `ensure_lecturer_or_admin` on video upload/transcription and teaching-management endpoints.

- [ ] For student uploads, validate extension and stream size at the endpoint boundary before storage; keep existing lecturer/admin formats intact.

- [ ] Verify every extract/index/delete query includes the current user's `user_id`, returning 404 for non-owned documents.

- [ ] Run `./.venv/bin/python -m pytest backend/tests/test_student_review_documents.py backend/tests/test_documents_cloudinary.py -q` and confirm both new and existing document tests pass.

- [ ] Commit `feat: allow student review document uploads` in a Git worktree.

---

## Task 3: Classify Indexed Documents Against Existing Taxonomy

**Interfaces:** Consumes document chunks and existing `curriculum_taxonomy`. Produces a normalized classification on the document and review record; enqueues no new taxonomy nodes.

**Files:**

- Create: `backend/app/services/document_classification_service.py`
- Modify: `backend/app/worker.py`
- Modify: `backend/app/services/student_review_service.py`
- Modify: `backend/tests/test_student_reviews.py`

- [ ] Write failing unit tests with a stubbed LLM result:

```python
async def test_high_confidence_classification_is_auto_confirmed(db, indexed_document, taxonomy_nodes):
    result = await classify_document(
        db, indexed_document, llm=lambda **_: {
            "subject_id": taxonomy_nodes.subject_id,
            "grade": 12,
            "chapter_id": taxonomy_nodes.chapter_id,
            "topic_ids": [taxonomy_nodes.topic_id],
            "confidence": 0.91,
        }
    )
    assert result["status"] == "confirmed"
    assert result["method"] == "ai"

async def test_unknown_taxonomy_ids_are_rejected(db, indexed_document):
    with pytest.raises(ValueError, match="taxonomy"):
        await classify_document(
            db, indexed_document,
            llm=lambda **_: {"subject_id": "missing", "grade": 12, "confidence": .9},
        )
```

- [ ] Run `./.venv/bin/python -m pytest backend/tests/test_student_reviews.py -q` and confirm the classification imports fail.

- [ ] Implement `classify_document` using the existing strict JSON LLM helper and a compact input: document title plus representative indexed chunks plus valid subject/chapter/topic candidates.

- [ ] Validate all returned IDs with Mongo queries before saving. Normalize thresholds exactly:

```python
def classification_status(confidence: float) -> str:
    if confidence >= 0.85:
        return "confirmed"
    if confidence >= 0.60:
        return "needs_confirmation"
    return "manual_required"
```

- [ ] Save only `subject_id`, `grade`, `curriculum_version`, `chapter_id`, `topic_ids`, `confidence`, `method`, `status`, and `classified_at`; do not save model reasoning.

- [ ] Register `student_document_classify` in `backend/app/worker.py`; on success transition the review to `ready_to_generate` or `needs_confirmation`, and on terminal failure to `failed` with a user-safe message.

- [ ] Make the job handler safe to retry: if a classification is already saved, return it without another LLM call.

- [ ] Run `./.venv/bin/python -m pytest backend/tests/test_student_reviews.py backend/tests/test_background_jobs.py -q` and confirm it passes.

- [ ] Commit `feat: classify student documents with curriculum taxonomy` in a Git worktree.

---

## Task 4: Expose Review Creation, Confirmation, and Generation

**Interfaces:** HTTP produces `student_reviews`; background generation consumes confirmed classification and existing indexed chunks, then produces a private `question_sets` row with `purpose=student_review`.

**Files:**

- Create: `backend/app/routers/student_reviews.py`
- Modify: `backend/app/services/student_review_service.py`
- Modify: `backend/app/services/question_generation_service.py`
- Modify: `backend/app/worker.py`
- Modify: `backend/app/main.py`
- Modify: `backend/tests/test_student_reviews.py`

- [ ] Write failing API tests for ownership, idempotency, confirmation, and generation:

```python
async def test_create_is_idempotent(client, student_token, indexed_document_id):
    body = {"document_id": indexed_document_id, "client_request_id": "demo-001"}
    first = await client.post("/api/student-reviews", json=body, headers=auth(student_token))
    second = await client.post("/api/student-reviews", json=body, headers=auth(student_token))
    assert first.status_code == second.status_code == 202
    assert first.json()["id"] == second.json()["id"]

async def test_confirmation_rejects_nonexistent_topic(client, student_token, review_id):
    response = await client.patch(
        f"/api/student-reviews/{review_id}/classification",
        json={"subject_id": "missing", "grade": 12, "topic_ids": []},
        headers=auth(student_token),
    )
    assert response.status_code == 422

async def test_generation_marks_question_set_as_student_review(db, ready_review):
    result = await generate_student_review(db, str(ready_review["_id"]))
    question_set = await db.question_sets.find_one({"_id": ObjectId(result["question_set_id"])})
    assert question_set["purpose"] == "student_review"
    assert question_set["bank_status"] == "private"
    assert question_set["promotion_status"] == "not_submitted"
```

- [ ] Run `./.venv/bin/python -m pytest backend/tests/test_student_reviews.py -q` and confirm route/generation tests fail.

- [ ] Implement these student-only routes, all scoped by `user_id`:

```text
POST  /api/student-reviews
GET   /api/student-reviews
GET   /api/student-reviews/{review_id}
PATCH /api/student-reviews/{review_id}/classification
POST  /api/student-reviews/{review_id}/generate
```

- [ ] On create, verify indexed document ownership, insert `classifying`, enqueue `student_document_classify`, and return the existing row on duplicate `(user_id, client_request_id)`.

- [ ] On classification patch, validate taxonomy IDs and save `method=student_corrected`, `confidence=1.0`, `status=confirmed`; transition to `ready_to_generate`.

- [ ] Validate generation config at the HTTP boundary: `title` 1–120 chars, `question_count` 3–50, existing supported difficulty values, and multiple-choice type only.

- [ ] Reuse `generate_questions(...)`. Add optional metadata parameters instead of copying its internals:

```python
async def generate_questions(
    document_id: str,
    user_id: str,
    question_count: int,
    difficulty: str,
    question_type: str,
    bloom_level: str | None = None,
    subject_id: str | None = None,
    grade: int | None = None,
    topic_id: str | None = None,
    output_language: str = "vi",
    *,
    question_set_metadata: dict | None = None,
) -> dict:
```

- [ ] Merge trusted server metadata into the stored question set: `purpose`, `review_id`, `bank_status`, `promotion_status`, `curriculum_version`, `chapter_id`, and `source_document_id`. Preserve each question's `source_chunk_ids` and short `grounding_excerpt`.

- [ ] Register `student_review_generate` in the worker. If generated count is at least 3 but below requested, save the partial set with a warning; if fewer than 3, mark the review failed and do not expose the set.

- [ ] Include the router in `backend/app/main.py` and confirm old question sets with missing `purpose` remain assessment-compatible.

- [ ] Run `./.venv/bin/python -m pytest backend/tests/test_student_reviews.py backend/tests/test_questions.py backend/tests/test_background_jobs.py -q` and confirm it passes.

- [ ] Commit `feat: generate private student review sets` in a Git worktree.

---

## Task 5: Add Server-Controlled Attempts and Review History

**Interfaces:** Consumes a ready review/question set. Produces immutable attempt snapshots, deterministic scoring, and review history aggregates; retries reuse the same questions with a new server shuffle.

**Files:**

- Modify: `backend/app/routers/student_reviews.py`
- Modify: `backend/app/services/student_review_service.py`
- Create: `backend/tests/test_student_review_attempts.py`

- [ ] Write failing tests for retry semantics, tamper resistance, and history:

```python
async def test_retry_reuses_question_ids_but_changes_order(db, ready_review):
    first = await start_attempt(db, ready_review["user_id"], str(ready_review["_id"]), seed=1)
    second = await start_attempt(db, ready_review["user_id"], str(ready_review["_id"]), seed=2)
    assert set(first["question_ids"]) == set(second["question_ids"])
    assert first["question_ids"] != second["question_ids"]

async def test_submit_ignores_client_supplied_score(client, student_token, attempt_id):
    response = await client.post(
        f"/api/student-reviews/attempts/{attempt_id}/submit",
        json={"answers": {"q1": "a1"}, "score": 100},
        headers=auth(student_token),
    )
    assert response.status_code == 200
    assert response.json()["score"] != 100

async def test_history_has_best_latest_and_count(client, student_token, completed_attempts):
    response = await client.get("/api/student-reviews", headers=auth(student_token))
    item = response.json()["items"][0]
    assert item["attempt_count"] == 2
    assert item["best_score"] == 80
    assert item["latest_score"] == 60

async def test_deleting_source_keeps_ready_review_and_attempts(db, ready_review, completed_attempt):
    await db.documents.delete_one({"_id": ObjectId(ready_review["document_id"])})
    assert await db.student_reviews.find_one({"_id": ready_review["_id"]})
    assert await db.student_review_attempts.find_one({"_id": completed_attempt["_id"]})
```

- [ ] Run `./.venv/bin/python -m pytest backend/tests/test_student_review_attempts.py -q` and confirm it fails.

- [ ] Add endpoints:

```text
POST /api/student-reviews/{review_id}/attempts
GET  /api/student-reviews/{review_id}/attempts
GET  /api/student-reviews/attempts/{attempt_id}
POST /api/student-reviews/attempts/{attempt_id}/submit
```

- [ ] At attempt start, load the owner-only ready review and snapshot `question_ids`, shuffled option IDs, and `started_at`. Use `random.SystemRandom().shuffle`; accept a seeded RNG only as an internal test seam.

- [ ] Return question and option IDs but omit correct answers and explanations until submission.

- [ ] At submission, accept only `{question_id: option_id}` answers, score against the stored question set, reject unknown IDs, and save `score`, `correct_count`, `total_count`, `answers`, `completed_at`, and result explanations.

- [ ] Build `attempt_count`, `latest_score`, and `best_score` with one Mongo aggregation in the review-list service; avoid persisting duplicate counters.

- [ ] Verify a second attempt never calls the LLM or question generator.

- [ ] Run `./.venv/bin/python -m pytest backend/tests/test_student_review_attempts.py backend/tests/test_questions_attempt_history.py -q` and confirm it passes.

- [ ] Commit `feat: add student review attempts and history` in a Git worktree.

---

## Task 6: Add the Typed Frontend API and Student Routes

**Interfaces:** Consumes Task 4–5 HTTP routes. Produces a single typed client used by the three student screens.

**Files:**

- Create: `frontend/src/api/studentReviewApi.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/AppLayout.tsx`
- Create: `frontend/src/pages/student/StudentReviewHistoryPage.tsx`

- [ ] Add the API types and methods without introducing a state library:

```typescript
export type ReviewStatus =
  | 'classifying' | 'needs_confirmation' | 'ready_to_generate'
  | 'generating' | 'ready' | 'failed';

export interface StudentReviewSummary {
  id: string;
  title: string;
  status: ReviewStatus;
  subjectName?: string;
  questionCount?: number;
  attemptCount: number;
  latestScore?: number;
  bestScore?: number;
  createdAt: string;
}

export const studentReviewApi = {
  create: (payload: CreateReviewPayload) => api.post('/student-reviews', payload),
  list: () => api.get<{items: StudentReviewSummary[]}>('/student-reviews'),
  get: (id: string) => api.get<StudentReview>(`/student-reviews/${id}`),
  confirmClassification: (id: string, payload: ClassificationInput) =>
    api.patch(`/student-reviews/${id}/classification`, payload),
  generate: (id: string, payload: GenerateReviewInput) =>
    api.post(`/student-reviews/${id}/generate`, payload),
};
```

- [ ] Run `cd frontend && npm run build` and confirm it fails until imported API utilities/types match the project conventions.

- [ ] Add lazy student routes under the existing student guard:

```text
/student/learning-materials
/student/review-history
/student/reviews/:reviewId
/student/reviews/:reviewId/attempt
```

- [ ] Add one `Lịch sử ôn tập` navigation item. Keep `Đề thi chính thức` unchanged and separate.

- [ ] Implement `StudentReviewHistoryPage` with existing card/list components and native loading/error/empty states. A ready row links to detail and `Làm lại`; non-ready rows show processing or failure state.

- [ ] Run `cd frontend && npm run build` and confirm it passes.

- [ ] Commit `feat: add student review routes and history UI` in a Git worktree.

---

## Task 7: Build Upload, Classification Confirmation, and Generation UI

**Interfaces:** Consumes existing document endpoints and Task 6 client. Produces a ready review or a clear recoverable error.

**Files:**

- Replace: `frontend/src/pages/student/StudentLearningMaterialsPage.tsx`
- Modify: `frontend/src/api/studentReviewApi.ts`

- [ ] Replace the current re-export with a three-step page: upload/process, confirm classification, configure/generate.

- [ ] Use a native file input with `accept=".pdf,.docx,.pptx"`; validate type and 20 MB size before sending. Reuse the same upload → extract → index polling behavior already present in `QuickGeneratePage.tsx`, moving only a small shared helper if exact duplication exceeds 20 lines.

- [ ] After indexing, create the review with `client_request_id=crypto.randomUUID()` and poll `GET /student-reviews/{id}` every two seconds while status is `classifying` or `generating`; stop polling on unmount.

- [ ] For `needs_confirmation`, render subject, grade, chapter, and topic selectors populated from the existing taxonomy API; submit the corrected IDs to the classification endpoint.

- [ ] For `ready_to_generate`, show title, question count (3–50), and existing difficulty values; submit once and disable the button while the request is pending.

- [ ] Display the partial-generation warning returned by the backend and link a ready review to `/student/reviews/{id}`.

- [ ] Preserve accessibility basics: explicit labels, keyboard-accessible controls, `aria-live` status, focus moved to the first error, and no status conveyed by color alone.

- [ ] Run `cd frontend && npm run build` and confirm it passes.

- [ ] Commit `feat: add student material review workflow UI` in a Git worktree.

---

## Task 8: Connect Review Attempts to the Existing Practice Screen

**Interfaces:** Consumes Task 5 attempt snapshots. Produces answers and renders deterministic result feedback after submission.

**Files:**

- Modify: `frontend/src/pages/student/PracticeAttemptPage.tsx`
- Modify: `frontend/src/api/studentReviewApi.ts`

- [ ] Add attempt methods to the API client:

```typescript
startAttempt: (reviewId: string) =>
  api.post<ReviewAttempt>(`/student-reviews/${reviewId}/attempts`),
submitAttempt: (attemptId: string, answers: Record<string, string>) =>
  api.post<ReviewAttemptResult>(`/student-reviews/attempts/${attemptId}/submit`, {answers}),
getAttempt: (attemptId: string) =>
  api.get<ReviewAttemptResult>(`/student-reviews/attempts/${attemptId}`),
```

- [ ] Branch `PracticeAttemptPage` by the student-review route param while preserving its existing official/practice question-set behavior.

- [ ] Render questions from the server snapshot IDs; keep selected answers keyed by question ID, not array index.

- [ ] Submit once, then render score, correct choice, explanation, and grounding excerpt. Provide `Làm lại bộ đề` that starts a fresh attempt and `Về lịch sử ôn tập`.

- [ ] Confirm no correct-answer field is required before submission by TypeScript types or UI logic.

- [ ] Run `cd frontend && npm run build` and confirm it passes.

- [ ] Commit `feat: connect student review attempts` in a Git worktree.

---

## Task 9: Prove the End-to-End Demo and Regression Boundary

**Interfaces:** Exercises the deployed user path using a durable checked-in learning-material fixture. Produces an automated proof for the long-term demo.

**Files:**

- Create: `frontend/tests/student-review.spec.ts`
- Use fixture: `deliverables/demo-learning-materials/Toan12_KhaoSatHamSo.pdf`

- [ ] Add one Playwright test that logs in as a student, opens `Học liệu số`, uploads the demo PDF, waits for indexing/classification, confirms classification only if prompted, requests five questions, opens the ready review, completes it, returns to history, and starts `Làm lại`.

```typescript
test('student creates and retries a review from uploaded material', async ({ page }) => {
  await loginAsStudent(page);
  await page.getByRole('link', { name: 'Học liệu số' }).click();
  await page.getByLabel('Tải học liệu').setInputFiles(
    '../deliverables/demo-learning-materials/Toan12_KhaoSatHamSo.pdf'
  );
  await page.getByRole('button', { name: 'Tạo bộ đề ôn tập' }).click();
  await expect(page.getByText('Bộ đề đã sẵn sàng')).toBeVisible({ timeout: 120_000 });
  await page.getByRole('link', { name: 'Bắt đầu ôn tập' }).click();
  await answerEveryQuestion(page);
  await page.getByRole('button', { name: 'Nộp bài' }).click();
  await expect(page.getByText(/Kết quả/)).toBeVisible();
  await page.getByRole('link', { name: 'Về lịch sử ôn tập' }).click();
  await page.getByRole('link', { name: 'Làm lại' }).first().click();
  await expect(page.getByRole('button', { name: 'Nộp bài' })).toBeVisible();
});
```

- [ ] Stub only the external LLM response at the backend boundary in CI; keep real document upload, extraction, indexing, Mongo persistence, routing, scoring, and retry behavior in the test.

- [ ] Run focused backend proof:

```bash
./.venv/bin/python -m pytest \
  backend/tests/test_student_review_documents.py \
  backend/tests/test_student_reviews.py \
  backend/tests/test_student_review_attempts.py \
  backend/tests/test_questions.py \
  backend/tests/test_questions_attempt_history.py -q
```

- [ ] Run frontend proof: `cd frontend && npm run build`.

- [ ] Start the existing backend/frontend test servers and run `cd frontend && npm run test:e2e -- student-review.spec.ts`.

- [ ] Manually inspect the browser at 1440 px and 390 px widths: upload controls visible, long filenames truncate, processing cannot double-submit, classification corrections are understandable, attempt results show sources, and official-exam navigation remains separate.

- [ ] Run `rg -n "TBD|TODO|FIXME|placeholder|coming soon" backend/app/routers/student_reviews.py backend/app/services/student_review_service.py backend/app/services/document_classification_service.py frontend/src/pages/student frontend/src/api/studentReviewApi.ts` and resolve every product-code hit.

- [ ] Commit `test: cover student material review flow` in a Git worktree.

---

## Final Acceptance Gate

- [ ] A student can upload only an owned PDF, DOCX, or PPTX no larger than 20 MB.
- [ ] The system extracts/indexes the document and classifies it using only existing taxonomy IDs.
- [ ] Low-confidence classification requires student confirmation; corrections are stored as `student_corrected`.
- [ ] A generation retry with the same `client_request_id` does not create a duplicate review.
- [ ] Generated questions are private, grounded to source chunks, tagged `purpose=student_review`, and never appear as official exams.
- [ ] The review appears in history before the first attempt and later shows latest score, best score, and attempt count.
- [ ] `Làm lại` reuses the same questions, reshuffles on the server, and makes no AI call.
- [ ] Students cannot access another user's document, review, question set, or attempt.
- [ ] Deleting the source document does not delete a completed review or its attempt history.
- [ ] Existing teacher upload, question generation, assessment attempts, and official-exam routes still pass their focused regression tests.
