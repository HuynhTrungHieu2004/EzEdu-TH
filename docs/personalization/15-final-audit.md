# Prompt 15 - Final Personalization Audit

Date: 2026-07-23

This audit reviews the personalization system implemented from Prompt 0 through Prompt 14. The review used source inspection, focused security checks, backend unit/integration tests, frontend lint/build checks, migration dry-run, evaluation smoke tests, and local backend/frontend startup checks.

## Executive Summary

- Critical issues found: 0.
- High issues found: 0.
- Medium issues found: 2.
- Low issues found: 3.
- Issues fixed during this audit: 1.
- Production feature flags remain conservative by default. `PERSONALIZATION_ENABLED`, `RECOMMENDATION_ENABLED`, `AI_RECOMMENDATION_EXPLANATION_ENABLED`, `BANDIT_ENABLED`, `NEURALCD_ENABLED`, and `AKT_ENABLED` are disabled by default. `BANDIT_KILL_SWITCH` is enabled by default.
- BKT/IRT is the production learner model path. NeuralCD and AKT are research-only because the readiness audit has no real personalization interactions.
- Contextual bandit remains shadow/advanced infrastructure only and is not enabled for production.

## Architecture Audit

Current module layout follows the backend convention without changing framework, database, authentication, or frontend structure:

```text
backend/app/personalization/
  algorithms/
  api/
  constants/
  evaluation/
  jobs/
  models/
  repositories/
  schemas/
  services/
  utils/
```

Layer boundaries reviewed:

- API routes use authenticated `current_user` and delegate work to services.
- Services coordinate repositories and algorithms.
- Repositories own MongoDB access and enforce user-scoped learner reads.
- Algorithms do not call AI providers, HTTP clients, or MongoDB.
- AI services only label, extract, explain, or interpret after ownership filtering.
- Frontend consumes API responses and does not compute mastery, learner level, ranking score, or bandit decisions.

Feature flag and versioning review:

- Feature defaults are safe for existing behavior.
- Model versions are included for feature schema, knowledge model, learner model, clustering model, ranking model, bandit policy, NeuralCD, and AKT.
- K-Means models and bandit policies include active/rollback status fields.
- Recommendation and digital twin responses expose model version metadata.

No circular dependency or duplicate personalization service was found in the inspected module structure.

## Security Audit

Ownership and authentication:

- Personalization API routes depend on `get_current_user` or existing `require_admin`.
- Public learner APIs use `current_user.id`; they do not accept arbitrary frontend `user_id`.
- Repository methods that read learner data require non-empty `user_id`.
- Recommendation feedback and history are scoped to the current user.
- Learning event creation takes `user_id` from authenticated user and rejects fake frontend `user_id`.
- Document, item, chunk, and graph processing paths use ownership-filtered repository reads.

AI data leakage review:

- Knowledge extraction receives chunks and items only after document ownership checks.
- Recommendation explanation receives reason codes and bounded learner/item facts after final recommendation selection.
- AI explanation validation rejects unsupported quantitative or absolute claims and falls back to deterministic templates.
- Cluster interpretation removes direct identifiers such as `user_id`, `_id`, `email`, and `full_name`.
- Bandit context schema rejects identifier features.

Residual security risks:

- Existing verification tests can call Gemini during backend test discovery. The tests passed through fallback handling, but CI should mock external AI providers to avoid quota leakage and nondeterminism.
- Prompt injection from document text is mitigated by strict JSON schemas and validation, but not eliminated. Treat AI-generated graph output as proposed/reviewable evidence, not ground truth.

## Data Audit

Implemented data surfaces:

- `knowledge_components`
- `knowledge_graph_edges`
- `learning_items`
- `learning_events`
- `learning_sessions`
- `learner_profiles`
- `learner_knowledge_states`
- `recommendation_logs`
- `cluster_models`
- `bandit_policies`

Integrity protections reviewed:

- Unique learner knowledge state index on `user_id + knowledge_component_id`.
- Learning event idempotency key index scoped by user.
- Recommendation feedback is idempotent per feedback type.
- Q-Matrix weights are normalized.
- Knowledge graph validation rejects missing nodes, self-loops, duplicate edges, and prerequisite cycles.
- Model/schema version fields are written on personalization records.
- Migration dry-run reports 46 indexes and does not write data.

Real data inventory from `reports/personalization/evaluation-2026-07-23-real.json`:

```json
{
  "learning_events": 0,
  "question_answered_events": 0,
  "learner_profiles": 0,
  "learner_knowledge_states": 0,
  "learning_items": 0,
  "recommendation_logs": 0,
  "cluster_models": 0
}
```

Residual data risks:

- No real production personalization dataset exists yet, so orphan-record and stale-model checks are currently structural rather than empirical.
- Effectiveness metrics must remain `no_data` until real learning events and recommendation logs exist.

## ML Audit

Learner model:

- BKT and Rasch/IRT 1PL compute mastery and ability algorithmically.
- AI is not used to update mastery, theta, difficulty, learner level, or confidence.
- Duplicate and out-of-order learning events are handled through processed model versions and server timestamps.

K-Means:

- Five cluster types use separate feature schemas.
- Numeric features are scaled.
- Embedding and numeric features are combined with explicit weights.
- Identifier leakage is rejected.
- K is selected over a configured range using clustering metrics and minimum cluster size checks.
- `random_state`, `n_init`, `max_iter`, normalization parameters, centroids, metrics, sample count, and model versions are persisted.
- Prediction uses active models; fitting is offline.

Advanced models:

- NeuralCD and AKT readiness audit reports zero users, zero items, zero interactions, zero Q-Matrix coverage, and production readiness `false`.
- BKT/IRT remains the production model.

Bandit:

- Contextual Thompson Sampling is guarded by feature flags, shadow mode, and kill switch.
- Bandit selects only among candidates that have already passed hard constraints.
- This audit also fixed an independent safety check so bandit filtering enforces the configured candidate quality threshold.

## Recommendation Audit

Reviewed behavior:

- Candidate generator combines weak knowledge, prerequisite gaps, forgetting review, goals, recent errors, difficulty fit, interests, clusters, exploration, and path continuity.
- Ranker applies normalized component scores and configured weights.
- Hard constraints reject unauthorized, failed verification, severe prerequisite, unsafe difficulty, locked, or missing-source items.
- Re-ranker adds diversity across knowledge components, clusters, review/new balance, difficulty, and continuity.
- Recommendation logs store component scores, ranks, reason codes, versions, and bandit context when applicable.
- AI explanation runs only after item selection and has deterministic fallback.
- Cache invalidation occurs after learning event, learner model updates, preference changes, and feedback paths.

Residual recommendation risks:

- With no real learning events and recommendation logs, offline acceptance, diversity, novelty, and learning-gain metrics cannot yet support production claims.
- Exploration should remain limited and shadowed until enough safety logs exist.

## Frontend Audit

Reviewed surfaces:

- Route: `/personalization`.
- API client: `frontend/src/api/personalizationApi.ts`.
- Learning event client: `frontend/src/api/learningEventApi.ts`.
- Page: `frontend/src/pages/PersonalizationPage.tsx`.
- Existing document/question pages integrate learning event calls without blocking old flows.

Frontend behavior:

- Loading, error, empty/new-user, disabled recommendation, feedback, and AI-explanation-unavailable states are present.
- UI does not show internal centroids, raw feature vectors, raw prompts, model secrets, or other users' data.
- Frontend does not compute learner model, mastery, ranking, or bandit outcomes.
- Production build passed with a Vite chunk-size warning.

## Issues

### Critical

No Critical issues found.

### High

No High issues found.

### Medium

| ID | Description | File | Cause | Impact | Fix | Status |
| --- | --- | --- | --- | --- | --- | --- |
| M-01 | Bandit safety filter did not independently enforce the configured recommendation quality threshold. | `backend/app/personalization/algorithms/contextual_bandit.py`, `backend/app/personalization/services/contextual_bandit_service.py` | The bandit path relied on candidate/ranker hard constraints and only rejected negative quality. | A future active/shadow direct call could score a low-quality candidate if the upstream list was malformed. | Added `min_quality_score` to `is_safe_for_bandit` and `select_with_contextual_thompson_sampling`; passed `CANDIDATE_MIN_QUALITY_SCORE` from service; added regression test. | Fixed |
| M-02 | Real personalization data is empty. | `reports/personalization/evaluation-2026-07-23-real.json` | No production learning events, learner states, learning items, recommendation logs, or cluster models are stored yet. | Cannot claim real K-Means quality, learner-model accuracy, recommendation quality, NeuralCD/AKT readiness, or bandit benefit. | Keep evaluation pipeline active; collect real events before presenting effectiveness results. | Not fixed; expected before launch |

### Low

| ID | Description | File | Cause | Impact | Fix | Status |
| --- | --- | --- | --- | --- | --- | --- |
| L-01 | Backend unittest discovery can call Gemini in existing verification tests. | `backend/tests/test_verification_backend.py` | Some tests exercise fallback behavior with real provider availability. | CI can be slower or hit quota; this run saw a handled Gemini 429 but tests passed. | Mock AI providers in those tests in a future hardening pass. | Not fixed |
| L-02 | Frontend production build emits Vite chunk-size warning. | `frontend/dist/assets/index-*.js` | Main JS chunk is about 556 kB after minification. | Build passes, but route-level code splitting would improve load performance. | Add dynamic imports for large routes later. | Not fixed |
| L-03 | No dedicated Playwright/Cypress E2E suite was found. | `frontend/package.json` | Project currently has lint, build, and script-based frontend tests only. | End-to-end browser regressions are not automatically covered. | Add E2E smoke tests for auth, document, question, and personalization flows later. | Not fixed |

## Commands Run

Backend:

```bash
backend/.venv/bin/python -m compileall -q backend/app/personalization backend/scripts/simulate_contextual_bandit.py backend/tests/test_contextual_bandit.py
cd backend && .venv/bin/python -m unittest tests.test_contextual_bandit -v
cd backend && .venv/bin/python -m unittest discover tests -v
backend/.venv/bin/python backend/scripts/migrate_personalization_indexes.py --dry-run
backend/.venv/bin/python backend/scripts/evaluate_personalization_system.py --mode real --output-dir reports/personalization --limit 500
backend/.venv/bin/python backend/scripts/simulate_contextual_bandit.py --output reports/personalization/contextual-bandit-simulation-2026-07-23-synthetic.json
cd backend && .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
curl -sS -i http://127.0.0.1:8000/health
```

Frontend:

```bash
cd frontend && npm run lint
cd frontend && npm run test:chat
cd frontend && npm run build
cd frontend && npm run dev -- --host 127.0.0.1 --port 5173
curl -sS -i http://127.0.0.1:5173/
```

Audit/read-only commands:

```bash
git status --short
rg -n "router\\.(get|post|patch|delete)|Depends\\(get_current_user\\)|current_user|user_id" backend/app/personalization/api backend/app/personalization/services backend/app/personalization/repositories/mongo.py
rg -n "AI|prompt|generate_json|gemini|llm|raw event|email|full_name" backend/app/personalization
rg -n "BANDIT|NEURALCD|AKT|MODEL_VERSION|FEATURE_SCHEMA_VERSION|KMEANS_RANDOM_STATE|random_state|normalization" backend/app/core/config.py backend/app/personalization
rg -n "TODO|FIXME|NotImplemented|pass$|synthetic|fake|dummy|hard.?code" backend/app/personalization backend/scripts docs/personalization frontend/src/pages/PersonalizationPage.tsx frontend/src/api/personalizationApi.ts
rg --files | rg "(playwright|cypress|e2e|vitest|jest|package.json|pytest.ini|pyproject.toml)$"
```

## Test Results

| Check | Result |
| --- | --- |
| Personalization compileall | Passed |
| Focused contextual bandit tests | Passed, 10/10 |
| Full backend unittest discovery | Passed, 191/191 |
| Backend startup | Passed |
| Backend health endpoint | Passed, `200 OK`, `{"status":"ok"}` |
| Frontend lint | Passed |
| Frontend unit/helper tests | Passed |
| Frontend production build | Passed with chunk-size warning |
| Frontend dev startup | Passed |
| Frontend HTTP check | Passed, `200 OK` |
| Migration dry-run | Passed, 46 indexes listed, no writes |
| Evaluation smoke, real mode | Passed, reports exported, metrics are `no_data` |
| Bandit simulation smoke | Passed, synthetic report exported |
| E2E suite | Not run; no Playwright/Cypress suite found |

## Production Readiness

Ready for demo with feature flags:

- Document ownership and existing question generation remain intact.
- Learning event capture and learner-state update services.
- BKT/IRT learner model logic.
- Digital twin endpoints and frontend overview.
- Candidate generator, weighted ranker, re-ranker, recommendation logging.
- Recommendation API with deterministic fallback explanation.
- Evaluation pipeline and synthetic/real report export.

Not production-enabled by default:

- Personalization as a whole.
- Recommendations.
- AI recommendation explanation.
- K-Means active use until real models are trained and reviewed.
- NeuralCD and AKT.
- Contextual bandit active mode.

Recommended next step:

1. Enable personalization in a staging environment.
2. Run migration without dry-run against staging.
3. Collect real learning events from a controlled user group.
4. Train and review K-Means models.
5. Run real evaluation reports.
6. Enable recommendation only after hard-constraint and ownership logs are verified.
7. Keep bandit in shadow mode until reward and safety metrics are stable.
