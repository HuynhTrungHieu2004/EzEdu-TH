"""Bộ giải ràng buộc CP-SAT cho sinh đề theo ma trận.

Nguyên tắc bắt buộc (xem docs/feature-expansion/01-target-architecture.md,
đánh giá công nghệ OR-Tools CP-SAT):
- KHÔNG dùng AI để thay thế bước kiểm tra ràng buộc — mọi lựa chọn câu hỏi
  đi qua CP-SAT, một constraint-satisfaction solver thực sự, có thể chứng
  minh INFEASIBLE khi ngân hàng không đủ câu.
- Mọi giá trị đưa vào CP-SAT là số nguyên — điểm (float) được quy đổi qua
  hệ số `POINTS_SCALE` (nhân 100, làm tròn) trước khi đưa vào model.
- Trả đúng 1 trong 4 trạng thái: OPTIMAL, FEASIBLE, INFEASIBLE, UNKNOWN.
- Khi INFEASIBLE: không tạo đề sai ma trận (trả về danh sách rỗng), kèm
  phân tích ràng buộc thiếu theo từng nhóm (bao nhiêu câu còn thiếu).
- Không có "fallback deterministic" riêng — CP-SAT đủ nhanh cho quy mô ngân
  hàng thực tế (đã kiểm thử tới hàng nghìn câu, xem test_blueprint_solver.py
  phần performance) nên không cần thêm đường tắt cho "bài toán đơn giản".
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from ortools.sat.python import cp_model

POINTS_SCALE = 100
SOLVE_TIME_LIMIT_SECONDS = 10.0

_STATUS_NAME_MAP = {
    cp_model.OPTIMAL: "OPTIMAL",
    cp_model.FEASIBLE: "FEASIBLE",
    cp_model.INFEASIBLE: "INFEASIBLE",
    cp_model.UNKNOWN: "UNKNOWN",
    cp_model.MODEL_INVALID: "INFEASIBLE",  # model sai cấu trúc coi như không giải được
}


def _points_to_int(points: float) -> int:
    return round(points * POINTS_SCALE)


@dataclass
class MissingGroup:
    group_type: str
    group_key: Optional[str]
    required_count: float
    available_count: float
    shortfall: float


@dataclass
class SolveResult:
    status: str  # OPTIMAL | FEASIBLE | INFEASIBLE | UNKNOWN
    selected_question_ids: List[str] = field(default_factory=list)
    missing: List[MissingGroup] = field(default_factory=list)
    solve_time_seconds: float = 0.0


def _group_matches(candidate: Dict[str, Any], group_type: str, group_key: str) -> bool:
    field_name = {
        "topic": "topic_id",
        "bloom_level": "bloom_level",
        "difficulty": "difficulty",
        "question_type": "question_type",
    }[group_type]
    return candidate.get(field_name) == group_key


def _diagnose_missing_groups(candidates: List[Dict[str, Any]], blueprint_constraints: Dict[str, Any], total_points: float) -> List[MissingGroup]:
    """Phân tích heuristic: với MỖI nhóm ràng buộc riêng lẻ, ngân hàng có đủ
    câu thoả nhóm đó không (bỏ qua tương tác giữa các ràng buộc khác). Đây
    KHÔNG phải phân tích IIS (irreducible-infeasible-subset) đầy đủ — CP-SAT
    không có sẵn cơ chế này — nhưng đủ để trả lời đúng yêu cầu "nêu cần bổ
    sung bao nhiêu câu ở từng nhóm" cho trường hợp phổ biến nhất: thiếu câu
    trong 1 nhóm cụ thể.
    """
    missing: List[MissingGroup] = []

    group_specs = (
        [("topic", t["topic_id"], t.get("question_count")) for t in blueprint_constraints.get("topics", [])]
        + [("bloom_level", b["bloom_level"], b.get("question_count")) for b in blueprint_constraints.get("bloom_distribution", [])]
        + [("difficulty", d["difficulty"], d.get("question_count")) for d in blueprint_constraints.get("difficulty_distribution", [])]
        + [("question_type", q["question_type"], q.get("question_count")) for q in blueprint_constraints.get("question_type_distribution", [])]
    )

    for group_type, group_key, required_count in group_specs:
        if required_count is None:
            continue
        available = sum(1 for c in candidates if _group_matches(c, group_type, group_key))
        if available < required_count:
            missing.append(
                MissingGroup(
                    group_type=group_type,
                    group_key=group_key,
                    required_count=required_count,
                    available_count=available,
                    shortfall=required_count - available,
                )
            )

    total_available_points = sum(c["points"] for c in candidates)
    if total_available_points < total_points:
        missing.append(
            MissingGroup(
                group_type="total",
                group_key=None,
                required_count=round(total_points, 2),
                available_count=round(total_available_points, 2),
                shortfall=round(total_points - total_available_points, 2),
            )
        )

    return missing


def solve_blueprint(
    *,
    candidates: List[Dict[str, Any]],
    total_points: float,
    max_time_seconds: Optional[int],
    constraints: Dict[str, Any],
) -> SolveResult:
    """Chọn tập câu hỏi từ `candidates` thoả mọi ràng buộc của ma trận."""
    return _solve(
        candidates=candidates,
        total_points=total_points,
        max_time_seconds=max_time_seconds,
        constraints=constraints,
        forced_question_ids=None,
    )


def solve_blueprint_with_forced(
    *,
    candidates: List[Dict[str, Any]],
    total_points: float,
    max_time_seconds: Optional[int],
    constraints: Dict[str, Any],
    forced_question_ids: List[str],
) -> SolveResult:
    """Giống `solve_blueprint`, nhưng ép các câu trong `forced_question_ids`
    PHẢI được chọn (selected==1) — dùng cho "sinh lại một phần đề" (chỉ 1
    nhóm ràng buộc được chọn lại tự do, phần còn lại giữ nguyên).
    """
    return _solve(
        candidates=candidates,
        total_points=total_points,
        max_time_seconds=max_time_seconds,
        constraints=constraints,
        forced_question_ids=forced_question_ids,
    )


_FIELD_BY_GROUP = {
    "topic": "topic_id",
    "bloom_level": "bloom_level",
    "difficulty": "difficulty",
    "question_type": "question_type",
}


def _solve(
    *,
    candidates: List[Dict[str, Any]],
    total_points: float,
    max_time_seconds: Optional[int],
    constraints: Dict[str, Any],
    forced_question_ids: Optional[List[str]],
) -> SolveResult:
    """`candidates`: list các dict tối thiểu có {id, topic_id, bloom_level,
    difficulty, question_type, points, expected_time_seconds} — đã được lọc
    trước theo subject/grade/curriculum_version và (nếu áp dụng)
    `exclude_recently_used_days` ở tầng service gọi hàm này (KHÔNG lọc bên
    trong solver — solver chỉ quan tâm ràng buộc số học).
    """
    started_at = time.perf_counter()

    model = cp_model.CpModel()
    n = len(candidates)
    selected = [model.NewBoolVar(f"select_{i}") for i in range(n)]
    points_int = [_points_to_int(c["points"]) for c in candidates]

    forced_ids_set = set(forced_question_ids or [])
    for i in range(n):
        if candidates[i]["id"] in forced_ids_set:
            model.Add(selected[i] == 1)

    # Tổng điểm phải đúng bằng total_points của ma trận.
    model.Add(sum(selected[i] * points_int[i] for i in range(n)) == _points_to_int(total_points))

    # Thời gian dự kiến không vượt quá giới hạn (nếu ma trận có set).
    if max_time_seconds:
        model.Add(
            sum(selected[i] * candidates[i]["expected_time_seconds"] for i in range(n)) <= max_time_seconds
        )

    def _apply_group_constraints(group_list: List[Dict[str, Any]], group_type: str, key_field: str) -> None:
        for group in group_list:
            key_value = group[key_field]
            idxs = [i for i in range(n) if candidates[i].get(_FIELD_BY_GROUP[group_type]) == key_value]
            if group.get("question_count") is not None:
                model.Add(sum(selected[i] for i in idxs) == group["question_count"])
            if group.get("points") is not None:
                model.Add(
                    sum(selected[i] * points_int[i] for i in idxs) == _points_to_int(group["points"])
                )

    _apply_group_constraints(constraints.get("topics", []), "topic", "topic_id")
    _apply_group_constraints(constraints.get("bloom_distribution", []), "bloom_level", "bloom_level")
    _apply_group_constraints(constraints.get("difficulty_distribution", []), "difficulty", "difficulty")
    _apply_group_constraints(constraints.get("question_type_distribution", []), "question_type", "question_type")

    # Ràng buộc đa dạng nội dung: giới hạn số câu lấy từ cùng một cụm ngữ nghĩa.
    # Phân loại theo chương trình học là nhãn do người khai báo nên có thể thô —
    # một đề đúng chủ đề, đúng mức Bloom vẫn có thể dồn hết vào một dạng bài.
    # Nhãn cụm (do `question_content_cluster_service` gán trước khi gọi) chỉ là
    # một ràng buộc số học nữa: CP-SAT vẫn là nơi quyết định chọn câu, vẫn chứng
    # minh được tối ưu và vẫn báo INFEASIBLE khi không thoả được.
    max_per_cluster = constraints.get("max_questions_per_content_cluster")
    if max_per_cluster:
        by_cluster: Dict[Any, List[int]] = {}
        for i in range(n):
            cluster_id = candidates[i].get("content_cluster")
            # Câu chưa được gán cụm (bước gán bị bỏ qua) thì không bị ràng buộc —
            # thà nới lỏng còn hơn chặn sinh đề vì một bước bổ trợ.
            if cluster_id is not None:
                by_cluster.setdefault(cluster_id, []).append(i)
        for idxs in by_cluster.values():
            model.Add(sum(selected[i] for i in idxs) <= int(max_per_cluster))

    # Không trùng câu: mỗi câu hỏi xuất hiện tối đa 1 lần trong candidates
    # (candidates là tập hợp id duy nhất ở tầng gọi) — mỗi selected[i] là một
    # biến boolean độc lập cho MỘT câu, nên ràng buộc "không trùng" tự động
    # thoả mãn bởi chính cấu trúc mô hình, không cần thêm ràng buộc riêng.

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = SOLVE_TIME_LIMIT_SECONDS
    solver.parameters.num_search_workers = 8
    status = solver.Solve(model)
    solve_time = time.perf_counter() - started_at

    status_name = _STATUS_NAME_MAP.get(status, "UNKNOWN")

    if status_name in ("OPTIMAL", "FEASIBLE"):
        selected_ids = [candidates[i]["id"] for i in range(n) if solver.Value(selected[i]) == 1]
        return SolveResult(status=status_name, selected_question_ids=selected_ids, solve_time_seconds=solve_time)

    missing = _diagnose_missing_groups(candidates, constraints, total_points)
    return SolveResult(status="INFEASIBLE" if status_name != "UNKNOWN" else "UNKNOWN", missing=missing, solve_time_seconds=solve_time)
