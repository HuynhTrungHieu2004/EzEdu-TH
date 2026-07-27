import unittest

from app.personalization.evaluation.metrics import (
    evaluate_ai_explanations,
    evaluate_kmeans,
    evaluate_learner_models,
    evaluate_recommendations,
)
from app.personalization.evaluation.pipeline import evaluate_dataset, run_synthetic_evaluation
from app.personalization.evaluation.synthetic import build_synthetic_evaluation_dataset


class PersonalizationEvaluationFrameworkTests(unittest.TestCase):
    def test_empty_dataset_reports_no_data(self):
        learner = evaluate_learner_models([])
        recommendations = evaluate_recommendations([])
        ai = evaluate_ai_explanations([])

        self.assertEqual(learner["bkt_irt"]["status"], "no_data")
        self.assertEqual(recommendations["status"], "no_data")
        self.assertEqual(ai["status"], "no_data")

    def test_one_class_dataset_does_not_force_roc_auc(self):
        result = evaluate_learner_models([
            {"predicted_probability": 0.8, "actual": 1, "knowledge_component_id": "kc-1"},
            {"predicted_probability": 0.7, "actual": 1, "knowledge_component_id": "kc-1"},
        ])

        self.assertEqual(result["bkt_irt"]["status"], "ok")
        self.assertEqual(result["bkt_irt"]["roc_auc"]["status"], "insufficient_classes")

    def test_missing_labels_and_invalid_predictions_are_counted(self):
        result = evaluate_learner_models([
            {"predicted_probability": 0.8, "actual": 1},
            {"predicted_probability": 0.4, "actual": None},
            {"predicted_probability": "bad", "actual": 0},
        ])

        self.assertEqual(result["bkt_irt"]["sample_count"], 1)
        self.assertEqual(result["bkt_irt"]["skipped_missing_label"], 1)
        self.assertEqual(result["bkt_irt"]["skipped_invalid_prediction"], 1)

    def test_no_recommendation_session_is_safe(self):
        result = evaluate_recommendations([
            {"recommended_items": [], "relevant_item_ids": ["item-1"], "catalog_size": 3}
        ])

        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["precision@5"], 0.0)
        self.assertEqual(result["repetition_rate"], 0.0)

    def test_kmeans_too_little_data_is_not_fit(self):
        result = evaluate_kmeans([
            {
                "semantic_embedding": [1.0, 0.0],
                "difficulty": 0.2,
                "bloom_level_encoded": 0.1,
                "estimated_duration_seconds": 120,
                "topic": "intro",
            }
        ], cluster_type="content")

        self.assertEqual(result["status"], "insufficient_data")

    def test_ai_explanation_hallucinated_number_rate(self):
        result = evaluate_ai_explanations([
            {
                "explanation": "Estimated mastery is 99%.",
                "allowed_numbers": ["72%"],
                "grounded": True,
                "faithful_to_scores": False,
                "source_valid": True,
                "relevant": True,
                "fallback_used": False,
            },
            {
                "explanation": "Rule fallback without numbers.",
                "allowed_numbers": [],
                "grounded": True,
                "faithful_to_scores": True,
                "source_valid": True,
                "relevant": True,
                "fallback_used": True,
            },
        ])

        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["hallucinated_number_rate"], 0.5)
        self.assertEqual(result["fallback_rate"], 0.5)

    def test_synthetic_dataset_is_marked_and_pipeline_runs(self):
        dataset = build_synthetic_evaluation_dataset()
        result = evaluate_dataset(dataset)

        self.assertTrue(dataset["is_synthetic"])
        self.assertTrue(result["is_synthetic"])
        self.assertIn("synthetic", result["synthetic_notice"].lower())
        self.assertEqual(result["learner_model"]["bkt_irt"]["status"], "ok")

    def test_synthetic_convenience_runner_marks_result(self):
        result = run_synthetic_evaluation()

        self.assertTrue(result["is_synthetic"])
        self.assertIn("recommendations", result)


if __name__ == "__main__":
    unittest.main()
