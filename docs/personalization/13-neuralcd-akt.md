# Prompt 13 - NeuralCD and AKT

## Decision

Neural Cognitive Diagnosis and AKT are not enabled for production in the current project state.

Production learner modeling remains:

- Bayesian Knowledge Tracing.
- Rasch/IRT 1PL.
- Weighted learner state aggregation from previous prompts.

NeuralCD and AKT are implemented only as optional research interfaces and readiness-gated pipelines. They do not replace BKT/IRT.

## Real Data Readiness Audit

Audit command:

```bash
backend/.venv/bin/python backend/scripts/audit_advanced_diagnosis_models.py --output reports/personalization/advanced-diagnosis-readiness-2026-07-23.json
```

Real-data result on `2026-07-23`:

- Users with answered-question interactions: `0`
- Learning items/questions: `0`
- Question-answer interactions: `0`
- Average interactions per user: `0.0`
- Knowledge Components: `0`
- Q-Matrix coverage: `0.0`
- Data sparsity: `1.0`
- Median sequence length: `0.0`
- Max sequence length: `0`
- Train/validation/test split feasible: `false`

Readiness thresholds:

- Minimum users: `100`
- Minimum items: `300`
- Minimum interactions: `5000`
- Minimum interactions per user: `20.0`
- Minimum Knowledge Components: `20`
- Minimum Q-Matrix coverage: `0.8`
- Maximum sparsity: `0.98`
- Minimum sequence length: `10`

Blocking reasons:

- `not_enough_users`
- `not_enough_items`
- `not_enough_interactions`
- `not_enough_interactions_per_user`
- `not_enough_knowledge_components`
- `low_q_matrix_coverage`
- `data_too_sparse`
- `sequence_too_short`
- `train_validation_test_split_not_feasible`

Conclusion: the current project data is not sufficient for production NeuralCD or AKT training.

## Feature Flags

Added flags:

- `NEURALCD_ENABLED=false`
- `AKT_ENABLED=false`

Added model versions:

- `NEURALCD_MODEL_VERSION="v0-research"`
- `AKT_MODEL_VERSION="v0-research"`

Both flags are ineffective when `PERSONALIZATION_ENABLED=false`.

## Implemented Files

- `backend/app/personalization/schemas/advanced_diagnosis.py`
  - Typed readiness audit.
  - Training plan schema.
  - Research experiment report schema.
- `backend/app/personalization/services/advanced_diagnosis_service.py`
  - Data readiness audit.
  - Research-only experiment report.
  - Production gate.
- `backend/app/personalization/algorithms/neural_cognitive_diagnosis.py`
  - NeuralCD-style forward interface.
  - User proficiency.
  - Item difficulty.
  - Item discrimination.
  - Q-Matrix.
  - Monotonicity validation for non-negative discrimination and Q-Matrix weights.
- `backend/app/personalization/algorithms/akt_sequences.py`
  - Interaction sequence builder.
  - Question/skill/correctness/elapsed-time features.
  - Padding mask.
  - Time-ordered per-user split.
  - User-holdout split.
- `backend/scripts/audit_advanced_diagnosis_models.py`
  - CLI readiness audit.
- `backend/tests/test_advanced_diagnosis_models.py`
  - Readiness, NeuralCD, and AKT tests.

## NeuralCD Scope

Current implementation:

- Defines the model interface.
- Validates monotonicity constraints.
- Supports research inference from supplied parameters.
- Does not fit a production checkpoint.
- Does not update learner mastery.
- Does not call AI APIs.

Required before production training:

- Real or licensed research dataset with enough interactions.
- Stable Q-Matrix coverage.
- Train/validation/test split.
- Checkpoint format.
- Calibration/evaluation report.
- Serving fallback to BKT/IRT.

## AKT Scope

Current implementation:

- Builds per-user interaction sequences.
- Sorts interactions by time.
- Produces padding masks.
- Supports correctness and elapsed-time inputs.
- Provides split helpers that avoid future interaction leakage.

Current implementation does not include Transformer training or serving. That should remain a separate research experiment until dataset readiness is satisfied.

## Dataset Plan

Production data is currently insufficient. Suitable research paths:

- Use the project's future real learning events after enough learners, questions, Q-Matrix links, and delayed outcomes exist.
- Or run a separate research experiment on a public knowledge-tracing dataset such as ASSISTments or EdNet after license and schema review.

Research datasets must stay separate from production training unless ownership, consent, schema, and evaluation assumptions are explicitly documented.

## Baseline Comparison Plan

When data exists, compare:

- BKT.
- IRT.
- BKT + IRT.
- NeuralCD.
- AKT.

Metrics:

- AUC.
- Accuracy.
- Log loss.
- Brier score.
- Calibration.
- Training time.
- Inference time.
- Memory.
- Interpretability.

The comparison is currently blocked because the real-data audit found no interaction data.

## Serving Plan

Serving is not enabled.

If readiness passes in a later prompt:

- Load checkpoint once at application startup or via managed model cache.
- Use model version metadata.
- Enforce inference timeout.
- Fall back to BKT/IRT on timeout, missing checkpoint, or invalid output.
- Expose health status without leaking checkpoint internals.
- Never load a model per request.

## AI API Boundary

AI APIs are not used for:

- Training labels.
- Correctness labels.
- Synthetic production interactions.
- Ground-truth changes.
- Accuracy evaluation.

AI may only be used later to explain already-computed metrics or model limitations.

## Limitations and Risks

- Severe overfitting risk with the current zero-data state.
- NeuralCD interpretability depends on Q-Matrix quality.
- AKT needs long enough sequences; short sequences make attention models unstable.
- Sparse user-item matrices can produce misleading metrics.
- Research-dataset results may not transfer to this project's learners or content.
- Synthetic or public-dataset results must not be presented as production performance.
