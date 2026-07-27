# 06 - Multi-Layer K-Means Clustering

## Scope

Prompt 6 implements five separate K-Means model families:

1. content clustering.
2. question clustering.
3. learner ability clustering.
4. learner behavior clustering.
5. learner interest clustering.

There is no shared K-Means model across these data types. Each model has its own feature schema, normalization parameters, centroids, metrics, and active version.

## Files

```text
backend/app/personalization/algorithms/kmeans_clustering.py
backend/app/personalization/services/clustering_service.py
backend/app/personalization/jobs/kmeans_training_job.py
backend/scripts/train_kmeans_clusters.py
backend/tests/test_kmeans_clustering.py
```

## Feature Schemas

Identifier-like fields are forbidden in feature samples:

```text
user_id, id, _id, email, full_name, document_id, item_id, question_id
```

These fields may be used internally to aggregate data, but they are removed before model fitting.

### Content

Feature schema:

- `semantic_embedding`
- `difficulty`
- `bloom_level_encoded`
- `estimated_duration_seconds`
- `topic`

Embedding features are L2-normalized and weighted. Numeric and categorical features are scaled separately.

### Question

Feature schema:

- `semantic_embedding`
- `difficulty`
- `bloom_level_encoded`
- `average_correctness`
- `average_response_time_ms`
- `discrimination`
- `required_knowledge_component_count`

Question performance features come from historical `question_answered` events when available.

### Learner Ability

Feature schema:

- `global_theta`
- `average_mastery`
- `recent_accuracy`
- `solved_difficulty`
- `prerequisite_gaps`

This model uses learner-state aggregates only. It does not include identifiers.

### Learner Behavior

Feature schema:

- `average_response_time_ms`
- `completion_rate`
- `hint_rate`
- `answer_change_rate`
- `skip_rate`
- `session_consistency`

These features describe interaction behavior, not knowledge correctness alone.

### Learner Interest

Feature schema:

- `topic_interaction_distribution`
- `content_type_preference`
- `document_category_preference`
- `recommendation_click_distribution`

Cold-start preferences can later fill these distributions with low confidence when explicit goals/preferences are collected.

## Normalization

The implementation never concatenates raw numeric values directly with embeddings.

Process:

1. Validate no identifier-like fields exist in samples.
2. Extract semantic embedding if the schema has one.
3. L2-normalize embeddings.
4. Extract numeric and vector-valued numeric features.
5. Impute missing numeric values with training-set means.
6. Standardize numeric features with training-set mean/std.
7. One-hot encode configured categorical fields using training-set categories.
8. Apply explicit weights:
   - embedding weight default: `0.7`
   - numeric/categorical weight default: `0.3`
9. Persist normalization parameters in `cluster_models.normalization_parameters`.

Prediction applies the saved normalization parameters from the active model.

## K Selection

K is not hard-coded.

Config:

```text
KMEANS_MIN_K=2
KMEANS_MAX_K=8
KMEANS_MIN_CLUSTER_SIZE=2
KMEANS_MIN_SAMPLES=8
```

Training tries K in the configured range and computes:

- Silhouette Score.
- Davies-Bouldin Index.
- Calinski-Harabasz Score.
- cluster sizes.

Candidates that violate minimum cluster size are rejected.

Selection rule:

```text
selection_score =
  0.6 * silhouette
  + 0.2 * normalized_inverse_davies_bouldin
  + 0.2 * normalized_calinski_harabasz
```

The model with the highest `selection_score` is selected. If no candidate is valid, no model is fit.

## Stability

Config:

```text
KMEANS_RANDOM_STATE=42
KMEANS_N_INIT=10
KMEANS_MAX_ITER=300
```

Saved model fields:

- `cluster_type`
- `version`
- `feature_schema_version`
- `feature_names`
- `normalization_parameters`
- `number_of_clusters`
- `centroids`
- `metrics`
- `training_sample_count`
- `random_state`
- `status`
- `trained_at`
- `activated_at`
- `interpretation`
- `provenance`

## Fit Offline, Predict Online

Offline fit:

```text
backend/scripts/train_kmeans_clusters.py
```

Examples:

```bash
python scripts/train_kmeans_clusters.py
python scripts/train_kmeans_clusters.py --cluster-type content
python scripts/train_kmeans_clusters.py --cluster-type learner_behavior
```

Service functions:

- `fit_cluster_model(cluster_type, samples)`
- `predict_cluster(cluster_type, sample)`
- `rollback_cluster_model(cluster_type, target_version)`

Prediction:

- loads only the active model for the cluster type.
- applies saved normalization parameters.
- computes nearest centroid.
- computes distance to centroid.
- does not refit.

Only one model is active per `cluster_type`. Activating a model retires any previous active model of that type.

## Active Model and Rollback

Active model rule:

```text
cluster_type + status=active
```

Rollback calls `rollback_cluster_model(cluster_type, target_version)`, which retires the current active model and activates the target version.

## AI Interpretation

AI interpretation is optional and runs only after K-Means completes.

Process:

1. Build anonymized cluster summaries.
2. Send only aggregate/statistical data to AI.
3. Validate returned JSON.
4. Store interpretation under `cluster_models.interpretation`.

AI may suggest:

- cluster name.
- cluster description.
- characteristics.
- educational suggestions.

AI output never changes:

- feature vectors.
- normalization.
- K selection.
- centroid positions.
- predictions.

If AI interpretation fails, clustering still succeeds and stores:

```text
interpretation.status = failed
```

## Cold Start

If no active model exists, prediction returns:

```text
provisional = true
confidence = 0.0
```

For new learners with insufficient data, callers should use direct learner profile/preferences and mark any cluster assignment as provisional. The system does not force a hard label from insufficient evidence.

## Outliers

Prediction computes distance to nearest centroid.

Outlier threshold:

```text
mean_training_distance
+ KMEANS_OUTLIER_DISTANCE_STD_MULTIPLIER * std_training_distance
```

Default multiplier:

```text
2.5
```

If a sample is too far:

- `outlier=true`
- `cluster_id=null`
- confidence is low.
- caller should use the individual profile directly.

Clusters are not treated as fixed learner identity.

## Tests

Covered:

- unscaled numeric data is standardized.
- too few samples skip fitting.
- degenerate/empty cluster candidates skip fitting.
- missing numeric feature is imputed.
- reproducibility with fixed random state.
- model version is saved.
- active model behavior.
- rollback.
- cold start prediction.
- outlier handling.
- no `user_id`/identifier leakage into features.
- AI interpretation failure does not break clustering.
- all five cluster types have separate feature schemas.

## Limitations

- Semantic embeddings are used only when samples contain embedding vectors.
- Topic/category encoding is basic one-hot from training categories.
- Learner interest clustering quality depends on future recommendation/click data.
- Cluster interpretation needs human review before product copy is shown to learners.
- K-Means clusters are operational groupings, not a learner's fixed nature or identity.
