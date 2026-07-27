"""Pure algorithm layer for BKT, IRT, clustering, and ranking logic.

Modules in this package must not call AI providers, HTTP clients, or MongoDB.
"""

from app.personalization.algorithms.bkt import BKTParameters, bkt_update
from app.personalization.algorithms.irt import (
    IRTParameters,
    rasch_probability,
    uncertainty_from_attempts,
    update_beta,
    update_theta,
)
from app.personalization.algorithms.learner_level import infer_learner_level
from app.personalization.algorithms.kmeans_clustering import (
    FEATURE_SCHEMAS,
    KMeansTrainingError,
    build_feature_matrix,
    choose_k_and_fit,
    nearest_centroid,
)
from app.personalization.algorithms.neural_cognitive_diagnosis import (
    NeuralCDModelError,
    NeuralCDParameters,
    neuralcd_predict_probability,
    validate_monotonicity,
)
from app.personalization.algorithms.akt_sequences import (
    AKTSequenceBatch,
    build_akt_sequences,
    split_interactions_without_future_leakage,
)
from app.personalization.algorithms.contextual_bandit import (
    BanditError,
    ThompsonSamplingConfig,
    build_bandit_context,
    compute_bandit_reward,
    select_with_contextual_thompson_sampling,
    update_linear_posterior,
)

__all__ = [
    "BKTParameters",
    "IRTParameters",
    "FEATURE_SCHEMAS",
    "KMeansTrainingError",
    "NeuralCDModelError",
    "NeuralCDParameters",
    "AKTSequenceBatch",
    "BanditError",
    "ThompsonSamplingConfig",
    "build_bandit_context",
    "bkt_update",
    "build_feature_matrix",
    "build_akt_sequences",
    "compute_bandit_reward",
    "choose_k_and_fit",
    "infer_learner_level",
    "nearest_centroid",
    "neuralcd_predict_probability",
    "rasch_probability",
    "select_with_contextual_thompson_sampling",
    "split_interactions_without_future_leakage",
    "uncertainty_from_attempts",
    "update_beta",
    "update_linear_posterior",
    "update_theta",
    "validate_monotonicity",
]
