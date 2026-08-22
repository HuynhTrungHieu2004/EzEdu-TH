import unittest

from app.services.question_generation_service import _valid_question_candidate, build_question_prompt


class ClaudeQuestionGenerationTests(unittest.TestCase):
    def test_prompt_requests_bloom_in_same_response(self):
        prompt = build_question_prompt("Nội dung", 2, "medium", "multiple_choice")
        self.assertIn('"bloom_level"', prompt)

    def test_rejects_multiple_choice_with_answer_outside_options(self):
        question = {
            "question": "Câu hỏi?",
            "question_type": "multiple_choice",
            "options": {"A": "Một", "B": "Hai"},
            "correct_answer": "C",
        }
        self.assertFalse(_valid_question_candidate(question))

    def test_accepts_valid_short_answer(self):
        question = {
            "question": "Khái niệm là gì?",
            "question_type": "short_answer",
            "correct_answer": "Đáp án",
            "options": None,
        }
        self.assertTrue(_valid_question_candidate(question))


if __name__ == "__main__":
    unittest.main()
