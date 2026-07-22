import unittest
from fastapi import HTTPException
from app.utils.cursor import serialize_cursor, deserialize_cursor

class TestCursor(unittest.TestCase):
    def test_serialize_and_deserialize_valid_cursor(self):
        payload = {
            "v": 1,
            "kind": "conversation_list",
            "user_hash": "user123hash",
            "query_hash": "queryhash",
            "sort_values": [True, "2026-07-18T05:00:00Z", "2026-07-18T05:10:00Z", "60c72b2f9b1d8b234a5c9e2b"]
        }
        
        cursor_str = serialize_cursor(payload)
        self.assertIsNotNone(cursor_str)
        self.assertIn(".", cursor_str)
        
        decoded = deserialize_cursor(cursor_str, "conversation_list")
        self.assertEqual(decoded["v"], 1)
        self.assertEqual(decoded["kind"], "conversation_list")
        self.assertEqual(decoded["user_hash"], "user123hash")
        self.assertEqual(decoded["sort_values"][0], True)
        self.assertEqual(decoded["sort_values"][3], "60c72b2f9b1d8b234a5c9e2b")

    def test_deserialize_invalid_signature_raises_400(self):
        payload = {"v": 1, "kind": "conversation_list", "user_hash": "user"}
        cursor_str = serialize_cursor(payload)
        
        # Tamper the signature part
        parts = cursor_str.split('.')
        tampered_cursor = f"{parts[0]}.wrongsignature12345"
        
        with self.assertRaises(HTTPException) as ctx:
            deserialize_cursor(tampered_cursor, "conversation_list")
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, "Mã phân trang bị thay đổi hoặc không hợp lệ.")

    def test_deserialize_wrong_kind_raises_400(self):
        payload = {"v": 1, "kind": "conversation_list", "user_hash": "user"}
        cursor_str = serialize_cursor(payload)
        
        with self.assertRaises(HTTPException) as ctx:
            deserialize_cursor(cursor_str, "message_history")
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, "Loại mã phân trang không đúng.")

    def test_deserialize_wrong_version_raises_400(self):
        payload = {"v": 2, "kind": "conversation_list", "user_hash": "user"}
        cursor_str = serialize_cursor(payload)
        
        with self.assertRaises(HTTPException) as ctx:
            deserialize_cursor(cursor_str, "conversation_list")
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, "Phiên bản mã phân trang không được hỗ trợ.")

    def test_deserialize_malformed_raises_400(self):
        with self.assertRaises(HTTPException) as ctx:
            deserialize_cursor("not_a_valid_base64_string", "conversation_list")
        self.assertEqual(ctx.exception.status_code, 400)
        
    def test_deserialize_too_large_raises_400(self):
        huge_cursor = "a" * 1500
        with self.assertRaises(HTTPException) as ctx:
            deserialize_cursor(huge_cursor, "conversation_list")
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, "Mã phân trang quá dài.")
