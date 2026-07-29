import unittest

from app.exam_bank.services.shuffle_service import apply_shuffle_to_question, generate_equivalent_codes


def _mc_question(qid, correct="B"):
    return {
        "id": qid,
        "question_type": "multiple_choice",
        "options": {"A": "Đáp án A", "B": "Đáp án đúng", "C": "Đáp án C", "D": "Đáp án D"},
        "correct_answer": correct,
    }


class ShuffleServiceTests(unittest.TestCase):
    """Sinh nhiều mã đề tương đương — đảo câu/đáp án an toàn, có seed tái tạo."""

    def setUp(self):
        self.question_ids = ["q1", "q2", "q3", "q4"]
        self.questions_by_id = {
            "q1": _mc_question("q1", correct="B"),
            "q2": _mc_question("q2", correct="A"),
            "q3": {"id": "q3", "question_type": "true_false", "options": None, "correct_answer": "true"},
            "q4": {"id": "q4", "question_type": "short_answer", "options": None, "correct_answer": "42"},
        }

    def test_generates_requested_number_of_codes(self):
        codes = generate_equivalent_codes(
            question_ids=self.question_ids, questions_by_id=self.questions_by_id, code_count=5, seed=42
        )
        self.assertEqual(len(codes), 5)

    def test_each_code_contains_the_same_set_of_questions(self):
        codes = generate_equivalent_codes(
            question_ids=self.question_ids, questions_by_id=self.questions_by_id, code_count=3, seed=1
        )
        for code in codes:
            self.assertEqual(set(code.question_order), set(self.question_ids))

    def test_seed_is_reproducible(self):
        codes_a = generate_equivalent_codes(
            question_ids=self.question_ids, questions_by_id=self.questions_by_id, code_count=3, seed=999
        )
        codes_b = generate_equivalent_codes(
            question_ids=self.question_ids, questions_by_id=self.questions_by_id, code_count=3, seed=999
        )
        for a, b in zip(codes_a, codes_b):
            self.assertEqual(a.question_order, b.question_order)
            self.assertEqual(a.option_shuffle, b.option_shuffle)

    def test_different_seeds_likely_produce_different_order(self):
        # Không tuyệt đối đảm bảo (xác suất trùng thấp nhưng khác 0), nhưng
        # với 4 câu và 2 seed khác nhau, kỳ vọng thứ tự khác nhau.
        codes_a = generate_equivalent_codes(
            question_ids=self.question_ids, questions_by_id=self.questions_by_id, code_count=1, seed=1
        )
        codes_b = generate_equivalent_codes(
            question_ids=self.question_ids, questions_by_id=self.questions_by_id, code_count=1, seed=2
        )
        # Ít nhất MỘT trong hai (thứ tự câu HOẶC đảo đáp án) phải khác nhau.
        self.assertTrue(
            codes_a[0].question_order != codes_b[0].question_order
            or codes_a[0].option_shuffle != codes_b[0].option_shuffle
        )

    def test_true_false_and_short_answer_are_never_shuffled(self):
        codes = generate_equivalent_codes(
            question_ids=self.question_ids, questions_by_id=self.questions_by_id, code_count=10, seed=7
        )
        for code in codes:
            self.assertNotIn("q3", code.option_shuffle)  # true_false
            self.assertNotIn("q4", code.option_shuffle)  # short_answer

    def test_multiple_choice_options_get_shuffle_mapping(self):
        codes = generate_equivalent_codes(
            question_ids=self.question_ids, questions_by_id=self.questions_by_id, code_count=1, seed=5
        )
        self.assertIn("q1", codes[0].option_shuffle)
        self.assertEqual(set(codes[0].option_shuffle["q1"].keys()), {"A", "B", "C", "D"})

    def test_correct_answer_follows_content_after_shuffle(self):
        """Sau khi đảo, đáp án đúng của mã đề phải trỏ đúng nhãn MỚI có cùng
        NỘI DUNG với đáp án đúng gốc — không được lệch theo nhãn cũ."""
        question = self.questions_by_id["q1"]
        codes = generate_equivalent_codes(
            question_ids=self.question_ids, questions_by_id=self.questions_by_id, code_count=1, seed=123
        )
        shuffle_map = codes[0].option_shuffle["q1"]
        result = apply_shuffle_to_question(question, shuffle_map)

        # Nội dung ứng với nhãn đáp án đúng mới phải trùng nội dung gốc "Đáp án đúng".
        new_correct_letter = result["correct_answer"]
        self.assertEqual(result["options"][new_correct_letter], "Đáp án đúng")

    def test_all_original_option_text_preserved_after_shuffle(self):
        question = self.questions_by_id["q2"]
        codes = generate_equivalent_codes(
            question_ids=self.question_ids, questions_by_id=self.questions_by_id, code_count=1, seed=55
        )
        shuffle_map = codes[0].option_shuffle["q2"]
        result = apply_shuffle_to_question(question, shuffle_map)

        self.assertEqual(set(result["options"].values()), set(question["options"].values()))

    def test_apply_shuffle_without_mapping_returns_original(self):
        question = self.questions_by_id["q3"]
        result = apply_shuffle_to_question(question, None)
        self.assertEqual(result["options"], question["options"])
        self.assertEqual(result["correct_answer"], question["correct_answer"])


if __name__ == "__main__":
    unittest.main()
