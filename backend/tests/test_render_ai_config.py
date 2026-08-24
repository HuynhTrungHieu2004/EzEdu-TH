from pathlib import Path
import unittest


class RenderAIConfigTests(unittest.TestCase):
    def test_production_uses_gemini_through_public_9router(self):
        blueprint = (Path(__file__).resolve().parents[2] / "render.yaml").read_text()

        for key, value in {
            "CLAUDE_FAST_MODEL": "ag/gemini-3.7-flash-low",
            "CLAUDE_QUALITY_MODEL": "ag/gemini-3.7-flash-low",
            "AI_TIMEOUT_SECONDS": '"45"',
            "MAX_RETRIES": '"0"',
            "ANTHROPIC_FALLBACK_BASE_URL": '""',
            "ANTHROPIC_FALLBACK_MODEL": '""',
        }.items():
            self.assertIn(f"- key: {key}\n        value: {value}", blueprint)
        self.assertIn("- key: ANTHROPIC_BASE_URL\n        sync: false", blueprint)


if __name__ == "__main__":
    unittest.main()
