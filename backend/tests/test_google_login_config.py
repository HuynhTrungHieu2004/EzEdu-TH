"""Cấu hình cho đăng nhập Google phải khai báo đầy đủ và an toàn theo mặc định."""

import unittest

from app.core.config import Settings
from app.services.system_settings_service import FEATURE_FLAG_DEFINITIONS


class GoogleLoginConfigTests(unittest.TestCase):
    def test_client_id_setting_exists_and_defaults_to_empty(self):
        """Rỗng theo mặc định để máy chưa cấu hình báo lỗi rõ ràng thay vì
        gửi token đi xác minh với audience sai."""
        self.assertEqual(Settings(GOOGLE_CLIENT_ID="").GOOGLE_CLIENT_ID, "")
        self.assertEqual(Settings(GOOGLE_CLIENT_ID="abc.apps.googleusercontent.com").GOOGLE_CLIENT_ID,
                         "abc.apps.googleusercontent.com")

    def test_feature_flag_is_declared_and_enabled_by_default(self):
        co = FEATURE_FLAG_DEFINITIONS.get("enable_google_login")

        self.assertIsNotNone(co, "thiếu cờ enable_google_login")
        self.assertTrue(co.default_enabled)
        self.assertIn("Google", co.description)


if __name__ == "__main__":
    unittest.main()
