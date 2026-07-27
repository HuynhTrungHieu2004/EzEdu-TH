# Personalization Evaluation Report

- Generated at: `2026-07-22T23:21:27.437540+00:00`
- Dataset type: `synthetic`

> This report uses synthetic fixture data for pipeline validation only. Do not present these values as real system performance.

## Data Inventory

- `is_synthetic`: `True`
- `kmeans_sample_groups`: `{'content': 12}`
- `learner_prediction_rows`: `6`
- `recommendation_sessions`: `2`
- `ai_explanation_rows`: `3`

## Kmeans

```json
{
  "content": {
    "status": "ok",
    "sample_count": 12,
    "feature_count": 8,
    "feature_names": [
      "semantic_embedding_0",
      "semantic_embedding_1",
      "semantic_embedding_2",
      "difficulty",
      "bloom_level_encoded",
      "estimated_duration_seconds",
      "topic=advanced",
      "topic=foundation"
    ],
    "selected_k": 2,
    "silhouette_score": 0.9519697314654508,
    "davies_bouldin_index": 0.06179335522823484,
    "calinski_harabasz_score": 2010.5925418114768,
    "cluster_size_distribution": {
      "0": 6,
      "1": 6
    },
    "stability": {
      "seeds": [
        13,
        29,
        47
      ],
      "adjusted_rand_index_mean": 1.0,
      "pairwise_adjusted_rand_index": [
        1.0,
        1.0,
        1.0
      ]
    },
    "outlier_distance": {
      "mean": 0.05138742312339319,
      "p95": 0.09159151716374468,
      "max": 0.0915915171637447
    },
    "cluster_interpretability_review": {
      "status": "requires_human_review",
      "message": "Review representative samples and AI-proposed labels before using cluster names in product UI."
    },
    "selection_metrics": {
      "selected_k": 2,
      "silhouette_score": 0.9519697314654508,
      "davies_bouldin_index": 0.06179335522823484,
      "calinski_harabasz_score": 2010.5925418114768,
      "cluster_sizes": [
        6,
        6
      ],
      "candidate_metrics": [
        {
          "k": 2,
          "silhouette_score": 0.9519697314654508,
          "davies_bouldin_index": 0.06179335522823484,
          "calinski_harabasz_score": 2010.5925418114768,
          "selection_score": 0.8718959708405503,
          "cluster_sizes": [
            6,
            6
          ]
        },
        {
          "k": 3,
          "silhouette_score": 0.7342258656803581,
          "davies_bouldin_index": 0.3110107952247483,
          "calinski_harabasz_score": 1616.3324638851282,
          "selection_score": 0.5207149616943838,
          "cluster_sizes": [
            6,
            3,
            3
          ]
        },
        {
          "k": 4,
          "silhouette_score": 0.5138888888888875,
          "davies_bouldin_index": 0.44444448638973133,
          "calinski_harabasz_score": 2354.6912987800565,
          "selection_score": 0.5129740677165132,
          "cluster_sizes": [
            3,
            3,
            3,
            3
          ]
        },
        {
          "k": 5,
          "silhouette_score": 0.4680555555555625,
          "davies_bouldin_index": 0.4777777985517629,
          "calinski_harabasz_score": 2399.2614734464164,
          "selection_score": 0.4808333333333375,
          "cluster_sizes": [
            2,
            3,
            2,
            3,
            2
          ]
        }
      ]
    }
  }
}
```

## Learner Model

```json
{
  "bkt_irt": {
    "status": "ok",
    "sample_count": 6,
    "skipped_missing_label": 0,
    "skipped_invalid_prediction": 0,
    "accuracy": 0.6666666666666666,
    "roc_auc": {
      "status": "ok",
      "value": 0.888888888888889
    },
    "log_loss": 0.4809879349586312,
    "brier_score": 0.15583333333333335,
    "calibration_buckets": [
      {
        "bucket": "0.1-0.2",
        "count": 1,
        "avg_predicted": 0.19,
        "avg_actual": 0.0
      },
      {
        "bucket": "0.2-0.3",
        "count": 1,
        "avg_predicted": 0.28,
        "avg_actual": 0.0
      },
      {
        "bucket": "0.4-0.5",
        "count": 1,
        "avg_predicted": 0.44,
        "avg_actual": 1.0
      },
      {
        "bucket": "0.6-0.7",
        "count": 2,
        "avg_predicted": 0.645,
        "avg_actual": 0.5
      },
      {
        "bucket": "0.8-0.9",
        "count": 1,
        "avg_predicted": 0.82,
        "avg_actual": 1.0
      }
    ],
    "per_knowledge_component": {
      "kc-algebra": {
        "status": "ok",
        "sample_count": 2,
        "skipped_missing_label": 0,
        "skipped_invalid_prediction": 0,
        "accuracy": 1.0,
        "roc_auc": {
          "status": "insufficient_classes",
          "value": null
        },
        "log_loss": 0.2920567097679115,
        "brier_score": 0.06739999999999999,
        "calibration_buckets": [
          {
            "bucket": "0.6-0.7",
            "count": 1,
            "avg_predicted": 0.68,
            "avg_actual": 1.0
          },
          {
            "bucket": "0.8-0.9",
            "count": 1,
            "avg_predicted": 0.82,
            "avg_actual": 1.0
          }
        ]
      },
      "kc-geometry": {
        "status": "ok",
        "sample_count": 2,
        "skipped_missing_label": 0,
        "skipped_invalid_prediction": 0,
        "accuracy": 0.5,
        "roc_auc": {
          "status": "insufficient_classes",
          "value": null
        },
        "log_loss": 0.6350563034152406,
        "brier_score": 0.22525,
        "calibration_buckets": [
          {
            "bucket": "0.2-0.3",
            "count": 1,
            "avg_predicted": 0.28,
            "avg_actual": 0.0
          },
          {
            "bucket": "0.6-0.7",
            "count": 1,
            "avg_predicted": 0.61,
            "avg_actual": 0.0
          }
        ]
      },
      "kc-probability": {
        "status": "ok",
        "sample_count": 2,
        "skipped_missing_label": 0,
        "skipped_invalid_prediction": 0,
        "accuracy": 0.5,
        "roc_auc": {
          "status": "ok",
          "value": 1.0
        },
        "log_loss": 0.5158507916927414,
        "brier_score": 0.17485000000000003,
        "calibration_buckets": [
          {
            "bucket": "0.1-0.2",
            "count": 1,
            "avg_predicted": 0.19,
            "avg_actual": 0.0
          },
          {
            "bucket": "0.4-0.5",
            "count": 1,
            "avg_predicted": 0.44,
            "avg_actual": 1.0
          }
        ]
      }
    },
    "cold_start_performance": {
      "status": "ok",
      "sample_count": 2,
      "skipped_missing_label": 0,
      "skipped_invalid_prediction": 0,
      "accuracy": 0.5,
      "roc_auc": {
        "status": "insufficient_classes",
        "value": null
      },
      "log_loss": 0.6350563034152406,
      "brier_score": 0.22525,
      "calibration_buckets": [
        {
          "bucket": "0.2-0.3",
          "count": 1,
          "avg_predicted": 0.28,
          "avg_actual": 0.0
        },
        {
          "bucket": "0.6-0.7",
          "count": 1,
          "avg_predicted": 0.61,
          "avg_actual": 0.0
        }
      ]
    }
  },
  "notes": [
    "ROC-AUC is reported only when both positive and negative labels exist.",
    "Partial scores are converted to binary labels with threshold >= 0.5."
  ]
}
```

## Recommendations

```json
{
  "status": "ok",
  "session_count": 2,
  "precision@5": 0.41666666666666663,
  "recall@5": 1.0,
  "ndcg@5": 0.7753252713598225,
  "hit_rate@5": 1.0,
  "coverage": 0.75,
  "diversity": 0.9583333333333333,
  "novelty": 0.6714285714285714,
  "repetition_rate": 0.0,
  "prerequisite_violation_rate": 0.0,
  "difficulty_fit": 0.7142857142857143,
  "recommendation_acceptance": 0.29166666666666663,
  "learning_metrics": {
    "mastery_gain": 0.055,
    "delayed_retention": 0.685,
    "completion_rate": 0.71,
    "reduction_in_repeated_mistakes": 0.1,
    "time_to_mastery": 4.0
  }
}
```

## Baseline Comparison

```json
{
  "random": {
    "status": "ok",
    "session_count": 1,
    "precision@5": 0.5,
    "recall@5": 1.0,
    "ndcg@5": 0.5706417189553201,
    "hit_rate@5": 1.0,
    "coverage": 0.5,
    "diversity": 0.9166666666666666,
    "novelty": 0.65,
    "repetition_rate": 0.0,
    "prerequisite_violation_rate": 0.0,
    "difficulty_fit": 0.75,
    "recommendation_acceptance": 0.25,
    "learning_metrics": {
      "mastery_gain": 0.08,
      "delayed_retention": 0.71,
      "completion_rate": 0.75,
      "reduction_in_repeated_mistakes": 0.1,
      "time_to_mastery": 4.0
    }
  },
  "popular_item": {
    "status": "ok",
    "session_count": 1,
    "precision@5": 0.5,
    "recall@5": 1.0,
    "ndcg@5": 0.5706417189553201,
    "hit_rate@5": 1.0,
    "coverage": 0.5,
    "diversity": 0.9166666666666666,
    "novelty": 0.65,
    "repetition_rate": 0.0,
    "prerequisite_violation_rate": 0.0,
    "difficulty_fit": 0.75,
    "recommendation_acceptance": 0.25,
    "learning_metrics": {
      "mastery_gain": 0.08,
      "delayed_retention": 0.71,
      "completion_rate": 0.75,
      "reduction_in_repeated_mistakes": 0.1,
      "time_to_mastery": 4.0
    }
  },
  "kmeans_cluster_only": {
    "status": "ok",
    "session_count": 1,
    "precision@5": 0.5,
    "recall@5": 1.0,
    "ndcg@5": 0.8772153153380493,
    "hit_rate@5": 1.0,
    "coverage": 0.5,
    "diversity": 0.9166666666666666,
    "novelty": 0.65,
    "repetition_rate": 0.0,
    "prerequisite_violation_rate": 0.0,
    "difficulty_fit": 0.75,
    "recommendation_acceptance": 0.25,
    "learning_metrics": {
      "mastery_gain": 0.08,
      "delayed_retention": 0.71,
      "completion_rate": 0.75,
      "reduction_in_repeated_mistakes": 0.1,
      "time_to_mastery": 4.0
    }
  },
  "weighted_ranking": {
    "status": "ok",
    "session_count": 2,
    "precision@5": 0.41666666666666663,
    "recall@5": 1.0,
    "ndcg@5": 0.7753252713598225,
    "hit_rate@5": 1.0,
    "coverage": 0.75,
    "diversity": 0.9583333333333333,
    "novelty": 0.6714285714285714,
    "repetition_rate": 0.0,
    "prerequisite_violation_rate": 0.0,
    "difficulty_fit": 0.7142857142857143,
    "recommendation_acceptance": 0.29166666666666663,
    "learning_metrics": {
      "mastery_gain": 0.055,
      "delayed_retention": 0.685,
      "completion_rate": 0.71,
      "reduction_in_repeated_mistakes": 0.1,
      "time_to_mastery": 4.0
    }
  },
  "weighted_ranking_reranking": {
    "status": "ok",
    "session_count": 2,
    "precision@5": 0.41666666666666663,
    "recall@5": 1.0,
    "ndcg@5": 0.7753252713598225,
    "hit_rate@5": 1.0,
    "coverage": 0.75,
    "diversity": 0.9583333333333333,
    "novelty": 0.6714285714285714,
    "repetition_rate": 0.0,
    "prerequisite_violation_rate": 0.0,
    "difficulty_fit": 0.7142857142857143,
    "recommendation_acceptance": 0.29166666666666663,
    "learning_metrics": {
      "mastery_gain": 0.055,
      "delayed_retention": 0.685,
      "completion_rate": 0.71,
      "reduction_in_repeated_mistakes": 0.1,
      "time_to_mastery": 4.0
    }
  }
}
```

## Ablation Study

```json
{
  "without_knowledge_graph": {
    "status": "ok",
    "session_count": 1,
    "precision@5": 0.5,
    "recall@5": 1.0,
    "ndcg@5": 0.9197207891481876,
    "hit_rate@5": 1.0,
    "coverage": 0.5,
    "diversity": 0.9166666666666666,
    "novelty": 0.65,
    "repetition_rate": 0.0,
    "prerequisite_violation_rate": 0.25,
    "difficulty_fit": 0.75,
    "recommendation_acceptance": 0.25,
    "learning_metrics": {
      "mastery_gain": 0.08,
      "delayed_retention": 0.71,
      "completion_rate": 0.75,
      "reduction_in_repeated_mistakes": 0.1,
      "time_to_mastery": 4.0
    }
  },
  "without_bkt": {
    "status": "ok",
    "session_count": 1,
    "precision@5": 0.5,
    "recall@5": 1.0,
    "ndcg@5": 0.6509209298071326,
    "hit_rate@5": 1.0,
    "coverage": 0.5,
    "diversity": 0.9166666666666666,
    "novelty": 0.65,
    "repetition_rate": 0.0,
    "prerequisite_violation_rate": 0.0,
    "difficulty_fit": 0.75,
    "recommendation_acceptance": 0.25,
    "learning_metrics": {
      "mastery_gain": 0.08,
      "delayed_retention": 0.71,
      "completion_rate": 0.75,
      "reduction_in_repeated_mistakes": 0.1,
      "time_to_mastery": 4.0
    }
  },
  "without_irt": {
    "status": "ok",
    "session_count": 1,
    "precision@5": 0.5,
    "recall@5": 1.0,
    "ndcg@5": 0.6509209298071326,
    "hit_rate@5": 1.0,
    "coverage": 0.5,
    "diversity": 0.9166666666666666,
    "novelty": 0.65,
    "repetition_rate": 0.0,
    "prerequisite_violation_rate": 0.0,
    "difficulty_fit": 0.75,
    "recommendation_acceptance": 0.25,
    "learning_metrics": {
      "mastery_gain": 0.08,
      "delayed_retention": 0.71,
      "completion_rate": 0.75,
      "reduction_in_repeated_mistakes": 0.1,
      "time_to_mastery": 4.0
    }
  },
  "without_kmeans": {
    "status": "ok",
    "session_count": 1,
    "precision@5": 0.5,
    "recall@5": 1.0,
    "ndcg@5": 0.9197207891481876,
    "hit_rate@5": 1.0,
    "coverage": 0.5,
    "diversity": 0.9166666666666666,
    "novelty": 0.65,
    "repetition_rate": 0.0,
    "prerequisite_violation_rate": 0.0,
    "difficulty_fit": 0.75,
    "recommendation_acceptance": 0.25,
    "learning_metrics": {
      "mastery_gain": 0.08,
      "delayed_retention": 0.71,
      "completion_rate": 0.75,
      "reduction_in_repeated_mistakes": 0.1,
      "time_to_mastery": 4.0
    }
  },
  "without_interest": {
    "status": "ok",
    "session_count": 1,
    "precision@5": 0.3333333333333333,
    "recall@5": 1.0,
    "ndcg@5": 0.5,
    "hit_rate@5": 1.0,
    "coverage": 0.375,
    "diversity": 1.0,
    "novelty": 0.7,
    "repetition_rate": 0.0,
    "prerequisite_violation_rate": 0.0,
    "difficulty_fit": 0.6666666666666666,
    "recommendation_acceptance": 0.3333333333333333,
    "learning_metrics": {
      "mastery_gain": 0.03,
      "delayed_retention": 0.66,
      "completion_rate": 0.67,
      "reduction_in_repeated_mistakes": 0.1,
      "time_to_mastery": 4.0
    }
  },
  "without_forgetting": {
    "status": "ok",
    "session_count": 1,
    "precision@5": 0.3333333333333333,
    "recall@5": 1.0,
    "ndcg@5": 0.5,
    "hit_rate@5": 1.0,
    "coverage": 0.375,
    "diversity": 1.0,
    "novelty": 0.7,
    "repetition_rate": 0.0,
    "prerequisite_violation_rate": 0.0,
    "difficulty_fit": 0.6666666666666666,
    "recommendation_acceptance": 0.3333333333333333,
    "learning_metrics": {
      "mastery_gain": 0.03,
      "delayed_retention": 0.66,
      "completion_rate": 0.67,
      "reduction_in_repeated_mistakes": 0.1,
      "time_to_mastery": 4.0
    }
  },
  "without_diversity_reranking": {
    "status": "ok",
    "session_count": 1,
    "precision@5": 0.5,
    "recall@5": 1.0,
    "ndcg@5": 0.9197207891481876,
    "hit_rate@5": 1.0,
    "coverage": 0.5,
    "diversity": 0.0,
    "novelty": 0.65,
    "repetition_rate": 0.0,
    "prerequisite_violation_rate": 0.0,
    "difficulty_fit": 0.75,
    "recommendation_acceptance": 0.25,
    "learning_metrics": {
      "mastery_gain": 0.08,
      "delayed_retention": 0.71,
      "completion_rate": 0.75,
      "reduction_in_repeated_mistakes": 0.1,
      "time_to_mastery": 4.0
    }
  }
}
```

## Ai Explanations

```json
{
  "status": "ok",
  "sample_count": 3,
  "groundedness": 0.6666666666666666,
  "faithfulness_to_input_scores": 0.6666666666666666,
  "hallucinated_number_rate": 0.3333333333333333,
  "source_validity": 1.0,
  "explanation_relevance": 0.6666666666666666,
  "fallback_rate": 0.3333333333333333
}
```
