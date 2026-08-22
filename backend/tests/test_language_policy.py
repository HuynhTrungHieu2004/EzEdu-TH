import unittest


ENGLISH_FIELDS = [
    "Which sentence correctly uses the past simple tense?",
    "A. She visited her grandmother yesterday.",
    "B. She visits her grandmother yesterday.",
    "The correct answer is A.",
    "The verb visited describes a completed action in the past.",
]

VIETNAMESE_FIELDS = [
    "Câu nào sử dụng đúng thì quá khứ đơn?",
    "A. Cô ấy đã thăm bà vào hôm qua.",
    "B. Cô ấy thăm bà vào ngày mai.",
    "Đáp án đúng là A.",
    "Động từ diễn tả một hành động đã hoàn thành trong quá khứ.",
]


class LanguagePolicyTests(unittest.TestCase):
    def _language_api(self):
        try:
            from app.services.language_policy_service import (
                LanguageMismatchError,
                resolve_output_language,
                validate_output_language,
            )
        except ModuleNotFoundError as exc:
            self.fail(f"Language policy service is missing: {exc}")
        return LanguageMismatchError, resolve_output_language, validate_output_language

    def test_english_subject_defaults_to_english_for_every_grade_6_to_12(self):
        _, resolve_output_language, _ = self._language_api()

        for grade in range(6, 13):
            with self.subTest(grade=grade):
                self.assertEqual(
                    "en",
                    resolve_output_language(subject_id="tieng_anh", grade=grade, explicit=None),
                )

    def test_explicit_vietnamese_override_is_honored(self):
        _, resolve_output_language, _ = self._language_api()

        self.assertEqual(
            "vi",
            resolve_output_language(subject_id="tieng_anh", grade=12, explicit="vi"),
        )

    def test_english_question_set_passes_all_field_validation(self):
        _, _, validate_output_language = self._language_api()
        validate_output_language(ENGLISH_FIELDS, expected="en")

    def test_former_all_vietnamese_english_question_failure_is_rejected(self):
        LanguageMismatchError, _, validate_output_language = self._language_api()

        with self.assertRaises(LanguageMismatchError):
            validate_output_language(VIETNAMESE_FIELDS, expected="en")

    def test_vietnamese_output_passes_when_explicitly_requested(self):
        _, _, validate_output_language = self._language_api()
        validate_output_language(VIETNAMESE_FIELDS, expected="vi")


if __name__ == "__main__":
    unittest.main()
