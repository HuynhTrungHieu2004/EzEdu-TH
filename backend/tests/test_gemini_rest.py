from unittest import TestCase
from unittest.mock import Mock, patch

from app.services import llm_service


class GeminiRestTests(TestCase):
    @patch.object(llm_service.settings, "GEMINI_API_KEY", "test-key")
    @patch.object(llm_service.settings, "GEMINI_MODEL", "gemini-2.5-flash")
    @patch.object(llm_service.httpx, "post")
    def test_sends_api_key_header_and_json_response_config(self, post: Mock):
        response = Mock()
        response.json.return_value = {
            "candidates": [{"content": {"parts": [{"text": '{"ok":true}'}]}}]
        }
        post.return_value = response

        result = llm_service.gemini_generate_json("Tạo một câu hỏi")

        self.assertEqual(result, '{"ok":true}')
        post.assert_called_once_with(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
            headers={"x-goog-api-key": "test-key"},
            json={
                "contents": [{"parts": [{"text": "Tạo một câu hỏi"}]}],
                "generationConfig": {"responseMimeType": "application/json"},
            },
            timeout=llm_service.settings.AI_TIMEOUT_SECONDS,
        )
        response.raise_for_status.assert_called_once_with()
