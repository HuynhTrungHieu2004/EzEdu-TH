"""Một nhà cung cấp hết quota không được làm chết tính năng.

Trước đây chỗ chọn nhà cung cấp là `gemini_generate_json if is_gemini_available()
else generate_json`: chọn một lần rồi thôi. Khi Gemini trả 429 RESOURCE_EXHAUSTED,
cả luồng trích xuất tri thức dừng lại — dù Groq đã được cấu hình đầy đủ và đang
chạy tốt. Cấu hình hai nhà cung cấp mà chỉ dùng được một là mất tiền vô ích.
"""

import unittest
from unittest.mock import patch

from app.core.config import settings
from app.services import llm_service


class GenerateJsonWithFailoverTests(unittest.TestCase):
    def test_uses_gemini_first_when_available(self):
        with patch.object(settings, "AI_TEXT_PROVIDER", "legacy"), \
             patch.object(llm_service, "is_gemini_available", return_value=True), \
             patch.object(llm_service, "is_groq_available", return_value=True), \
             patch.object(llm_service, "gemini_generate_json", return_value='{"nguon":"gemini"}') as gemini, \
             patch.object(llm_service, "generate_json") as groq:

            result = llm_service.generate_json_with_failover("prompt")

        self.assertEqual(result, '{"nguon":"gemini"}')
        gemini.assert_called_once()
        groq.assert_not_called()

    def test_falls_back_to_groq_when_gemini_fails(self):
        """Đây là ca đã xảy ra thật: Gemini trả 429, Groq vẫn dùng được."""
        with patch.object(settings, "AI_TEXT_PROVIDER", "legacy"), \
             patch.object(llm_service, "is_gemini_available", return_value=True), \
             patch.object(llm_service, "is_groq_available", return_value=True), \
             patch.object(llm_service, "gemini_generate_json",
                          side_effect=RuntimeError("429 RESOURCE_EXHAUSTED")), \
             patch.object(llm_service, "generate_json", return_value='{"nguon":"groq"}') as groq:

            result = llm_service.generate_json_with_failover("prompt")

        self.assertEqual(result, '{"nguon":"groq"}')
        groq.assert_called_once()

    def test_uses_groq_directly_when_gemini_not_configured(self):
        with patch.object(settings, "AI_TEXT_PROVIDER", "legacy"), \
             patch.object(llm_service, "is_gemini_available", return_value=False), \
             patch.object(llm_service, "is_groq_available", return_value=True), \
             patch.object(llm_service, "gemini_generate_json") as gemini, \
             patch.object(llm_service, "generate_json", return_value='{"nguon":"groq"}'):

            result = llm_service.generate_json_with_failover("prompt")

        self.assertEqual(result, '{"nguon":"groq"}')
        gemini.assert_not_called()

    def test_raises_the_original_error_when_every_provider_fails(self):
        """Không nuốt lỗi: hỏng cả hai thì người vận hành phải thấy lý do."""
        with patch.object(settings, "AI_TEXT_PROVIDER", "legacy"), \
             patch.object(llm_service, "is_gemini_available", return_value=True), \
             patch.object(llm_service, "is_groq_available", return_value=True), \
             patch.object(llm_service, "gemini_generate_json",
                          side_effect=RuntimeError("gemini het quota")), \
             patch.object(llm_service, "generate_json",
                          side_effect=RuntimeError("groq cung hong")):

            with self.assertRaises(RuntimeError) as ctx:
                llm_service.generate_json_with_failover("prompt")

        self.assertIn("groq cung hong", str(ctx.exception))

    def test_raises_when_no_provider_is_configured(self):
        with patch.object(settings, "AI_TEXT_PROVIDER", "legacy"), \
             patch.object(llm_service, "is_gemini_available", return_value=False), \
             patch.object(llm_service, "is_groq_available", return_value=False):

            with self.assertRaises(RuntimeError):
                llm_service.generate_json_with_failover("prompt")

    def test_claude_mode_uses_claude_only(self):
        with patch.object(settings, "AI_TEXT_PROVIDER", "claude"), \
             patch.object(llm_service, "claude_generate_json", return_value='{"nguon":"claude"}') as claude, \
             patch.object(llm_service, "gemini_generate_json") as gemini, \
             patch.object(llm_service, "generate_json") as groq:
            result = llm_service.generate_json_with_failover("prompt")

        self.assertEqual(result, '{"nguon":"claude"}')
        claude.assert_called_once_with("prompt", quality=True, max_retries=0)
        gemini.assert_not_called()
        groq.assert_not_called()

    def test_claude_timeout_falls_back_to_groq(self):
        with patch.object(settings, "AI_TEXT_PROVIDER", "claude"), \
             patch.object(llm_service, "is_groq_available", return_value=True), \
             patch.object(llm_service, "claude_generate_json", side_effect=TimeoutError("claude timeout")), \
             patch.object(llm_service, "generate_json", return_value='{"nguon":"groq"}') as groq:

            result = llm_service.generate_json_with_failover("prompt")

        self.assertEqual(result, '{"nguon":"groq"}')
        groq.assert_called_once_with("prompt")


if __name__ == "__main__":
    unittest.main()
