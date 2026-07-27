import math
from dataclasses import dataclass


@dataclass(frozen=True)
class IRTParameters:
    learning_rate: float
    min_theta: float = -4.0
    max_theta: float = 4.0
    min_beta: float = -4.0
    max_beta: float = 4.0
    min_attempts_reliable: int = 5


def clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def rasch_probability(theta: float, beta: float) -> float:
    delta = clamp(theta - beta, -20.0, 20.0)
    return 1.0 / (1.0 + math.exp(-delta))


def update_theta(theta: float, beta: float, correctness: float, params: IRTParameters, *, weight: float = 1.0) -> float:
    probability = rasch_probability(theta, beta)
    step = params.learning_rate * max(0.0, min(1.0, weight)) * (correctness - probability)
    return clamp(theta + step, params.min_theta, params.max_theta)


def update_beta(beta: float, theta: float, correctness: float, params: IRTParameters, *, weight: float = 1.0) -> float:
    probability = rasch_probability(theta, beta)
    step = params.learning_rate * 0.25 * max(0.0, min(1.0, weight)) * (probability - correctness)
    return clamp(beta + step, params.min_beta, params.max_beta)


def uncertainty_from_attempts(attempt_count: int, min_attempts_reliable: int) -> float:
    if attempt_count <= 0:
        return 1.0
    return max(0.05, min(1.0, min_attempts_reliable / (attempt_count + min_attempts_reliable)))
