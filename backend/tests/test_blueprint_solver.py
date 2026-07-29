import time
import unittest

from app.exam_bank.services.blueprint_solver_service import solve_blueprint, solve_blueprint_with_forced


def _make_candidate(id_, *, topic_id="t1", bloom_level="remember", difficulty="easy", question_type="multiple_choice", points=1.0, expected_time_seconds=60):
    return {
        "id": id_,
        "topic_id": topic_id,
        "bloom_level": bloom_level,
        "difficulty": difficulty,
        "question_type": question_type,
        "points": points,
        "expected_time_seconds": expected_time_seconds,
    }


class BlueprintSolverValidTests(unittest.TestCase):
    """Ma trận hợp lệ — ngân hàng đủ câu, ràng buộc thoả mãn được."""

    def test_simple_valid_blueprint_returns_optimal_or_feasible(self):
        candidates = [_make_candidate(f"q{i}", points=1.0) for i in range(10)]
        result = solve_blueprint(
            candidates=candidates,
            total_points=5.0,
            max_time_seconds=None,
            constraints={},
        )
        self.assertIn(result.status, ("OPTIMAL", "FEASIBLE"))
        self.assertEqual(len(result.selected_question_ids), 5)
        self.assertEqual(len(set(result.selected_question_ids)), 5)  # không trùng câu

    def test_topic_and_bloom_constraints_satisfied_together(self):
        candidates = [
            _make_candidate("q1", topic_id="algebra", bloom_level="remember", points=1.0),
            _make_candidate("q2", topic_id="algebra", bloom_level="understand", points=1.0),
            _make_candidate("q3", topic_id="geometry", bloom_level="remember", points=1.0),
            _make_candidate("q4", topic_id="geometry", bloom_level="apply", points=1.0),
        ]
        result = solve_blueprint(
            candidates=candidates,
            total_points=2.0,
            max_time_seconds=None,
            constraints={
                "topics": [{"topic_id": "algebra", "question_count": 1}],
                "bloom_distribution": [{"bloom_level": "remember", "question_count": 1}],
            },
        )
        self.assertIn(result.status, ("OPTIMAL", "FEASIBLE"))
        selected = set(result.selected_question_ids)
        self.assertEqual(len(selected), 2)
        # Đúng 1 câu algebra và đúng 1 câu remember trong tập được chọn.
        selected_docs = [c for c in candidates if c["id"] in selected]
        self.assertEqual(sum(1 for d in selected_docs if d["topic_id"] == "algebra"), 1)
        self.assertEqual(sum(1 for d in selected_docs if d["bloom_level"] == "remember"), 1)

    def test_max_time_seconds_constraint_respected(self):
        candidates = [_make_candidate(f"q{i}", points=1.0, expected_time_seconds=100) for i in range(5)]
        result = solve_blueprint(
            candidates=candidates,
            total_points=3.0,
            max_time_seconds=250,  # tối đa 2 câu (mỗi câu 100s) hoặc ít hơn — nhưng cần 3 câu điểm
            constraints={},
        )
        # 3 câu x 100s = 300s > 250s giới hạn → không thể chọn 3 câu bất kỳ thoả cả điểm lẫn thời gian
        self.assertEqual(result.status, "INFEASIBLE")


class BlueprintSolverInfeasibleTests(unittest.TestCase):
    """Ma trận không khả thi — phải trả INFEASIBLE kèm phân tích thiếu, KHÔNG được tạo đề sai ma trận."""

    def test_missing_questions_at_one_bloom_level(self):
        candidates = [_make_candidate(f"q{i}", bloom_level="remember", points=1.0) for i in range(5)]
        result = solve_blueprint(
            candidates=candidates,
            total_points=2.0,
            max_time_seconds=None,
            constraints={"bloom_distribution": [{"bloom_level": "analyze", "question_count": 2}]},
        )
        self.assertEqual(result.status, "INFEASIBLE")
        self.assertEqual(len(result.selected_question_ids), 0)  # KHÔNG tạo đề sai ma trận

        bloom_missing = [m for m in result.missing if m.group_type == "bloom_level" and m.group_key == "analyze"]
        self.assertEqual(len(bloom_missing), 1)
        self.assertEqual(bloom_missing[0].required_count, 2)
        self.assertEqual(bloom_missing[0].available_count, 0)
        self.assertEqual(bloom_missing[0].shortfall, 2)

    def test_wrong_total_points_reported_as_missing(self):
        candidates = [_make_candidate(f"q{i}", points=1.0) for i in range(3)]  # tối đa 3 điểm có sẵn
        result = solve_blueprint(
            candidates=candidates,
            total_points=10.0,  # yêu cầu nhiều hơn ngân hàng có thể cung cấp
            max_time_seconds=None,
            constraints={},
        )
        self.assertEqual(result.status, "INFEASIBLE")
        total_missing = [m for m in result.missing if m.group_type == "total"]
        self.assertEqual(len(total_missing), 1)
        self.assertGreater(total_missing[0].shortfall, 0)

    def test_not_enough_questions_in_topic(self):
        candidates = [_make_candidate("q1", topic_id="algebra", points=1.0)]
        result = solve_blueprint(
            candidates=candidates,
            total_points=3.0,
            max_time_seconds=None,
            constraints={"topics": [{"topic_id": "algebra", "question_count": 3}]},
        )
        self.assertEqual(result.status, "INFEASIBLE")
        topic_missing = [m for m in result.missing if m.group_type == "topic" and m.group_key == "algebra"]
        self.assertEqual(topic_missing[0].shortfall, 2)

    def test_duplicate_question_selection_impossible_by_construction(self):
        """Không có ràng buộc 'không trùng' riêng vì mỗi câu chỉ có 1 biến
        boolean — xác nhận solver không bao giờ trả về id trùng lặp."""
        candidates = [_make_candidate(f"q{i}", points=2.0) for i in range(3)]
        result = solve_blueprint(candidates=candidates, total_points=4.0, max_time_seconds=None, constraints={})
        self.assertEqual(len(result.selected_question_ids), len(set(result.selected_question_ids)))


class BlueprintSolverForcedTests(unittest.TestCase):
    """Sinh lại một phần đề (regenerate-section) — ép giữ nguyên câu ngoài nhóm mục tiêu."""

    def test_forced_questions_are_always_included(self):
        candidates = [_make_candidate(f"q{i}", topic_id="algebra" if i < 2 else "geometry", points=1.0) for i in range(6)]
        result = solve_blueprint_with_forced(
            candidates=candidates,
            total_points=3.0,
            max_time_seconds=None,
            constraints={"topics": [{"topic_id": "geometry", "question_count": 2}]},
            forced_question_ids=["q0"],
        )
        self.assertIn(result.status, ("OPTIMAL", "FEASIBLE"))
        self.assertIn("q0", result.selected_question_ids)


class BlueprintSolverPerformanceTests(unittest.TestCase):
    """Hiệu năng với ngân hàng lớn — CP-SAT phải giải trong thời gian hợp lý,
    không cần fallback deterministic riêng cho quy mô thực tế."""

    def test_solves_within_reasonable_time_for_large_bank(self):
        candidates = []
        topics = ["algebra", "geometry", "statistics", "calculus"]
        blooms = ["remember", "understand", "apply", "analyze"]
        for i in range(2000):
            candidates.append(
                _make_candidate(
                    f"q{i}",
                    topic_id=topics[i % len(topics)],
                    bloom_level=blooms[i % len(blooms)],
                    points=1.0,
                )
            )

        started = time.perf_counter()
        result = solve_blueprint(
            candidates=candidates,
            total_points=20.0,
            max_time_seconds=None,
            constraints={
                "topics": [{"topic_id": "algebra", "question_count": 5}, {"topic_id": "geometry", "question_count": 5}],
                "bloom_distribution": [{"bloom_level": "remember", "question_count": 5}, {"bloom_level": "understand", "question_count": 5}],
            },
        )
        elapsed = time.perf_counter() - started

        self.assertIn(result.status, ("OPTIMAL", "FEASIBLE"))
        self.assertLess(elapsed, 15.0, "Giải ma trận với 2000 câu ứng viên không được vượt quá 15s")


if __name__ == "__main__":
    unittest.main()
