import unittest
from unittest.mock import patch

from app.services import rag_service


class ChromaClientModeTests(unittest.TestCase):
    def test_defaults_to_persistent_client(self):
        """Mặc định phải là persistent — không đòi hỏi dựng thêm Chroma server."""
        with patch.object(rag_service.settings, "CHROMA_MODE", "persistent"), patch(
            "chromadb.PersistentClient"
        ) as persistent, patch("chromadb.HttpClient") as http:
            rag_service.init_chroma_client()

        persistent.assert_called_once()
        http.assert_not_called()

    def test_http_mode_uses_http_client_with_configured_target(self):
        with patch.object(rag_service.settings, "CHROMA_MODE", "http"), patch.object(
            rag_service.settings, "CHROMA_HOST", "chroma.internal"
        ), patch.object(rag_service.settings, "CHROMA_PORT", 9000), patch.object(
            rag_service.settings, "CHROMA_SSL", True
        ), patch("chromadb.HttpClient") as http, patch("chromadb.PersistentClient") as persistent:
            rag_service.init_chroma_client()

        persistent.assert_not_called()
        http.assert_called_once()
        kwargs = http.call_args.kwargs
        self.assertEqual(kwargs["host"], "chroma.internal")
        self.assertEqual(kwargs["port"], 9000)
        self.assertTrue(kwargs["ssl"])

    def test_http_mode_sends_auth_token_when_configured(self):
        with patch.object(rag_service.settings, "CHROMA_MODE", "http"), patch.object(
            rag_service.settings, "CHROMA_AUTH_TOKEN", "secret-token"
        ), patch("chromadb.HttpClient") as http:
            rag_service.init_chroma_client()

        headers = http.call_args.kwargs.get("headers") or {}
        self.assertEqual(headers.get("Authorization"), "Bearer secret-token")

    def test_http_mode_without_token_sends_no_auth_header(self):
        with patch.object(rag_service.settings, "CHROMA_MODE", "http"), patch.object(
            rag_service.settings, "CHROMA_AUTH_TOKEN", ""
        ), patch("chromadb.HttpClient") as http:
            rag_service.init_chroma_client()

        self.assertIsNone(http.call_args.kwargs.get("headers"))

    def test_unknown_mode_fails_loudly(self):
        with patch.object(rag_service.settings, "CHROMA_MODE", "sqlite"):
            with self.assertRaises(ValueError) as ctx:
                rag_service.init_chroma_client()

        self.assertIn("CHROMA_MODE", str(ctx.exception))


class ChromaSettingsValidationTests(unittest.TestCase):
    def test_config_rejects_invalid_mode(self):
        from app.core.config import Settings

        with self.assertRaises(ValueError):
            Settings(CHROMA_MODE="ftp")

    def test_config_rejects_out_of_range_port(self):
        from app.core.config import Settings

        with self.assertRaises(ValueError):
            Settings(CHROMA_MODE="http", CHROMA_PORT=0)


if __name__ == "__main__":
    unittest.main()
