from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping

import numpy as np


class NeuralCDModelError(ValueError):
    pass


@dataclass(frozen=True)
class NeuralCDParameters:
    user_proficiency: Mapping[str, list[float]]
    item_difficulty: Mapping[str, list[float]]
    item_discrimination: Mapping[str, float]
    q_matrix: Mapping[str, list[float]]
    model_version: str


def sigmoid(value: float) -> float:
    return float(1.0 / (1.0 + np.exp(-max(-30.0, min(30.0, value)))))


def neuralcd_predict_probability(user_id: str, item_id: str, parameters: NeuralCDParameters) -> float:
    """Monotonic NeuralCD-style forward pass for research inference only."""
    if user_id not in parameters.user_proficiency:
        raise NeuralCDModelError("Unknown user proficiency vector.")
    if item_id not in parameters.item_difficulty or item_id not in parameters.q_matrix:
        raise NeuralCDModelError("Missing item difficulty or Q-Matrix vector.")

    proficiency = np.asarray(parameters.user_proficiency[user_id], dtype=float)
    difficulty = np.asarray(parameters.item_difficulty[item_id], dtype=float)
    q_vector = np.asarray(parameters.q_matrix[item_id], dtype=float)
    if not (len(proficiency) == len(difficulty) == len(q_vector)):
        raise NeuralCDModelError("NeuralCD vector dimensions must match.")
    if np.any(q_vector < 0):
        raise NeuralCDModelError("Q-Matrix weights must be non-negative.")
    q_sum = float(np.sum(q_vector))
    if q_sum <= 0:
        raise NeuralCDModelError("Q-Matrix vector must reference at least one knowledge component.")

    discrimination = max(0.0, float(parameters.item_discrimination.get(item_id, 1.0)))
    latent_score = discrimination * float(np.dot(q_vector, proficiency - difficulty) / q_sum)
    return sigmoid(latent_score)


def validate_monotonicity(parameters: NeuralCDParameters, *, epsilon: float = 1e-6) -> dict:
    negative_discrimination_items = [
        item_id
        for item_id, value in parameters.item_discrimination.items()
        if float(value) < 0
    ]
    negative_q_items = [
        item_id
        for item_id, values in parameters.q_matrix.items()
        if any(float(value) < 0 for value in values)
    ]
    return {
        "status": "ok" if not negative_discrimination_items and not negative_q_items and epsilon > 0 else "failed",
        "negative_discrimination_items": negative_discrimination_items,
        "negative_q_items": negative_q_items,
        "epsilon": epsilon,
    }
