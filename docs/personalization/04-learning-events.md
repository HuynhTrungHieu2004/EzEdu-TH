# 04 - Learning Events

## Scope

Prompt 4 implements end-to-end learning event capture so later learner-state and recommendation algorithms have real behavioral data.

This prompt does not implement mastery, BKT, IRT, recommendation ranking, or AI scoring. Events are append-only records. Any quantitative learner state must be computed later by deterministic algorithms.

## Backend API

Routes are registered under:

```text
/api/v1/personalization
```

Endpoints:

```text
POST /events
GET  /events/my
GET  /events/admin/users/{user_id}
```

Access rules:

- `POST /events` requires authenticated user.
- Request body does not accept `user_id`; the service always uses `current_user.id`.
- `GET /events/my` returns only events for the current authenticated user.
- Admin event access uses the existing `require_admin` guard.
- No public endpoint returns all learning events.

The endpoints are gated by `PERSONALIZATION_ENABLED`. When disabled, the frontend event client fails silently after bounded retries.

## Backend Layers

```text
api/learning_events.py
  -> services/learning_event_service.py
    -> repositories/mongo.py
      -> MongoDB learning_events / learning_sessions
```

API layer:

- authenticates user.
- enforces root personalization feature flag.
- validates request schema.

Service layer:

- validates item access.
- resolves document context.
- writes server-side timestamps.
- strips sensitive metadata keys.
- upserts learning session.
- writes event idempotently when an `idempotency_key` is supplied.

Repository layer:

- validates question/document item visibility.
- reads/writes only with explicit user scope.
- returns only ownership-filtered event history.

## Request Contract

Schema: `LearningEventCreateRequest`.

Accepted fields:

- `event_type`
- `item_id`
- `document_id`
- `session_id`
- `idempotency_key`
- `knowledge_component_ids`
- `is_correct`
- `score`
- `response_time_ms`
- `hint_count`
- `answer_change_count`
- `attempt_number`
- `skipped`
- `completed`
- `device_context`
- `metadata`

Rejected behavior:

- extra fields such as `user_id`.
- negative response time.
- impossible response time above six hours.
- `question_answered` without `is_correct`.
- `question_answered` without `response_time_ms`.
- missing or inaccessible item.

The backend does not trust frontend timestamps. `occurred_at` is always generated server-side.

## Supported Event Types

Backend schema supports:

- `lesson_started`
- `lesson_completed`
- `question_started`
- `question_answered`
- `hint_requested`
- `explanation_viewed`
- `recommendation_shown`
- `recommendation_clicked`
- `recommendation_skipped`

The existing frontend currently emits:

- `lesson_started`
- `lesson_completed`
- `question_started`
- `question_answered`
- `explanation_viewed`

Not yet emitted because no production UI flow exists in the current app:

- `hint_requested`
- `recommendation_shown`
- `recommendation_clicked`
- `recommendation_skipped`

These event types are ready at the API/schema level for future hint and recommendation UI.

## Question Answered Event

The frontend sends `question_answered` only after the existing answer-submit API returns a scored result.

Stored fields include:

- `item_id`: `question_set_id:question_index`
- `document_id`
- `is_correct`
- `score`
- `response_time_ms`
- `attempt_number`
- `hint_count`
- `answer_change_count`
- `knowledge_component_ids` when available from learning item metadata
- `session_id`

The event does not store raw submitted answers or correct answers. Existing `question_attempts` still store answer details as before; Prompt 4 does not expand that existing behavior.

## Item and Ownership Validation

Question items:

- item IDs use `question_set_id:index`.
- owners/admins can log events for their visible question set.
- students can log events only for published questions returned by the existing question-set API.

Lesson/document items:

- `item_id` can be the document ID for lesson events.
- document access requires ownership, or admin role where relevant.

Learning items:

- persisted `learning_items` are accepted when accessible through their document context.
- KC IDs can be filled from `learning_items.knowledge_component_ids` if the frontend does not send them.

## Idempotency

Frontend generates an `idempotency_key` from stable event parts:

```text
session_id + item_id + event_type [+ attempt_id]
```

Backend checks:

```text
user_id + idempotency_key
```

If the same event is retried, the existing event is returned with `duplicate=true` instead of inserting a new event.

## Sessions

Frontend session helper:

```text
getLearningSession(contextType, contextId)
```

Session behavior:

- one session is reused for the same document/question set for up to two hours of inactivity.
- session metadata is stored in browser localStorage.
- the client does not create a new session for every click.

Backend persists sessions in `learning_sessions`:

- `user_id`
- `session_id`
- `document_id`
- `started_at`
- `last_activity_at`
- `metadata`
- `schema_version`

## Frontend Integration Points

Document detail page:

- emits `lesson_started` when a document detail view is opened.
- emits `lesson_completed` when leaving the document detail view.

Question set detail page:

- creates/reuses a question-set session.
- emits `question_started` on first answer interaction for each question.
- counts answer changes locally.
- emits `question_answered` after the existing submit-attempt API returns scored results.
- emits `explanation_viewed` when explanation becomes visible after submission or study-mode reveal.

Question card:

- exposes an `onExplanationViewed` callback.
- does not contain mastery logic.

Frontend event client:

- uses fire-and-forget calls.
- retries at most two times.
- queues a small offline buffer in localStorage.
- flushes when the browser goes online.
- deduplicates already-sent idempotency keys in memory.
- swallows event API failures so the UI does not crash.

## Privacy

- frontend cannot choose `user_id`.
- backend logs no event payloads.
- sensitive metadata keys such as `answer`, `raw_answer`, `correct_answer`, `password`, and `token` are stripped.
- no new public API exposes all events.
- admin history access uses the existing admin dependency.

## Collections and Indexes

Collections:

- `learning_events`
- `learning_sessions`

New or extended indexes:

- `le_user_idempotency_key`
- `ls_user_last_activity`
- `ls_user_session_unique`
- `ls_document_id`
- `ls_schema_version`

The migration helper remains idempotent and can be run with `--dry-run`.

## Tests

Backend tests:

- valid event.
- missing item.
- fake frontend `user_id`.
- cross-user unpublished item.
- duplicate idempotency key.
- invalid response time.

Frontend test:

- learning session/idempotency helpers work in the Node test environment.
- event client does not crash when API/browser runtime is unavailable.

Existing question-answering tests still run in the full backend suite.

## Limitations

- `hint_requested` is not emitted because there is no dedicated hint UI yet.
- recommendation events are schema/API-ready but not emitted because recommendation UI is not implemented yet.
- attempt number is currently sent as `1` by the frontend because the current page does not load attempt count before submit.
- answer-change count is tracked in the current page session only.
- no fake production data is created.
