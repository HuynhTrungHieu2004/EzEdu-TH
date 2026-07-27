# Personalization System README

This guide explains how to run, operate, evaluate, and safely roll back the personalization system.

## Architecture

```text
Documents / questions
  -> parsed chunks and embeddings
  -> Knowledge Graph + Q-Matrix
  -> Learning Events
  -> BKT / IRT learner model
  -> Learner Digital Twin
  -> Candidate Generator
  -> Weighted Ranker + Re-ranker
  -> Recommendation API
  -> Optional AI explanation
  -> Frontend personalization page

Advanced research paths:
  -> K-Means offline training and active model prediction
  -> NeuralCD / AKT research experiments
  -> Contextual bandit shadow simulation and policy logging
```

Backend layers:

- `api`: FastAPI routes, authentication boundary, request/response schemas.
- `services`: orchestration, ownership-filtered workflow, cache invalidation.
- `repositories`: MongoDB access and user-scoped learner reads.
- `algorithms`: deterministic math and ML logic; no database, AI provider, or HTTP calls.
- `schemas`: Pydantic validation for config, data models, events, learner state, recommendations, evaluation, and bandit.
- `jobs`: offline model training jobs.
- `evaluation`: metrics, synthetic fixtures, real-data pipeline, report export.

Frontend layers:

- `frontend/src/pages/PersonalizationPage.tsx`: personal learning overview, knowledge states, goals, and recommendations.
- `frontend/src/api/personalizationApi.ts`: personalization API client.
- `frontend/src/api/learningEventApi.ts`: non-blocking learning event client.
- `frontend/src/utils/personalizationUi.ts`: UI-only formatting helpers.

## Install

Backend:

```bash
cd backend
.venv/bin/python -m pip install -r requirements.txt
```

Frontend:

```bash
cd frontend
npm install
```

## Environment Variables

Recommended defaults keep unfinished or advanced behavior disabled:

```env
PERSONALIZATION_ENABLED=false
KNOWLEDGE_GRAPH_ENABLED=false
LEARNER_MODEL_ENABLED=false
RECOMMENDATION_ENABLED=false
AI_RECOMMENDATION_EXPLANATION_ENABLED=false
BANDIT_ENABLED=false
BANDIT_SHADOW_MODE_ENABLED=false
BANDIT_KILL_SWITCH=true
NEURALCD_ENABLED=false
AKT_ENABLED=false

FEATURE_SCHEMA_VERSION=v1
KNOWLEDGE_MODEL_VERSION=v0
LEARNER_MODEL_VERSION=v0
CLUSTERING_MODEL_VERSION=v0
RANKING_MODEL_VERSION=v0
BANDIT_POLICY_VERSION=v0
NEURALCD_MODEL_VERSION=v0-research
AKT_MODEL_VERSION=v0-research
```

Enable only in staging first:

```env
PERSONALIZATION_ENABLED=true
KNOWLEDGE_GRAPH_ENABLED=true
LEARNER_MODEL_ENABLED=true
RECOMMENDATION_ENABLED=true
```

Enable AI explanations only after recommendation quality is stable:

```env
AI_RECOMMENDATION_EXPLANATION_ENABLED=true
```

Keep bandit production disabled unless safety metrics justify activation:

```env
BANDIT_KILL_SWITCH=true
BANDIT_ENABLED=false
BANDIT_SHADOW_MODE_ENABLED=false
```

## Migration

Dry-run:

```bash
backend/.venv/bin/python backend/scripts/migrate_personalization_indexes.py --dry-run
```

Apply indexes:

```bash
backend/.venv/bin/python backend/scripts/migrate_personalization_indexes.py
```

Production protection:

```bash
backend/.venv/bin/python backend/scripts/migrate_personalization_indexes.py --force-production
```

The migration creates indexes only. It does not delete old data.

## Run Backend

```bash
cd backend
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Health check:

```bash
curl -sS http://127.0.0.1:8000/health
```

Expected:

```json
{"status":"ok"}
```

## Run Frontend

```bash
cd frontend
npm run dev -- --host 127.0.0.1 --port 5173
```

Open:

```text
http://127.0.0.1:5173/
```

Personalization route:

```text
/personalization
```

## Train K-Means

Train all cluster types:

```bash
backend/.venv/bin/python backend/scripts/train_kmeans_clusters.py
```

Train one cluster type:

```bash
backend/.venv/bin/python backend/scripts/train_kmeans_clusters.py --cluster-type content
backend/.venv/bin/python backend/scripts/train_kmeans_clusters.py --cluster-type question
backend/.venv/bin/python backend/scripts/train_kmeans_clusters.py --cluster-type learner_ability
backend/.venv/bin/python backend/scripts/train_kmeans_clusters.py --cluster-type learner_behavior
backend/.venv/bin/python backend/scripts/train_kmeans_clusters.py --cluster-type learner_interest
```

K-Means fitting is offline. Runtime requests should use the active stored model for prediction.

## Run Learner Model

Learner state updates are triggered from valid `question_answered` learning events:

```text
POST /api/v1/personalization/events
```

Rules:

- `user_id` comes from authentication.
- BKT and IRT update mastery and theta.
- AI is not used for mastery, ability, learner level, or confidence.
- Duplicate processed events are ignored for the same learner model version.

Useful read endpoints:

```text
GET /api/v1/personalization/me
GET /api/v1/personalization/me/knowledge
GET /api/v1/personalization/me/progress
GET /api/v1/personalization/learner/summary
```

## Run Evaluation

Real-data evaluation:

```bash
backend/.venv/bin/python backend/scripts/evaluate_personalization_system.py --mode real --output-dir reports/personalization --limit 500
```

Synthetic fixture evaluation:

```bash
backend/.venv/bin/python backend/scripts/evaluate_personalization_system.py --mode synthetic --output-dir reports/personalization
```

Synthetic reports are for pipeline validation only. Do not present synthetic results as real system performance.

## Enable Recommendation

Recommended staging flags:

```env
PERSONALIZATION_ENABLED=true
LEARNER_MODEL_ENABLED=true
RECOMMENDATION_ENABLED=true
AI_RECOMMENDATION_EXPLANATION_ENABLED=false
BANDIT_ENABLED=false
BANDIT_SHADOW_MODE_ENABLED=false
BANDIT_KILL_SWITCH=true
```

API:

```text
GET /api/v1/personalization/recommendations/me
POST /api/v1/personalization/recommendations/me/feedback
GET /api/v1/personalization/recommendations/me/history
```

Recommendation decisions are made by the candidate generator, weighted ranker, and re-ranker before any AI explanation is requested.

## Enable Or Disable AI Explanation

Enable:

```env
AI_RECOMMENDATION_EXPLANATION_ENABLED=true
```

Disable:

```env
AI_RECOMMENDATION_EXPLANATION_ENABLED=false
```

When disabled or when the AI provider fails, the API returns deterministic fallback explanations from reason codes.

## Run Bandit Shadow Mode

Shadow mode lets the ranker still decide what users see while the bandit logs what it would have selected.

```env
PERSONALIZATION_ENABLED=true
RECOMMENDATION_ENABLED=true
BANDIT_KILL_SWITCH=false
BANDIT_ENABLED=false
BANDIT_SHADOW_MODE_ENABLED=true
```

Simulation smoke test:

```bash
backend/.venv/bin/python backend/scripts/simulate_contextual_bandit.py --output reports/personalization/contextual-bandit-simulation-2026-07-23-synthetic.json
```

Do not enable active bandit mode until shadow logs show stable reward, no safety violations, acceptable coverage, and no prerequisite or quality breaches.

## Rollback

K-Means:

- Keep one active model per cluster type.
- Roll back by activating the previously reviewed `cluster_models` version through the repository/admin operation.
- Do not retrain inside request handling.
- If no active model is safe, disable cluster-dependent recommendation features and rely on learner profile and ranker scores.

Bandit:

- Default emergency rollback is the kill switch:

```env
BANDIT_KILL_SWITCH=true
BANDIT_ENABLED=false
BANDIT_SHADOW_MODE_ENABLED=false
```

- Policy rollback is supported through the bandit policy repository by marking a previous policy version active.
- Weighted ranking remains the fallback.

Recommendation:

```env
RECOMMENDATION_ENABLED=false
```

AI explanation:

```env
AI_RECOMMENDATION_EXPLANATION_ENABLED=false
```

Full personalization:

```env
PERSONALIZATION_ENABLED=false
```

## Test Commands

Backend:

```bash
backend/.venv/bin/python -m compileall -q backend/app/personalization backend/scripts/simulate_contextual_bandit.py backend/tests/test_contextual_bandit.py
cd backend && .venv/bin/python -m unittest discover tests -v
```

Frontend:

```bash
cd frontend && npm run lint
cd frontend && npm run test:chat
cd frontend && npm run build
```

Migration:

```bash
backend/.venv/bin/python backend/scripts/migrate_personalization_indexes.py --dry-run
```

Evaluation:

```bash
backend/.venv/bin/python backend/scripts/evaluate_personalization_system.py --mode real --output-dir reports/personalization --limit 500
```

## Demo Checklist

Before demo:

- Run migration in the target environment.
- Confirm auth works.
- Confirm document ownership works.
- Confirm `/personalization` loads for a logged-in user.
- Submit or simulate a valid question answer through the real UI.
- Confirm learning event storage.
- Confirm learner state update.
- Confirm recommendation endpoint returns either safe recommendations or a clear empty state.
- Keep AI explanation and bandit disabled unless explicitly demonstrating fallback/shadow behavior.
