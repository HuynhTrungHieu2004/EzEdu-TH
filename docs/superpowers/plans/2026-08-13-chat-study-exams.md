# Chat Study Exams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the tested end-to-end student chat flow that configures, creates, and starts a durable personalized review exam.

**Architecture:** Reuse advanced-chat persistence, Mongo background jobs, the existing question bank, K-Means content labels, CP-SAT selection, and the timed-exam page. Add one focused `study_exams` domain whose request record is the contract between chat, worker, and UI.

**Tech Stack:** FastAPI, Pydantic, Motor/MongoDB, scikit-learn, OR-Tools CP-SAT, React 19, TypeScript, Axios.

**Spec:** `docs/superpowers/specs/2026-08-13-chat-study-exams-design.md`

## Global Constraints

- Only `approved` or `published` bank questions may be selected.
- Variants must be deterministic and code-verified; no LLM generation is allowed in the shortage path.
- Question counts are limited to 5, 10, 15, or 20.
- K-Means is optional diversity metadata; CP-SAT is the final selector.
- A review exam is visible and startable only by `target_student_id`.
- Existing teacher exam and chat paths must remain compatible.

---

### Task 1: Study intent and request contracts

**Files:**
- Create: `backend/app/exam_bank/schemas/study_exam.py`
- Create: `backend/app/exam_bank/services/study_intent_service.py`
- Test: `backend/tests/test_study_exam_intent.py`

**Interfaces:**
- Produces: `detect_study_intent(text: str) -> StudyIntent | None`
- Produces: Pydantic request/status/config models shared by API and services.

- [ ] Write tests proving Vietnamese review phrases and subject aliases resolve while ordinary questions do not.
- [ ] Run `backend/.venv/bin/python -m pytest backend/tests/test_study_exam_intent.py -q` and observe missing-module failure.
- [ ] Implement normalized deterministic matching and strict option schemas.
- [ ] Re-run the focused test until green.

### Task 2: Selection, deterministic variants, and K-Means repair

**Files:**
- Create: `backend/app/exam_bank/services/question_variant_service.py`
- Create: `backend/app/exam_bank/services/study_exam_service.py`
- Modify: `backend/app/exam_bank/services/blueprint_service.py`
- Test: `backend/tests/test_study_exam_service.py`
- Test: `backend/tests/test_question_variant_service.py`

**Interfaces:**
- Produces: `build_verified_variants(template_question, needed, seed) -> list[dict]`
- Produces: `generate_study_exam_job(db, payload) -> dict`
- Fixes: `fetch_candidate_questions` includes `content` so K-Means can run.

- [ ] Write failing tests for bounded integer variants, answer verification, full selection, shortfall selection, and candidate content.
- [ ] Run focused tests and confirm failures are caused by missing behaviour.
- [ ] Implement the smallest deterministic engine and CP-SAT-backed selection.
- [ ] Re-run focused tests and existing blueprint-cluster tests.

### Task 3: Durable request API, ownership, and worker

**Files:**
- Create: `backend/app/exam_bank/api/study_exams.py`
- Modify: `backend/app/exam_bank/api/__init__.py`
- Modify: `backend/app/worker.py`
- Modify: `backend/app/database/mongodb.py`
- Test: `backend/tests/test_study_exam_api.py`

**Interfaces:**
- Produces: `POST /api/v1/study-exams/requests`
- Produces: `GET /api/v1/study-exams/requests/{request_id}`
- Consumes: `generate_study_exam_job` as worker handler.

- [ ] Write failing service/API tests for student-only access, ownership, idempotent enqueue, and status polling.
- [ ] Run focused tests and confirm expected failures.
- [ ] Implement records, indexes, routes, and worker registration.
- [ ] Re-run focused background-job and study-exam tests.

### Task 4: Chat structured response

**Files:**
- Modify: `backend/app/schemas/chat.py`
- Modify: `backend/app/services/learning_chat_service.py`
- Modify: `backend/app/routers/chat.py`
- Test: `backend/tests/test_learning_chat_study_intent.py`

**Interfaces:**
- Extends: `AdvancedChatResponse` and stored messages with `message_kind` and `study_exam_config`.
- Consumes: `detect_study_intent` and learner profile data.

- [ ] Write a failing test proving a student review command is persisted without calling Gemini/Groq.
- [ ] Run the test and observe the normal LLM path/failing response.
- [ ] Add the pre-LLM structured branch while preserving ordinary chat behaviour.
- [ ] Re-run learning-chat tests.

### Task 5: Student chat card and polling

**Files:**
- Create: `frontend/src/components/chat-advanced/StudyExamCard.tsx`
- Modify: `frontend/src/types/chat.ts`
- Modify: `frontend/src/api/chatApi.ts`
- Modify: `frontend/src/components/chat-advanced/AssistantMessage.tsx`
- Modify: `frontend/src/pages/AdvancedChatPage.tsx`
- Modify: `frontend/src/tests/runChatTests.tsx`

**Interfaces:**
- Displays config options and calls request/status endpoints.
- On completion, navigates to `/take-exam/{exam_id}`.

- [ ] Add failing contract assertions for allowed counts, difficulties, and structured response mapping.
- [ ] Run `npm run test:chat` and confirm failure.
- [ ] Implement the accessible config card, processing state, polling cleanup, shortfall notice, and start button.
- [ ] Run chat tests and `npm run build`.

### Task 6: Target-student exam access and final verification

**Files:**
- Modify: `backend/app/exam_bank/services/attempt_service.py`
- Modify: `backend/app/exam_bank/services/exam_service.py`
- Test: `backend/tests/test_study_exam_access.py`

**Interfaces:**
- Review exams accept only their `target_student_id`; normal published exam behaviour remains unchanged.

- [ ] Write failing tests that the target student can start/read and a different student cannot.
- [ ] Run tests and confirm the ownership gap.
- [ ] Add the narrow access guard to start and question retrieval.
- [ ] Run focused exam suites, the complete backend suite, frontend chat tests, and frontend build.

