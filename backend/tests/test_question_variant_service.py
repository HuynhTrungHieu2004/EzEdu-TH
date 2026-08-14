import unittest

from app.exam_bank.services.question_variant_service import build_verified_variants


class QuestionVariantServiceTests(unittest.TestCase):
    def test_builds_deterministic_verified_integer_variants(self):
        template = {
            "_id": "template-1",
            "subject_id": "toan",
            "grade": 6,
            "curriculum_version": "2018",
            "topic_id": "so-nguyen",
            "bloom_level": "apply",
            "difficulty": "easy",
            "question_type": "multiple_choice",
            "points": 1.0,
            "expected_time_seconds": 60,
            "explanation": "Cộng hai số nguyên.",
            "parameter_template": {
                "variables": {
                    "a": {"min": 2, "max": 9},
                    "b": {"min": 2, "max": 9},
                },
                "content_template": "{a} + {b} bằng bao nhiêu?",
                "answer_expression": "a + b",
                "option_expressions": {
                    "A": "a + b",
                    "B": "a + b + 1",
                    "C": "a + b - 1",
                    "D": "a * b",
                },
                "correct_option": "A",
            },
        }

        first = build_verified_variants(template, needed=3, seed=42)
        second = build_verified_variants(template, needed=3, seed=42)

        self.assertEqual(first, second)
        self.assertEqual(len(first), 3)
        self.assertEqual(len({item["content"] for item in first}), 3)
        for item in first:
            self.assertEqual(item["correct_answer"], "A")
            self.assertEqual(item["options"]["A"], item["verified_answer"])
            self.assertTrue(item["auto_verified"])

    def test_rejects_unsafe_expression(self):
        template = {
            "parameter_template": {
                "variables": {"a": {"min": 1, "max": 2}},
                "content_template": "{a}",
                "answer_expression": "__import__('os').system('echo unsafe')",
            }
        }

        with self.assertRaises(ValueError):
            build_verified_variants(template, needed=1, seed=1)


if __name__ == "__main__":
    unittest.main()

