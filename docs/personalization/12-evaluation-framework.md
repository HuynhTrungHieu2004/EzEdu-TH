# Prompt 12 - Evaluation Framework

## Purpose

This step adds a scientific evaluation framework for the personalization system. It does not fabricate production performance numbers.

When real data is missing or too small, the framework reports `no_data`, `insufficient_data`, or `insufficient_classes`. A synthetic fixture is provided only to validate the pipeline and report export.

## Files

- `backend/app/personalization/evaluation/metrics.py`
  - K-Means metrics.
  - BKT/IRT learner prediction metrics.
  - Recommendation metrics.
  - Baseline comparison.
  - Ablation study.
  - AI explanation checks.
- `backend/app/personalization/evaluation/synthetic.py`
  - Clearly marked synthetic fixture.
- `backend/app/personalization/evaluation/pipeline.py`
  - Runs synthetic or real-data evaluation.
- `backend/app/personalization/evaluation/reporting.py`
  - Exports JSON, CSV, and Markdown.
- `backend/scripts/evaluate_personalization_system.py`
  - CLI entrypoint.
- `backend/tests/test_personalization_evaluation_framework.py`
  - Edge-case tests.

## K-Means Evaluation

Implemented metrics:

- Silhouette Score.
- Davies-Bouldin Index.
- Calinski-Harabasz Score.
- Cluster size distribution.
- Stability across multiple random seeds using Adjusted Rand Index.
- Outlier distance summary: mean, p95, max.
- Cluster interpretability review status.

The framework fits only when enough samples are supplied. It does not reconstruct real training samples from persisted centroids. For real data, if active cluster models exist, the report surfaces stored model metrics as `stored_model_metrics_only`.

## Learner Model Evaluation

BKT/IRT prediction rows are evaluated with:

- Accuracy.
- ROC-AUC when both positive and negative labels exist.
- Log loss.
- Brier score.
- Calibration buckets.
- Per-knowledge-component metrics.
- Cold-start subset metrics.

Rows missing labels or containing invalid predictions are counted and skipped. Partial scores are converted to binary labels with threshold `>= 0.5`.

## Recommendation Evaluation

Offline metrics:

- Precision@K.
- Recall@K.
- NDCG@K.
- Hit Rate@K.
- Coverage.
- Diversity.
- Novelty.
- Repetition rate.
- Prerequisite violation rate.
- Difficulty fit.
- Recommendation acceptance.

Learning metrics:

- Mastery gain.
- Delayed retention.
- Completion rate.
- Reduction in repeated mistakes.
- Time to mastery.

Learning metrics are reported only when the input dataset includes the corresponding fields.

## Baselines

The framework compares:

- `random`
- `popular_item`
- `kmeans_cluster_only`
- `weighted_ranking`
- `weighted_ranking_reranking`

No contextual bandit is implemented in this step.

## Ablation Study

The framework evaluates recommendation sessions for:

- `without_knowledge_graph`
- `without_bkt`
- `without_irt`
- `without_kmeans`
- `without_interest`
- `without_forgetting`
- `without_diversity_reranking`

The ablation runner expects prepared sessions for each variant. It does not infer ablation performance from production logs unless those variant logs are explicitly provided.

## AI Explanation Evaluation

Implemented checks:

- Groundedness.
- Faithfulness to input scores.
- Hallucinated number rate.
- Source validity.
- Explanation relevance.
- Fallback rate.

The hallucinated number check detects numbers in explanations that are not listed in the allowed input numbers. This is a deterministic guard, not a full semantic judge.

## CLI Usage

Synthetic fixture:

```bash
backend/.venv/bin/python backend/scripts/evaluate_personalization_system.py --mode synthetic --output-dir reports/personalization
```

Real data:

```bash
backend/.venv/bin/python backend/scripts/evaluate_personalization_system.py --mode real --output-dir reports/personalization
```

Each run exports:

- JSON.
- CSV.
- Markdown.

## Generated Reports

Generated on local date `2026-07-23`:

- `reports/personalization/evaluation-2026-07-23-synthetic.json`
- `reports/personalization/evaluation-2026-07-23-synthetic.csv`
- `reports/personalization/evaluation-2026-07-23-synthetic.md`
- `reports/personalization/evaluation-2026-07-23-real.json`
- `reports/personalization/evaluation-2026-07-23-real.csv`
- `reports/personalization/evaluation-2026-07-23-real.md`

The synthetic report is marked with:

```json
"is_synthetic": true
```

and includes a notice that the values are for pipeline validation only.

## Real Data Inventory

The real-data run on `2026-07-23` found:

- `learning_events`: 0
- `question_answered_events`: 0
- `learner_profiles`: 0
- `learner_knowledge_states`: 0
- `learning_items`: 0
- `recommendation_logs`: 0
- `cluster_models`: 0

Therefore, no real performance conclusion is supported yet.

## Test Coverage

Covered cases:

- Empty dataset.
- One-class dataset.
- Missing labels.
- Invalid prediction.
- No recommendation.
- Too little K-Means data.
- AI hallucinated number detection.
- Synthetic data correctly marked.

## Limitations

- Real recommendation relevance labels are not inferred from clicks.
- Real learning outcomes require delayed post-event measurements.
- Cluster interpretability still requires human review.
- ROC-AUC requires both positive and negative labels.
- Synthetic metrics must not be reported as actual model quality.
