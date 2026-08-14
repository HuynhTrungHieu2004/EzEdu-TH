import unittest

from app.exam_bank.services.study_intent_service import detect_study_intent


class StudyIntentTests(unittest.TestCase):
    def test_detects_vietnamese_review_request_and_subject(self):
        intent = detect_study_intent("Tôi muốn ôn tập môn Toán")

        self.assertIsNotNone(intent)
        self.assertEqual(intent.subject_id, "toan")
        self.assertEqual(intent.subject_label, "Toán")

    def test_detects_subject_alias_without_diacritics(self):
        intent = detect_study_intent("Luyen de vat ly cho minh")

        self.assertIsNotNone(intent)
        self.assertEqual(intent.subject_id, "vat_li")

    def test_review_request_without_subject_is_still_an_intent(self):
        intent = detect_study_intent("Tôi muốn làm một đề ôn tập")

        self.assertIsNotNone(intent)
        self.assertIsNone(intent.subject_id)

    def test_ordinary_question_does_not_trigger_exam_flow(self):
        self.assertIsNone(detect_study_intent("Định lý Pythagore là gì?"))


if __name__ == "__main__":
    unittest.main()

