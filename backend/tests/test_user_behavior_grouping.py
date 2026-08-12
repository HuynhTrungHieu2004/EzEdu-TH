import unittest
from datetime import datetime, timedelta, timezone

from app.services.user_behavior_service import (
    analyze_user_behavior_groups,
    build_user_behavior_profiles,
)

BASE = datetime(2026, 8, 1, 9, 0, tzinfo=timezone.utc)


def log(user_id: str, day: int, action: str, status: str = "success", duration: int = 200) -> dict:
    return {
        "user_id": user_id,
        "action": action,
        "status": status,
        "duration_ms": duration,
        "timestamp": BASE + timedelta(days=day),
    }


def make_logs() -> list[dict]:
    logs: list[dict] = []
    # Nhóm dùng nhiều: hoạt động đều nhiều ngày, nhiều loại thao tác, ít lỗi.
    for uid in ("HEAVY1", "HEAVY2", "HEAVY3"):
        for day in range(6):
            logs.append(log(uid, day, "document_uploaded"))
            logs.append(log(uid, day, "question_generated"))
            logs.append(log(uid, day, "login_success"))
    # Nhóm dùng ít: một ngày, một loại thao tác.
    for uid in ("LIGHT1", "LIGHT2", "LIGHT3"):
        logs.append(log(uid, 0, "login_success"))
        logs.append(log(uid, 1, "login_success"))
    # Nhóm hay lỗi: hoạt động vừa phải nhưng phần lớn thất bại.
    for uid in ("ERR1", "ERR2", "ERR3"):
        for day in range(3):
            logs.append(log(uid, day, "login_failed", status="failure"))
            logs.append(log(uid, day, "login_failed", status="failure"))
            logs.append(log(uid, day, "login_success"))
    return logs


LOGS = make_logs()


class BuildUserBehaviorProfilesTests(unittest.TestCase):
    def test_one_profile_per_user(self):
        profiles = build_user_behavior_profiles(LOGS)

        self.assertEqual(len(profiles), 9)

    def test_counts_activity_and_distinct_days(self):
        profiles = {p["user_id"]: p for p in build_user_behavior_profiles(LOGS)}

        heavy = profiles["HEAVY1"]
        self.assertEqual(heavy["metrics"]["activity_count"], 18)
        self.assertEqual(heavy["metrics"]["active_days"], 6)
        self.assertEqual(heavy["metrics"]["distinct_action_count"], 3)

    def test_error_rate_reflects_failed_actions(self):
        profiles = {p["user_id"]: p for p in build_user_behavior_profiles(LOGS)}

        self.assertAlmostEqual(profiles["ERR1"]["metrics"]["error_rate"], 6 / 9, places=4)
        self.assertEqual(profiles["HEAVY1"]["metrics"]["error_rate"], 0.0)

    def test_ignores_records_without_user_id(self):
        profiles = build_user_behavior_profiles(LOGS + [{"action": "x", "status": "success"}])

        self.assertEqual(len(profiles), 9)

    def test_merges_ai_usage_when_supplied(self):
        ai = [
            {"user_id": "HEAVY1", "total_tokens": 500, "estimated_cost": 0.01},
            {"user_id": "HEAVY1", "total_tokens": 300, "estimated_cost": 0.02},
        ]

        profiles = {p["user_id"]: p for p in build_user_behavior_profiles(LOGS, ai)}

        self.assertEqual(profiles["HEAVY1"]["metrics"]["ai_call_count"], 2)
        self.assertEqual(profiles["HEAVY1"]["metrics"]["ai_total_tokens"], 800)
        self.assertEqual(profiles["LIGHT1"]["metrics"]["ai_call_count"], 0)


class AnalyzeUserBehaviorGroupsTests(unittest.TestCase):
    def test_separates_the_behaviour_profiles(self):
        result = analyze_user_behavior_groups(LOGS)

        self.assertEqual(result["status"], "ok")
        by_user = {u["user_id"]: u["cluster_id"] for u in result["users"]}
        self.assertEqual(by_user["HEAVY1"], by_user["HEAVY2"])
        self.assertEqual(by_user["LIGHT1"], by_user["LIGHT2"])
        self.assertNotEqual(by_user["HEAVY1"], by_user["LIGHT1"])

    def test_group_profile_reports_raw_averages_not_z_scores(self):
        """Toạ độ tâm cụm ở thang chuẩn hoá không đọc được — phải trả về số gốc."""
        result = analyze_user_behavior_groups(LOGS)

        heavy_group = next(g for g in result["groups"] if "HEAVY1" in g["user_ids"])
        self.assertAlmostEqual(heavy_group["profile"]["activity_count"], 18.0)
        self.assertAlmostEqual(heavy_group["profile"]["active_days"], 6.0)

    def test_drops_features_that_never_vary(self):
        result = analyze_user_behavior_groups(LOGS)

        # Không có dữ liệu AI -> các cột AI toàn 0, phải bị loại khỏi phân cụm.
        self.assertIn("ai_call_count", result["dropped_features"])
        self.assertNotIn("ai_call_count", result["features"])

    def test_reports_insufficient_users(self):
        result = analyze_user_behavior_groups([log("ONLY", 0, "login_success")])

        self.assertEqual(result["status"], "insufficient_users")
        self.assertEqual(result["groups"], [])

    def test_every_user_carries_anomaly_flag(self):
        result = analyze_user_behavior_groups(LOGS)

        for user in result["users"]:
            self.assertIn("is_anomalous", user)
            self.assertGreaterEqual(user["distance_to_centroid"], 0.0)

    def test_identical_users_degrade_without_crashing(self):
        uniform = [log(f"U{i}", 0, "login_success") for i in range(6)]

        result = analyze_user_behavior_groups(uniform)

        self.assertIn(result["status"], {"ok", "clustering_unavailable"})
        self.assertEqual(len(result["users"]), 6)


if __name__ == "__main__":
    unittest.main()
