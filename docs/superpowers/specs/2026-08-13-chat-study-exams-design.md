# Chat Study Exams and Curated Web Intake Design

## Goal

Let a student ask to review a subject in advanced chat, choose topic, difficulty, and question count, wait while a durable background job builds an exam, and then start the existing timed-exam experience without teacher approval at request time.

## Product decisions

- The student's grade comes from `learner_profiles.grade_level`.
- The system proposes weak subjects/topics from learner history, but the student may change the choice.
- Difficulty options are `adaptive`, `easy`, `medium`, and `hard`.
- Question-count options are exactly 5, 10, 15, and 20.
- Creating and starting are separate actions: **Tạo đề ôn tập** then **Bắt đầu làm đề**.
- If the bank is short, deterministic parameter templates may create verified variants. If it is still short, return a smaller exam and say so clearly.
- Student requests never wait for teacher approval. They may only use questions already approved/published or deterministic variants whose answers are verified by code.
- K-Means labels semantic groups; CP-SAT remains the authority that selects a constraint-satisfying set.

## Architecture

### Chat intent and configuration

Before invoking an LLM, the chat backend recognizes Vietnamese review intent and subject aliases deterministically. A recognized student request is persisted as a normal conversation pair, but the assistant message has `message_kind=study_exam_config` and a structured `study_exam_config` payload. This avoids consuming AI quota for a command the application understands itself.

### Durable study-exam request

`POST /study-exams/requests` validates ownership and creates a `study_exam_requests` record plus a Mongo background job. `GET /study-exams/requests/{id}` is polled by the chat card. The job loads the learner grade, approved/published questions, optional verified variants, applies K-Means when enough candidates exist, uses CP-SAT, and writes a published exam restricted to the requesting student.

The existing attempt endpoints remain unchanged. The completed chat card links to `/take-exam/{exam_id}`, where the existing page starts the attempt.

### Data safety

Generated review exams include `purpose=student_review`, `target_student_id`, and `source_request_id`. Attempt start and question retrieval require either a normally published exam or a review exam targeted to the current student. A student cannot request another student's job or exam.

### Parameter variants

Variants come only from explicit `parameter_template` metadata stored with an approved question. The first implementation supports integer expressions with bounded variables and a deterministic answer expression. It never rewrites prose heuristically and never asks an LLM to invent a missing answer.

### Web intake boundary

Internet discovery is a separate producer. It may search broadly, but fetched sources enter quarantine with URL, timestamps, checksum, robots decision, licence evidence, and provenance. Unreviewed crawler content cannot become a published curriculum source or a student question. The chat-exam path depends only on the reviewed question bank, so crawler failures and legal review never block student requests.

## Failure behaviour

- Missing learner grade: return a configuration error directing the student to onboarding.
- No matching approved questions/templates: mark the request failed with a safe Vietnamese explanation.
- Some but fewer than requested: publish the smaller exam and set `shortfall_count`.
- Worker retry is idempotent by request ID; it must not create duplicate exams.
- K-Means failure is non-fatal; CP-SAT still runs without cluster constraints.
- CP-SAT infeasibility never produces a constraint-breaking exam.

## Verification

- Backend service tests cover intent parsing, ownership, grade lookup, full and shortfall generation, variant verification, K-Means candidate content, and idempotency.
- Frontend tests cover response mapping and valid option values.
- Existing exam-attempt tests prove the generated published exam can be started only by its target student.
- Frontend build and focused backend test suites must pass.

## Explicit non-goals for the first vertical slice

- No arbitrary natural-language question generation.
- No unreviewed crawler content in exams.
- No Redis/Celery; reuse Mongo `background_jobs`.
- No replacement of the existing teacher blueprint workflow.
- No new exam-taking page.

