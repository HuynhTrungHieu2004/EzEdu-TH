import unittest

from app.exam_bank.services.blueprint_solver_service import solve_blueprint


def q(qid: str, cluster: int, points: float = 1.0) -> dict:
    return {
        "id": qid,
        "topic_id": "T1",
        "bloom_level": "understand",
        "difficulty": "medium",
        "question_type": "multiple_choice",
        "points": points,
        "expected_time_seconds": 60,
        "content_cluster": cluster,
    }


# 9 câu, cùng chủ đề/Bloom/độ khó — ma trận truyền thống không phân biệt được.
# Nhưng chúng thuộc 3 cụm nội dung khác nhau.
CANDIDATES = [
    q("a1", 0), q("a2", 0), q("a3", 0),
    q("b1", 1), q("b2", 1), q("b3", 1),
    q("c1", 2), q("c2", 2), q("c3", 2),
]


def cluster_of(qid: str) -> int:
    return next(c["content_cluster"] for c in CANDIDATES if c["id"] == qid)


class BlueprintClusterConstraintTests(unittest.TestCase):
    def test_without_constraint_exam_may_pile_into_one_cluster(self):
        """Không có ràng buộc thì bộ giải được tự do — không đảm bảo đa dạng."""
        result = solve_blueprint(
            candidates=CANDIDATES,
            total_points=3.0,
            max_time_seconds=None,
            constraints={},
        )

        self.assertIn(result.status, ("OPTIMAL", "FEASIBLE"))
        self.assertEqual(len(result.selected_question_ids), 3)

    def test_constraint_forces_questions_across_clusters(self):
        result = solve_blueprint(
            candidates=CANDIDATES,
            total_points=3.0,
            max_time_seconds=None,
            constraints={"max_questions_per_content_cluster": 1},
        )

        self.assertIn(result.status, ("OPTIMAL", "FEASIBLE"))
        clusters = [cluster_of(qid) for qid in result.selected_question_ids]
        self.assertEqual(len(set(clusters)), 3)

    def test_constraint_caps_each_cluster_at_the_given_number(self):
        result = solve_blueprint(
            candidates=CANDIDATES,
            total_points=6.0,
            max_time_seconds=None,
            constraints={"max_questions_per_content_cluster": 2},
        )

        self.assertIn(result.status, ("OPTIMAL", "FEASIBLE"))
        clusters = [cluster_of(qid) for qid in result.selected_question_ids]
        for cluster_id in set(clusters):
            self.assertLessEqual(clusters.count(cluster_id), 2)

    def test_impossible_constraint_reports_infeasible_not_a_wrong_exam(self):
        """Yêu cầu 9 câu nhưng mỗi cụm tối đa 1 -> không thể. Bộ giải phải báo
        INFEASIBLE chứ không được trả về một đề sai ma trận."""
        result = solve_blueprint(
            candidates=CANDIDATES,
            total_points=9.0,
            max_time_seconds=None,
            constraints={"max_questions_per_content_cluster": 1},
        )

        self.assertEqual(result.status, "INFEASIBLE")
        self.assertEqual(result.selected_question_ids, [])

    def test_candidates_without_cluster_labels_are_unconstrained(self):
        """Khi bước gán cụm bị bỏ qua, sinh đề vẫn phải chạy bình thường."""
        unlabelled = [{k: v for k, v in c.items() if k != "content_cluster"} for c in CANDIDATES]

        result = solve_blueprint(
            candidates=unlabelled,
            total_points=3.0,
            max_time_seconds=None,
            constraints={"max_questions_per_content_cluster": 1},
        )

        self.assertIn(result.status, ("OPTIMAL", "FEASIBLE"))
        self.assertEqual(len(result.selected_question_ids), 3)

    def test_constraint_combines_with_existing_matrix_constraints(self):
        mixed = [
            q("e1", 0), q("e2", 0), q("e3", 0),
            q("h1", 1), q("h2", 1), q("h3", 1),
        ]
        for item in mixed[:3]:
            item["difficulty"] = "easy"
        for item in mixed[3:]:
            item["difficulty"] = "hard"

        result = solve_blueprint(
            candidates=mixed,
            total_points=4.0,
            max_time_seconds=None,
            constraints={
                "difficulty_distribution": [
                    {"difficulty": "easy", "question_count": 2},
                    {"difficulty": "hard", "question_count": 2},
                ],
                "max_questions_per_content_cluster": 2,
            },
        )

        self.assertIn(result.status, ("OPTIMAL", "FEASIBLE"))
        self.assertEqual(len(result.selected_question_ids), 4)


if __name__ == "__main__":
    unittest.main()
