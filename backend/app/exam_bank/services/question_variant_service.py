"""Generate deterministic question variants from explicit, reviewable templates."""

from __future__ import annotations

import ast
import operator
import random
from typing import Any, Dict, List


_BIN_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}
_UNARY_OPS = {ast.UAdd: operator.pos, ast.USub: operator.neg}


def _safe_eval(expression: str, variables: Dict[str, int]) -> int:
    def evaluate(node: ast.AST) -> int:
        if isinstance(node, ast.Expression):
            return evaluate(node.body)
        if isinstance(node, ast.Constant) and isinstance(node.value, int):
            return int(node.value)
        if isinstance(node, ast.Name) and node.id in variables:
            return int(variables[node.id])
        if isinstance(node, ast.BinOp) and type(node.op) in _BIN_OPS:
            left = evaluate(node.left)
            right = evaluate(node.right)
            if isinstance(node.op, ast.Pow) and (abs(right) > 4 or abs(left) > 10_000):
                raise ValueError("Luỹ thừa vượt giới hạn an toàn.")
            return int(_BIN_OPS[type(node.op)](left, right))
        if isinstance(node, ast.UnaryOp) and type(node.op) in _UNARY_OPS:
            return int(_UNARY_OPS[type(node.op)](evaluate(node.operand)))
        raise ValueError("Biểu thức mẫu chứa toán tử không được hỗ trợ.")

    try:
        parsed = ast.parse(expression, mode="eval")
        value = evaluate(parsed)
    except (SyntaxError, ZeroDivisionError, OverflowError) as exc:
        raise ValueError("Biểu thức mẫu không hợp lệ.") from exc
    if abs(value) > 1_000_000_000:
        raise ValueError("Kết quả mẫu vượt giới hạn an toàn.")
    return value


def build_verified_variants(
    template_question: Dict[str, Any], *, needed: int, seed: int
) -> List[Dict[str, Any]]:
    if needed <= 0:
        return []
    template = template_question.get("parameter_template")
    if not isinstance(template, dict):
        return []

    variable_specs = template.get("variables")
    content_template = template.get("content_template")
    answer_expression = template.get("answer_expression")
    if not isinstance(variable_specs, dict) or not variable_specs:
        raise ValueError("Mẫu phải khai báo ít nhất một biến.")
    if not isinstance(content_template, str) or not isinstance(answer_expression, str):
        raise ValueError("Mẫu thiếu nội dung hoặc biểu thức đáp án.")

    rng = random.Random(seed)
    variants: List[Dict[str, Any]] = []
    seen_content: set[str] = set()
    max_attempts = max(needed * 20, 40)

    for _ in range(max_attempts):
        variables: Dict[str, int] = {}
        for name, spec in variable_specs.items():
            if not isinstance(name, str) or not name.isidentifier() or not isinstance(spec, dict):
                raise ValueError("Khai báo biến không hợp lệ.")
            lower = int(spec.get("min"))
            upper = int(spec.get("max"))
            if lower > upper or upper - lower > 10_000:
                raise ValueError("Khoảng giá trị biến không hợp lệ.")
            variables[name] = rng.randint(lower, upper)

        try:
            content = content_template.format(**variables).strip()
        except (KeyError, ValueError) as exc:
            raise ValueError("Nội dung mẫu tham chiếu biến không hợp lệ.") from exc
        if not content or content in seen_content:
            continue

        verified_answer = str(_safe_eval(answer_expression, variables))
        option_expressions = template.get("option_expressions") or {}
        options = None
        correct_answer = verified_answer
        if option_expressions:
            if not isinstance(option_expressions, dict):
                raise ValueError("Danh sách biểu thức phương án không hợp lệ.")
            options = {
                key: str(_safe_eval(str(expression), variables))
                for key, expression in option_expressions.items()
            }
            correct_answer = str(template.get("correct_option") or "")
            if correct_answer not in options or options[correct_answer] != verified_answer:
                raise ValueError("Phương án đúng không khớp biểu thức đáp án.")

        variant = {
            key: template_question.get(key)
            for key in (
                "subject_id",
                "grade",
                "curriculum_version",
                "chapter_id",
                "topic_id",
                "learning_outcome_id",
                "bloom_level",
                "difficulty",
                "question_type",
                "points",
                "expected_time_seconds",
                "explanation",
                "owner_id",
            )
        }
        variant.update(
            {
                "content": content,
                "options": options,
                "correct_answer": correct_answer,
                "verified_answer": verified_answer,
                "auto_verified": True,
                "variant_variables": variables,
                "source_template_id": str(template_question.get("_id", "")),
            }
        )
        variants.append(variant)
        seen_content.add(content)
        if len(variants) >= needed:
            break

    return variants

