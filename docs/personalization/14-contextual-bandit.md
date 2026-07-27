# Prompt 14 - Contextual Thompson Sampling

## Decision

Contextual Thompson Sampling has been added as an optional, readiness-gated personalization layer. It does not replace:

- Candidate Generator.
- Hard constraints.
- Weighted ranker.
- Re-ranker.

Production is not enabled automatically.

Default runtime state:

- `BANDIT_ENABLED=false`
- `BANDIT_SHADOW_MODE_ENABLED=false`
- `BANDIT_KILL_SWITCH=true`

With these defaults, the weighted ranker remains the only production selector.

## Architecture

The implemented action is `candidate_source`, not raw item id.

Reason:

- Current real data is insufficient.
- Candidate source strategies are stable and easier to interpret.
- Item-level bandits would be too sparse for this project state.
- Each chosen item still comes from candidates that already passed hard constraints.

Bandit flow:

1. Candidate Generator creates candidates.
2. Ranker applies hard constraints.
3. Weighted ranker computes component scores.
4. Bandit evaluates only the safe ranked candidate set.
5. In shadow mode, bandit stores its predicted choice but does not affect display.
6. In active mode, bandit can reorder only within the safe candidate set.
7. If policy is unavailable, invalid, disabled, or killed, the system falls back to the ranker.

## Context Vector

Context schema version:

- `BANDIT_CONTEXT_SCHEMA_VERSION="bandit-context-v1"`

Features are normalized and contain no identifiers.

Learner features:

- `learner_global_ability`
- `learner_mastery_related_skill`
- `learner_recent_accuracy`
- `learner_response_time`
- `learner_hint_rate`
- `learner_session_progress`
- `learner_goal_match`
- `learner_interest_match`

Item features:

- `item_difficulty`
- `item_quality`
- `item_estimated_duration`
- `item_novelty`
- `item_knowledge_component_count`
- `item_type_question`
- `item_type_lesson`
- `item_type_review`
- `item_type_other`

Candidate source features:

- `source_weak_knowledge`
- `source_prerequisite_gap`
- `source_forgetting_review`
- `source_current_learning_goal`
- `source_similar_to_recent_error`
- `source_appropriate_difficulty`
- `source_learner_interest`
- `source_cluster_match`
- `source_exploration`
- `source_continue_current_path`

Forbidden context fields:

- `user_id`
- `item_id`
- `document_id`
- `question_id`
- `email`
- `full_name`

## Safety Rules

Bandit cannot select:

- Missing item.
- Unauthorized item.
- Verification failed item.
- Severe prerequisite gap.
- Invalid difficulty.
- Item outside candidate/ranker safe set.

Bandit does not generate items and does not call AI APIs.

## Policy

Policy collection:

- `bandit_policies`

Stored fields:

- `policy_type`
- `version`
- `context_schema_version`
- `feature_names`
- `actions`
- `prior_parameters`
- `posterior_parameters`
- `update_count`
- `status`
- `trained_at`
- `activated_at`
- `rolled_back_at`

Indexes:

- `policy_type + version` unique.
- `policy_type + status`.
- `context_schema_version`.

Current policy version:

- `BANDIT_POLICY_VERSION="v0"`

## Reward

Immediate reward components:

- `clicked`
- `started`
- `completed`
- `skipped`
- `too_easy`
- `too_hard`
- `not_relevant`
- `helpful`
- `not_helpful`

Learning reward components:

- `correctness`
- `mastery_gain`
- `delayed_retention`
- `reduced_response_time`
- `reduced_hint_dependence`

Configured weights:

- `BANDIT_REWARD_IMMEDIATE_WEIGHT=0.4`
- `BANDIT_REWARD_LEARNING_WEIGHT=0.6`

The reward function does not optimize only for click. Feedback reward is idempotent by `reward_key`, so duplicate feedback does not update the posterior twice. Delayed reward should use a unique delayed reward key in later integration.

## Shadow Mode

Shadow mode is implemented but not active by default.

Enable only when:

- Recommendation logging is stable.
- Evaluation reports contain enough real sessions.
- Hard constraints are already verified.
- `BANDIT_KILL_SWITCH=false`
- `BANDIT_SHADOW_MODE_ENABLED=true`
- `BANDIT_ENABLED=false`

Behavior:

- Weighted ranker decides the visible recommendation order.
- Bandit stores its predicted decision in recommendation log feature snapshots.
- Posterior updates can be evaluated offline.
- User experience is unchanged.

## Active Mode

Active mode is available in code but should not be enabled yet.

Required conditions:

- Real recommendation logs with sufficient exposure/reward data.
- Offline simulation shows no safety violations.
- Shadow mode outperforms or matches weighted ranker on learning-sensitive metrics.
- Exploration distribution is controlled.
- Product owner explicitly turns off kill switch.
- Rollback target policy is available.

Active configuration:

- `BANDIT_KILL_SWITCH=false`
- `BANDIT_ENABLED=true`
- `BANDIT_SHADOW_MODE_ENABLED=false`

## Exploration

Exploration controls:

- `BANDIT_EXPLORATION_RATE=0.05`
- `BANDIT_MAX_EXPLORATION_RATE=0.10`
- `BANDIT_KILL_SWITCH=true`

Exploration only occurs inside the safe candidate set. It cannot bypass prerequisite, ownership, quality, or verification checks.

## Simulation

Synthetic simulator:

```bash
backend/.venv/bin/python backend/scripts/simulate_contextual_bandit.py --output reports/personalization/contextual-bandit-simulation-2026-07-23-synthetic.json
```

Output metrics:

- Cumulative reward.
- Regret.
- Learning gain proxy.
- Safety violation rate.
- Coverage.
- Exploration distribution.

The generated simulation is marked:

```json
"is_synthetic": true
```

It is only a pipeline check and must not be presented as real system performance.

## Files

- `backend/app/personalization/algorithms/contextual_bandit.py`
- `backend/app/personalization/services/contextual_bandit_service.py`
- `backend/app/personalization/schemas/contextual_bandit.py`
- `backend/scripts/simulate_contextual_bandit.py`
- `backend/tests/test_contextual_bandit.py`
- `reports/personalization/contextual-bandit-simulation-2026-07-23-synthetic.json`

## Tests

Covered:

- Duplicate reward.
- Invalid context.
- Missing feature dimension.
- Safety filter.
- Exploration limit.
- Shadow mode.
- Kill switch.
- Rollback.
- Fallback ranker.
- Synthetic simulation marker.

## Data Needed

Before production activation, collect:

- Stable recommendation exposure logs.
- Feedback logs with non-click signals.
- Question answered events after recommendation.
- Completion and skipped events.
- Mastery gain before/after recommendation.
- Delayed retention checks.
- Response time and hint dependence deltas.
- Safety audit per recommendation.

## Limitations

- Current real dataset is still too small for trusted online optimization.
- Shadow mode needs enough logged decisions before comparison is meaningful.
- Synthetic simulation does not validate production performance.
- Action granularity is candidate source, not item-level.
- Posterior update currently uses diagonal linear Thompson Sampling for simplicity and interpretability.
