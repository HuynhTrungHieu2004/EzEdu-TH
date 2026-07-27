from typing import Literal


LearnerLevel = Literal["beginner", "elementary", "intermediate", "advanced", "expert"]


def infer_learner_level(theta: float, average_mastery: float) -> LearnerLevel:
    combined = 0.5 * ((theta + 4.0) / 8.0) + 0.5 * average_mastery
    if combined < 0.25:
        return "beginner"
    if combined < 0.45:
        return "elementary"
    if combined < 0.65:
        return "intermediate"
    if combined < 0.85:
        return "advanced"
    return "expert"
