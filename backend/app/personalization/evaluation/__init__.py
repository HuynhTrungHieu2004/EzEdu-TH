"""Evaluation helpers for personalization quality checks."""

from app.personalization.evaluation.metrics import (
    compare_recommendation_baselines,
    evaluate_ai_explanations,
    evaluate_kmeans,
    evaluate_learner_models,
    evaluate_recommendations,
    run_ablation_study,
)
from app.personalization.evaluation.pipeline import evaluate_dataset, run_real_evaluation, run_synthetic_evaluation
from app.personalization.evaluation.synthetic import build_synthetic_evaluation_dataset

__all__ = [
    "build_synthetic_evaluation_dataset",
    "compare_recommendation_baselines",
    "evaluate_ai_explanations",
    "evaluate_dataset",
    "evaluate_kmeans",
    "evaluate_learner_models",
    "evaluate_recommendations",
    "run_ablation_study",
    "run_real_evaluation",
    "run_synthetic_evaluation",
]
