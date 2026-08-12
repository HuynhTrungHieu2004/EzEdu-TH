import unittest

from app.services.class_grouping_service import (
    analyze_class_ability_groups,
    build_student_vectors,
)


def att(user_id: str, qs_id: str, percent: float) -> dict:
    return {"user_id": user_id, "question_set_id": qs_id, "percent": percent}


# 6 học sinh, 2 bộ đề.
#   Nhóm 1 (S1-S3): giỏi Hàm số, yếu Lượng giác.
#   Nhóm 2 (S4-S6): ngược lại.
ATTEMPTS = [
    att("S1", "HAMSO", 92), att("S1", "LUONGGIAC", 41),
    att("S2", "HAMSO", 88), att("S2", "LUONGGIAC", 45),
    att("S3", "HAMSO", 90), att("S3", "LUONGGIAC", 38),
    att("S4", "HAMSO", 40), att("S4", "LUONGGIAC", 91),
    att("S5", "HAMSO", 44), att("S5", "LUONGGIAC", 87),
    att("S6", "HAMSO", 37), att("S6", "LUONGGIAC", 93),
]
STUDENTS = ["S1", "S2", "S3", "S4", "S5", "S6"]


class BuildStudentVectorsTests(unittest.TestCase):
    def test_one_row_per_student_with_attempts(self):
        vectors, set_ids = build_student_vectors(ATTEMPTS, STUDENTS)

        self.assertEqual(len(vectors), 6)
        self.assertEqual(set_ids, ["HAMSO", "LUONGGIAC"])

    def test_repeated_attempts_are_averaged(self):
        attempts = [att("S1", "A", 40), att("S1", "A", 80)]

        vectors, _ = build_student_vectors(attempts, ["S1"])

        self.assertAlmostEqual(vectors[0]["scores"]["A"], 60.0)

    def test_student_without_attempts_is_excluded(self):
        vectors, _ = build_student_vectors(ATTEMPTS, STUDENTS + ["S_NEVER_TRIED"])

        self.assertNotIn("S_NEVER_TRIED", [v["user_id"] for v in vectors])

    def test_missing_set_is_filled_with_class_average(self):
        attempts = [att("S1", "A", 100), att("S2", "A", 50), att("S2", "B", 60)]

        vectors, set_ids = build_student_vectors(attempts, ["S1", "S2"])

        self.assertEqual(set_ids, ["A", "B"])
        s1 = next(v for v in vectors if v["user_id"] == "S1")
        # S1 chưa làm bộ B -> điền bằng trung bình lớp ở bộ B (60), và đánh dấu.
        self.assertAlmostEqual(s1["vector"][1], 60.0)
        self.assertIn("B", s1["imputed_set_ids"])


class AnalyzeClassAbilityGroupsTests(unittest.TestCase):
    def test_splits_the_two_opposite_profiles(self):
        result = analyze_class_ability_groups(ATTEMPTS, STUDENTS)

        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["clustering"]["selected_k"], 2)

        by_student = {s["user_id"]: s["cluster_id"] for s in result["students"]}
        self.assertEqual(by_student["S1"], by_student["S2"])
        self.assertEqual(by_student["S1"], by_student["S3"])
        self.assertEqual(by_student["S4"], by_student["S5"])
        self.assertNotEqual(by_student["S1"], by_student["S4"])

    def test_group_centroid_shows_where_the_group_is_weak(self):
        result = analyze_class_ability_groups(ATTEMPTS, STUDENTS)

        group_of_s1 = next(
            g for g in result["groups"]
            if "S1" in g["student_ids"]
        )
        # Tâm cụm phải đọc thẳng ra được: nhóm này mạnh Hàm số, yếu Lượng giác.
        self.assertGreater(group_of_s1["centroid"]["HAMSO"], 80)
        self.assertLess(group_of_s1["centroid"]["LUONGGIAC"], 50)
        self.assertEqual(group_of_s1["weakest_set_id"], "LUONGGIAC")

    def test_every_group_reports_its_size_and_members(self):
        result = analyze_class_ability_groups(ATTEMPTS, STUDENTS)

        self.assertEqual(sum(g["size"] for g in result["groups"]), 6)
        for group in result["groups"]:
            self.assertEqual(group["size"], len(group["student_ids"]))

    def test_reports_insufficient_students_when_too_few_have_attempted(self):
        result = analyze_class_ability_groups(ATTEMPTS[:2], ["S1"])

        self.assertEqual(result["status"], "insufficient_students")
        self.assertEqual(result["groups"], [])

    def test_students_carry_distance_to_their_centroid(self):
        result = analyze_class_ability_groups(ATTEMPTS, STUDENTS)

        for student in result["students"]:
            self.assertGreaterEqual(student["distance_to_centroid"], 0.0)
            self.assertIn("needs_attention", student)

    def test_uniform_class_degrades_without_crashing(self):
        uniform = [att(f"S{i}", "A", 70) for i in range(6)]

        result = analyze_class_ability_groups(uniform, [f"S{i}" for i in range(6)])

        self.assertIn(result["status"], {"ok", "clustering_unavailable"})
        self.assertEqual(len(result["students"]), 6)


if __name__ == "__main__":
    unittest.main()
