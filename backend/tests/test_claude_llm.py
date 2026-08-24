import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import httpx

from app.core.config import settings
from app.services import llm_service


def _response(status: int = 200, *, body: dict | None = None, headers: dict | None = None):
    request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    return httpx.Response(status, json=body or {}, headers=headers, request=request)


class ClaudeClientTests(unittest.TestCase):
    def test_rate_limit_falls_back_to_secondary_anthropic_endpoint(self):
        limited = _response(429, body={"error": {"message": "quota exhausted"}})
        fallback = _response(body={
            "model": "nghi/claude-sonnet-5",
            "content": [{"type": "text", "text": "fallback ok"}],
            "usage": {"input_tokens": 2, "output_tokens": 1},
        })
        configured = SimpleNamespace(
            ANTHROPIC_API_KEY="sk-router-test",
            ANTHROPIC_BASE_URL="http://127.0.0.1:20128",
            CLAUDE_FAST_MODEL="ag/gemini-pro-agent",
            CLAUDE_QUALITY_MODEL="ag/gemini-pro-agent",
            ANTHROPIC_FALLBACK_API_KEY="sk-fallback-test",
            ANTHROPIC_FALLBACK_BASE_URL="https://api.nghimmo.com",
            ANTHROPIC_FALLBACK_MODEL="nghi/claude-sonnet-5",
            CLAUDE_FAST_MAX_PROMPT_CHARACTERS=10_000,
            CLAUDE_QUALITY_MAX_PROMPT_CHARACTERS=30_000,
            CLAUDE_FAST_MAX_OUTPUT_TOKENS=1_000,
            CLAUDE_QUALITY_MAX_OUTPUT_TOKENS=3_000,
            AI_TIMEOUT_SECONDS=25.0,
            MAX_RETRIES=0,
        )
        with patch.object(llm_service, "settings", configured), \
             patch("app.services.llm_service.httpx.post", side_effect=[limited, fallback]) as post:
            result = llm_service.claude_generate("test", quality=True)

        self.assertEqual(result.text, "fallback ok")
        self.assertEqual(result.model, "nghi/claude-sonnet-5")
        self.assertEqual(
            [call.args[0] for call in post.call_args_list],
            [
                "http://127.0.0.1:20128/v1/messages",
                "https://api.nghimmo.com/v1/messages",
            ],
        )
        self.assertEqual(post.call_args_list[1].kwargs["headers"]["x-api-key"], "sk-fallback-test")
        self.assertEqual(post.call_args_list[1].kwargs["json"]["model"], "nghi/claude-sonnet-5")

    def test_nghimmo_streaming_fallback_is_converted_to_json_text(self):
        unavailable = _response(503, body={"error": {"message": "upstream unavailable"}})
        request = httpx.Request("POST", "https://api.nghimmo.com/v1/messages")
        streamed = httpx.Response(
            200,
            headers={"content-type": "text/event-stream; charset=utf-8"},
            text="\n".join([
                'data: {"type":"message_start","message":{"model":"nghi/claude-sonnet-5","usage":{"input_tokens":2,"output_tokens":0}}}',
                'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
                'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"."}}',
                'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"\\u2060"}}',
                'data: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}',
                'data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"{\\"ok\\":true}"}}',
                'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":4}}',
                'data: {"type":"message_stop"}',
            ]),
            request=request,
        )
        configured = SimpleNamespace(
            ANTHROPIC_API_KEY="sk-router-test",
            ANTHROPIC_BASE_URL="http://127.0.0.1:20128",
            CLAUDE_FAST_MODEL="ag/gemini-pro-agent",
            CLAUDE_QUALITY_MODEL="ag/gemini-pro-agent",
            ANTHROPIC_FALLBACK_API_KEY="sk-fallback-test",
            ANTHROPIC_FALLBACK_BASE_URL="https://api.nghimmo.com",
            ANTHROPIC_FALLBACK_MODEL="nghi/claude-sonnet-5",
            CLAUDE_FAST_MAX_PROMPT_CHARACTERS=10_000,
            CLAUDE_QUALITY_MAX_PROMPT_CHARACTERS=30_000,
            CLAUDE_FAST_MAX_OUTPUT_TOKENS=1_000,
            CLAUDE_QUALITY_MAX_OUTPUT_TOKENS=3_000,
            AI_TIMEOUT_SECONDS=25.0,
            MAX_RETRIES=0,
        )
        with patch.object(llm_service, "settings", configured), \
             patch("app.services.llm_service.httpx.post", side_effect=[unavailable, streamed]) as post:
            result = llm_service.claude_generate_json("test", quality=True)

        self.assertEqual(result, '{"ok":true}')
        self.assertIs(post.call_args_list[1].kwargs["json"]["stream"], True)
        self.assertEqual(result.total_tokens, 6)

    def test_placeholder_key_is_not_available(self):
        with patch.object(settings, "ANTHROPIC_API_KEY", "your_claude_api_key_here"):
            self.assertFalse(llm_service.is_claude_available())

    def test_fast_request_uses_haiku_and_reports_usage(self):
        fake = _response(body={
            "model": "claude-haiku-test",
            "content": [{"type": "text", "text": "Xin chào"}],
            "usage": {"input_tokens": 12, "output_tokens": 3},
        })
        with patch.object(settings, "ANTHROPIC_API_KEY", "sk-ant-test"), \
             patch.object(settings, "ANTHROPIC_BASE_URL", "https://gateway.example/"), \
             patch.object(settings, "CLAUDE_FAST_MODEL", "claude-haiku-test"), \
             patch("app.services.llm_service.httpx.post", return_value=fake) as post:
            result = llm_service.claude_generate("Hỏi đáp", quality=False)

        self.assertEqual(result.text, "Xin chào")
        self.assertEqual(result.total_tokens, 15)
        self.assertEqual(post.call_args.args[0], "https://gateway.example/v1/messages")
        kwargs = post.call_args.kwargs
        self.assertEqual(kwargs["headers"]["x-api-key"], "sk-ant-test")
        self.assertEqual(kwargs["headers"]["anthropic-version"], "2023-06-01")
        self.assertEqual(kwargs["json"]["model"], "claude-haiku-test")
        self.assertEqual(kwargs["json"]["messages"], [{"role": "user", "content": "Hỏi đáp"}])

    def test_quality_request_uses_sonnet_and_json_instruction(self):
        fake = _response(body={
            "model": "claude-sonnet-test",
            "content": [{"type": "text", "text": '{"ok":true}'}],
            "usage": {"input_tokens": 5, "output_tokens": 4},
        })
        with patch.object(settings, "ANTHROPIC_API_KEY", "sk-ant-test"), \
             patch.object(settings, "ANTHROPIC_BASE_URL", "https://api.anthropic.com"), \
             patch.object(settings, "CLAUDE_QUALITY_MODEL", "claude-sonnet-test"), \
             patch("app.services.llm_service.httpx.post", return_value=fake) as post:
            text = llm_service.claude_generate_json("Trả JSON", quality=True)

        self.assertEqual(text, '{"ok":true}')
        payload = post.call_args.kwargs["json"]
        self.assertEqual(payload["model"], "claude-sonnet-test")
        self.assertIn("JSON", payload["system"])

    def test_openai_compatible_gateway_response_is_parsed(self):
        fake = _response(body={
            "model": "gemini-pro-default",
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": '{"ok":true}'},
                "finish_reason": "stop",
            }],
            "usage": {"prompt_tokens": 12, "completion_tokens": 3},
        })
        with patch.object(settings, "ANTHROPIC_API_KEY", "sk-router-test"), \
             patch.object(settings, "ANTHROPIC_BASE_URL", "http://127.0.0.1:20128"), \
             patch.object(settings, "CLAUDE_QUALITY_MODEL", "ag/gemini-pro-agent"), \
             patch("app.services.llm_service.httpx.post", return_value=fake) as post:
            result = llm_service.claude_generate("Trả JSON", quality=True)

        self.assertEqual(result.text, '{"ok":true}')
        self.assertEqual(result.model, "gemini-pro-default")
        self.assertEqual(result.total_tokens, 15)
        self.assertIs(post.call_args.kwargs["json"]["stream"], False)

    def test_openai_gateway_tool_call_is_preserved_without_fake_text(self):
        fake = _response(body={
            "model": "gemini-pro-default",
            "choices": [{
                "index": 0,
                "message": {
                    "role": "assistant",
                    "tool_calls": [{
                        "id": "call_web_search_1",
                        "type": "function",
                        "function": {"name": "web_search", "arguments": '{"reason":"lookup"}'},
                    }],
                },
                "finish_reason": "tool_calls",
            }],
            "usage": {},
        })
        with patch.object(settings, "ANTHROPIC_API_KEY", "sk-router-test"), \
             patch("app.services.llm_service.httpx.post", return_value=fake):
            result = llm_service.claude_generate("Tìm nguồn", quality=True)

        self.assertEqual(result.text, "")
        self.assertEqual(result.finish_reason, "tool_calls")
        self.assertEqual(result.tool_calls[0]["function"]["name"], "web_search")

    def test_empty_gateway_response_without_tool_call_is_rejected(self):
        fake = _response(body={
            "model": "gemini-pro-default",
            "choices": [{
                "index": 0,
                "message": {"role": "assistant"},
                "finish_reason": "stop",
            }],
            "usage": {},
        })
        with patch.object(settings, "ANTHROPIC_API_KEY", "sk-router-test"), \
             patch("app.services.llm_service.httpx.post", return_value=fake):
            with self.assertRaisesRegex(ValueError, "rỗng"):
                llm_service.claude_generate("Trả lời", quality=True)

    def test_nghimmo_gateway_uses_its_namespaced_model_id(self):
        fake = _response(body={
            "model": "nghi/claude-sonnet-5",
            "content": [{"type": "text", "text": "ok"}],
            "usage": {},
        })
        with patch.object(settings, "ANTHROPIC_API_KEY", "sk-test"), \
             patch.object(settings, "ANTHROPIC_BASE_URL", "https://api.nghimmo.com"), \
             patch.object(settings, "CLAUDE_QUALITY_MODEL", "claude-sonnet-5"), \
             patch("app.services.llm_service.httpx.post", return_value=fake) as post:
            llm_service.claude_generate("test", quality=True)

        self.assertEqual(post.call_args.kwargs["json"]["model"], "nghi/claude-sonnet-5")

    def test_retries_429_and_honors_retry_after(self):
        limited = _response(429, body={"error": {"message": "rate limited"}}, headers={"retry-after": "2"})
        success = _response(body={
            "model": "claude-haiku-test",
            "content": [{"type": "text", "text": "ok"}],
            "usage": {"input_tokens": 1, "output_tokens": 1},
        })
        with patch.object(settings, "ANTHROPIC_API_KEY", "sk-ant-test"), \
             patch.object(settings, "ANTHROPIC_FALLBACK_API_KEY", ""), \
             patch("app.services.llm_service.httpx.post", side_effect=[limited, success]) as post, \
             patch("app.services.llm_service.time.sleep") as sleep:
            result = llm_service.claude_generate("test", quality=False)

        self.assertEqual(result.text, "ok")
        self.assertEqual(post.call_count, 2)
        sleep.assert_called_once_with(2.0)

    def test_does_not_retry_authentication_error(self):
        denied = _response(401, body={"error": {"message": "bad key"}})
        with patch.object(settings, "ANTHROPIC_API_KEY", "sk-ant-test"), \
             patch("app.services.llm_service.httpx.post", return_value=denied) as post:
            with self.assertRaises(httpx.HTTPStatusError):
                llm_service.claude_generate("test", quality=False)

        post.assert_called_once()

    def test_missing_key_fails_before_network(self):
        with patch.object(settings, "ANTHROPIC_API_KEY", ""), \
             patch("app.services.llm_service.httpx.post") as post:
            with self.assertRaisesRegex(ValueError, "ANTHROPIC_API_KEY"):
                llm_service.claude_generate("test", quality=False)
        post.assert_not_called()

    def test_usage_capture_aggregates_multiple_calls(self):
        fake = _response(body={
            "model": "claude-haiku-test",
            "content": [{"type": "text", "text": "ok"}],
            "usage": {"input_tokens": 4, "output_tokens": 2},
        })
        token = llm_service.start_claude_usage_capture()
        try:
            with patch.object(settings, "ANTHROPIC_API_KEY", "sk-ant-test"), \
                 patch("app.services.llm_service.httpx.post", return_value=fake):
                llm_service.claude_generate_content("one")
                llm_service.claude_generate_content("two")
        finally:
            usage = llm_service.stop_claude_usage_capture(token)

        self.assertEqual(usage["input_tokens"], 8)
        self.assertEqual(usage["output_tokens"], 4)
        self.assertEqual(usage["total_tokens"], 12)

    def test_prompt_limit_preserves_instructions_and_final_question(self):
        limited = llm_service.limit_prompt("INSTRUCTIONS-" + ("x" * 100) + "-FINAL-QUESTION", 40)
        self.assertTrue(limited.startswith("INSTRUCTIONS"))
        self.assertTrue(limited.endswith("FINAL-QUESTION"))
        self.assertLessEqual(len(limited), 40)

    def test_json_helper_rejects_non_json_response(self):
        fake = _response(body={
            "model": "claude-sonnet-test",
            "content": [{"type": "text", "text": "not json"}],
            "usage": {"input_tokens": 1, "output_tokens": 1},
        })
        with patch.object(settings, "ANTHROPIC_API_KEY", "sk-ant-test"), \
             patch("app.services.llm_service.httpx.post", return_value=fake):
            with self.assertRaisesRegex(ValueError, "JSON"):
                llm_service.claude_generate_json("test")

    def test_json_helper_accepts_markdown_fenced_json(self):
        fake = _response(body={
            "model": "gemini-pro-default",
            "content": [{"type": "text", "text": '```json\n[{"ok":true}]\n```'}],
            "usage": {"input_tokens": 1, "output_tokens": 1},
        })
        with patch.object(settings, "ANTHROPIC_API_KEY", "sk-router-test"), \
             patch("app.services.llm_service.httpx.post", return_value=fake):
            text = llm_service.claude_generate_json("test")

        self.assertEqual(text, '[{"ok":true}]')

    def test_json_helper_repairs_truncated_gateway_response_once(self):
        truncated = _response(body={
            "model": "gemini-pro-default",
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": '```json\n{"issues": ['},
                "finish_reason": "length",
            }],
            "usage": {"prompt_tokens": 10, "completion_tokens": 3},
        })
        repaired = _response(body={
            "model": "gemini-pro-default",
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": '{"issues":[]}'},
                "finish_reason": "stop",
            }],
            "usage": {"prompt_tokens": 6, "completion_tokens": 4},
        })
        with patch.object(settings, "ANTHROPIC_API_KEY", "sk-router-test"), \
             patch("app.services.llm_service.httpx.post", side_effect=[truncated, repaired]) as post:
            text = llm_service.claude_generate_json("Kiểm tra tài liệu")

        self.assertEqual(text, '{"issues":[]}')
        self.assertEqual(post.call_count, 2)

    def test_web_search_uses_plain_response_urls_when_gateway_omits_citations(self):
        fake = _response(body={
            "model": "nghi/claude-sonnet-5",
            "content": [{
                "type": "text",
                "text": "Nguồn: https://api.nghimmo.com/huongdan**.",
            }],
            "usage": {"input_tokens": 10, "output_tokens": 5},
        })
        with patch.object(settings, "ANTHROPIC_API_KEY", "sk-test"), \
             patch("app.services.llm_service.httpx.post", return_value=fake):
            result = llm_service.claude_web_search("Tìm hướng dẫn")

        self.assertEqual(result.citations, [{
            "url": "https://api.nghimmo.com/huongdan",
            "title": "api.nghimmo.com",
            "cited_text": "",
        }])


if __name__ == "__main__":
    unittest.main()
