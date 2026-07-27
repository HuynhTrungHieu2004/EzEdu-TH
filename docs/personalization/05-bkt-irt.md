# 05 - BKT and Rasch/IRT 1PL Learner Model

## Scope

Prompt 5 implements the first deterministic learner model:

- Bayesian Knowledge Tracing (BKT).
- Rasch/IRT 1PL.
- learner knowledge-state update from `question_answered` learning events.
- learner profile aggregation and level assignment.
- read-only learner-state APIs.
- basic evaluation script.

No AI API is used for mastery, ability, level, confidence, or learner-state updates.

## Backend Placement

```text
backend/app/personalization/
  algorithms/
    bkt.py
    irt.py
    learner_level.py
  services/
    learner_model_service.py
    learner_state_query_service.py
  api/
    learner_state.py
  schemas/
    learner_state.py
```

Algorithm modules are pure functions. They do not call MongoDB, HTTP, or AI providers.

## BKT Formula

Default parameters:

```text
BKT_DEFAULT_P_INIT=0.25
BKT_DEFAULT_P_LEARN=0.12
BKT_DEFAULT_P_GUESS=0.20
BKT_DEFAULT_P_SLIP=0.10
BKT_MIN_PROBABILITY=0.001
BKT_MAX_PROBABILITY=0.999
```

For a correct observation:

```text
P(L | correct) =
  P(L) * (1 - slip)
  / (P(L) * (1 - slip) + (1 - P(L)) * guess)
```

For an incorrect observation:

```text
P(L | incorrect) =
  P(L) * slip
  / (P(L) * slip + (1 - P(L)) * (1 - guess))
```

Partial score is represented as `correctness` in `[0,1]` and blends the two posteriors:

```text
posterior = correctness * posterior_correct
          + (1 - correctness) * posterior_incorrect
```

Learning transition:

```text
P(L next) = posterior + (1 - posterior) * p_learn * q_matrix_weight
```

The final value is clamped to `[0.001, 0.999]`.

## Rasch / IRT 1PL Formula

Default parameters:

```text
IRT_LEARNING_RATE=0.08
IRT_MIN_THETA=-4.0
IRT_MAX_THETA=4.0
IRT_MIN_BETA=-4.0
IRT_MAX_BETA=4.0
IRT_MIN_ATTEMPTS_RELIABLE=5
```

Probability of a correct answer:

```text
P(correct) = 1 / (1 + exp(-(theta - beta)))
```

Theta update:

```text
theta_next = theta + learning_rate * q_matrix_weight * (correctness - P(correct))
```

Beta update:

```text
beta_next = beta + learning_rate * 0.25 * q_matrix_weight * (P(correct) - correctness)
```

Both `theta` and `beta` are clamped to configured bounds. The smaller beta learning step avoids moving item difficulty too aggressively from sparse data.

## Q-Matrix Handling

The update service reads `learning_items.q_matrix_weights`.

If a learning item has no Q-Matrix but the event contains `knowledge_component_ids`, the service falls back to uniform weights over those KCs.

If neither Q-Matrix nor event KC IDs exist, the service returns:

```text
status = missing_q_matrix
```

and does not update learner state.

## Processing Flow

```text
process_learning_event(event)
  |
  v
Ignore non-question_answered events
  |
  v
Check learner_model_processed_versions for idempotency
  |
  v
Resolve Q-Matrix
  |
  v
For each KC:
  - skip stale event if occurred_at is older than last_practiced_at
  - update BKT mastery
  - update Rasch theta
  - update item beta
  - update attempts, recent accuracy, uncertainty, timing, hint rate
  - write learner_knowledge_states
  |
  v
Update learner profile
  |
  v
Store event prediction snapshot for evaluation
  |
  v
Mark event processed for current learner model version
```

The service is called after a new `question_answered` event when `LEARNER_MODEL_ENABLED=true`. Duplicate learning events are not processed twice.

## Out-of-Order Events

If an event has `occurred_at` older than the state `last_practiced_at`, that KC update is skipped. This avoids corrupting current state with stale event arrival.

The skipped KC IDs are returned as `stale_knowledge_component_ids`.

## Learner Profile and Level

The learner profile aggregates:

- average theta as `global_ability`.
- average mastery.
- profile confidence from state uncertainty.
- total attempts from KC states.

Level labels are stable keys:

- `beginner`
- `elementary`
- `intermediate`
- `advanced`
- `expert`

The algorithm does not hard-code Vietnamese display labels. UI/i18n can translate these keys later.

## Read APIs

Routes:

```text
GET /api/v1/personalization/learner/profile
GET /api/v1/personalization/learner/mastery
GET /api/v1/personalization/learner/summary
GET /api/v1/personalization/learner/strengths
GET /api/v1/personalization/learner/weaknesses
```

Rules:

- current user only.
- guarded by `PERSONALIZATION_ENABLED` and `LEARNER_MODEL_ENABLED`.
- no AI calls.
- reasons are deterministic explanations from attempts, correct count, mastery, and uncertainty.

## Evaluation Script

Script:

```text
backend/scripts/evaluate_learner_model.py
```

Metrics:

- accuracy.
- log loss.
- Brier score.
- calibration buckets.

The script reads real processed `question_answered` events with `learner_model_prediction`. If no such data exists, it returns `status=no_data` instead of inventing accuracy.

Optional fixture mode accepts a JSON array:

```json
[
  {"predicted_probability": 0.7, "actual": 1},
  {"predicted_probability": 0.4, "actual": 0}
]
```

Fixture mode is for development/testing only and is not a production accuracy report.

## Tests

Covered cases:

- consecutive correct answers raise mastery.
- wrong answers lower mastery but do not collapse it to zero.
- one correct answer does not push mastery to one.
- duplicate event does not update twice.
- multi-KC Q-Matrix updates multiple states.
- IRT probability is valid.
- theta moves in the expected direction.
- cross-user state read is blocked by repository filter.
- missing Q-Matrix returns clear status.
- event KC fallback works when no learning item exists.

## Limitations

- BKT parameters are global defaults, not calibrated per KC yet.
- Rasch beta update is online and conservative, not a batch-calibrated item model.
- Partial score is supported numerically, but current frontend sends 0/1 for question attempts.
- Event ordering is handled by skipping stale events, not by full replay.
- No forgetting model is active yet.
- Confidence is attempt-count based and should be calibrated with larger real datasets.

## Data Needed for Better Calibration

Better calibration needs:

- more `question_answered` events per KC.
- reviewed Q-Matrix mappings.
- stable item IDs and item difficulty history.
- repeat attempts across time.
- human-reviewed KC labels.
- held-out event sequences for temporal validation.
