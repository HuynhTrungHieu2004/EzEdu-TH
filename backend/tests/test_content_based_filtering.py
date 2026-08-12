import unittest
from datetime import datetime, timedelta, timezone

from app.personalization.services.content_based_filtering_service import (
    ENGAGEMENT_WEIGHT,
    build_learner_profile_vector,
    cosine_similarity,
    score_item_similarity,
)

NOW = datetime(2026, 8, 10, tzinfo=timezone.utc)

# Ba vùng ngữ nghĩa trực giao để kiểm tra dễ đọc.
MATH = [1.0, 0.0, 0.0]
HISTORY = [0.0, 1.0, 0.0]
BIOLOGY = [0.0, 0.0, 1.0]

ITEMS = {
    "math1": {"_id": "math1", "semantic_embedding": MATH},
    "math2": {"_id": "math2", "semantic_embedding": [0.95, 0.05, 0.0]},
    "hist1": {"_id": "hist1", "semantic_embedding": HISTORY},
    "bio1": {"_id": "bio1", "semantic_embedding": BIOLOGY},
    "blank": {"_id": "blank", "semantic_embedding": []},
}


def event(item_id: str, *, days_ago: int = 0, event_type: str = "question_answered", **extra) -> dict:
    payload = {
        "item_id": item_id,
        "event_type": event_type,
        "occurred_at": NOW - timedelta(days=days_ago),
    }
    payload.update(extra)
    return payload


class CosineSimilarityTests(unittest.TestCase):
    def test_identical_direction_scores_one(self):
        self.assertAlmostEqual(cosine_similarity(MATH, MATH), 1.0)

    def test_orthogonal_scores_zero(self):
        self.assertAlmostEqual(cosine_similarity(MATH, HISTORY), 0.0)

    def test_empty_vector_scores_zero_instead_of_crashing(self):
        self.assertEqual(cosine_similarity([], MATH), 0.0)
        self.assertEqual(cosine_similarity(MATH, []), 0.0)

    def test_mismatched_length_scores_zero(self):
        self.assertEqual(cosine_similarity([1.0, 0.0], MATH), 0.0)


class BuildLearnerProfileVectorTests(unittest.TestCase):
    def test_no_events_gives_no_profile(self):
        self.assertEqual(build_learner_profile_vector([], ITEMS, now=NOW), [])

    def test_profile_points_toward_the_content_actually_engaged_with(self):
        events = [event("math1", completed=True), event("math2", completed=True)]

        profile = build_learner_profile_vector(events, ITEMS, now=NOW)

        self.assertGreater(cosine_similarity(profile, MATH), 0.9)
        self.assertLess(cosine_similarity(profile, HISTORY), 0.3)

    def test_recent_activity_outweighs_old_activity(self):
        """Sở thích đổi theo thời gian — hoạt động cũ phải nhẹ cân hơn."""
        events = [
            event("hist1", days_ago=120, completed=True),
            event("math1", days_ago=0, completed=True),
        ]

        profile = build_learner_profile_vector(events, ITEMS, now=NOW)

        self.assertGreater(cosine_similarity(profile, MATH), cosine_similarity(profile, HISTORY))

    def test_skipped_items_do_not_shape_the_profile(self):
        events = [event("math1", completed=True), event("hist1", skipped=True)]

        profile = build_learner_profile_vector(events, ITEMS, now=NOW)

        self.assertAlmostEqual(cosine_similarity(profile, HISTORY), 0.0, places=6)

    def test_items_without_embedding_are_ignored(self):
        events = [event("blank", completed=True), event("math1", completed=True)]

        profile = build_learner_profile_vector(events, ITEMS, now=NOW)

        self.assertGreater(cosine_similarity(profile, MATH), 0.9)

    def test_engagement_weights_are_ordered_sensibly(self):
        """Hoàn thành thể hiện quan tâm rõ hơn là chỉ xem lướt."""
        self.assertGreater(ENGAGEMENT_WEIGHT["completed"], ENGAGEMENT_WEIGHT["item_viewed"])
        self.assertEqual(ENGAGEMENT_WEIGHT["skipped"], 0.0)

    def test_events_pointing_at_unknown_items_are_ignored(self):
        profile = build_learner_profile_vector([event("khong_ton_tai", completed=True)], ITEMS, now=NOW)

        self.assertEqual(profile, [])


class ScoreItemSimilarityTests(unittest.TestCase):
    def test_similar_item_scores_higher_than_unrelated_one(self):
        profile = build_learner_profile_vector([event("math1", completed=True)], ITEMS, now=NOW)

        math_score = score_item_similarity(profile, ITEMS["math2"])
        history_score = score_item_similarity(profile, ITEMS["hist1"])

        self.assertGreater(math_score, history_score)

    def test_score_stays_within_zero_and_one(self):
        profile = build_learner_profile_vector([event("math1", completed=True)], ITEMS, now=NOW)

        for item in ITEMS.values():
            score = score_item_similarity(profile, item)
            self.assertGreaterEqual(score, 0.0)
            self.assertLessEqual(score, 1.0)

    def test_missing_profile_scores_zero(self):
        self.assertEqual(score_item_similarity([], ITEMS["math1"]), 0.0)


if __name__ == "__main__":
    unittest.main()
