from dataclasses import dataclass


@dataclass(frozen=True)
class BKTParameters:
    p_init: float
    p_learn: float
    p_guess: float
    p_slip: float
    min_probability: float = 0.001
    max_probability: float = 0.999


def clamp_probability(value: float, *, min_probability: float = 0.001, max_probability: float = 0.999) -> float:
    return max(min_probability, min(max_probability, value))


def bkt_observation_update(prior_mastery: float, correctness: float, params: BKTParameters) -> float:
    prior = clamp_probability(
        prior_mastery,
        min_probability=params.min_probability,
        max_probability=params.max_probability,
    )
    correct_likelihood_mastered = 1.0 - params.p_slip
    correct_likelihood_unmastered = params.p_guess

    posterior_if_correct = (
        prior * correct_likelihood_mastered
        / (
            prior * correct_likelihood_mastered
            + (1.0 - prior) * correct_likelihood_unmastered
        )
    )
    posterior_if_incorrect = (
        prior * params.p_slip
        / (
            prior * params.p_slip
            + (1.0 - prior) * (1.0 - params.p_guess)
        )
    )

    blended = correctness * posterior_if_correct + (1.0 - correctness) * posterior_if_incorrect
    return clamp_probability(
        blended,
        min_probability=params.min_probability,
        max_probability=params.max_probability,
    )


def bkt_apply_learning_transition(posterior_mastery: float, params: BKTParameters, *, weight: float = 1.0) -> float:
    effective_learn = params.p_learn * max(0.0, min(1.0, weight))
    transitioned = posterior_mastery + (1.0 - posterior_mastery) * effective_learn
    return clamp_probability(
        transitioned,
        min_probability=params.min_probability,
        max_probability=params.max_probability,
    )


def bkt_update(prior_mastery: float, correctness: float, params: BKTParameters, *, weight: float = 1.0) -> float:
    weighted_correctness = max(0.0, min(1.0, correctness))
    observed = bkt_observation_update(prior_mastery, weighted_correctness, params)
    return bkt_apply_learning_transition(observed, params, weight=weight)
