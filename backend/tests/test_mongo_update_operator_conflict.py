"""Chặn lỗi `ConflictingUpdateOperators` ngay từ mã nguồn.

MongoDB thật từ chối một lệnh update ghi cùng một trường bằng hai toán tử
khác nhau (ví dụ `schema_version` nằm cả trong `$set` lẫn `$setOnInsert`) và
trả về `ConflictingUpdateOperators`. **mongomock chấp nhận lệnh đó**, nên
toàn bộ test dùng mongomock vẫn xanh trong khi tính năng chết hẳn trên máy
thật — đúng kiểu lỗi chỉ lộ ra lúc demo.

Đã dính hai lần: `upsert_graph_edge` (evidence_chunk_ids) và
`upsert_learning_session` (schema_version). Lần thứ hai chặn **mọi** sự kiện
học tập, tức là chặn cả chuỗi cá nhân hoá. Thay vì chờ lần thứ ba, test này
quét tĩnh toàn bộ `app/` và chỉ thẳng ra vị trí.
"""

import ast
import pathlib
import unittest

APP_ROOT = pathlib.Path(__file__).resolve().parents[1] / "app"

# Các cặp toán tử mà MongoDB không cho ghi trùng đường dẫn.
CONFLICTING_PAIRS = [
    ("$set", "$setOnInsert"),
    ("$set", "$addToSet"),
    ("$set", "$inc"),
    ("$set", "$push"),
    ("$set", "$unset"),
    ("$setOnInsert", "$addToSet"),
    ("$setOnInsert", "$inc"),
    ("$setOnInsert", "$push"),
]


def _operator_fields(node: ast.Dict) -> dict[str, set[str]]:
    """Trích các khoá hằng nằm dưới từng toán tử `$...` của một dict literal."""
    operators: dict[str, set[str]] = {}
    for key, value in zip(node.keys, node.values):
        if not (isinstance(key, ast.Constant) and isinstance(key.value, str)):
            continue
        if not key.value.startswith("$") or not isinstance(value, ast.Dict):
            continue
        operators[key.value] = {
            inner.value
            for inner in value.keys
            if isinstance(inner, ast.Constant) and isinstance(inner.value, str)
        }
    return operators


def find_conflicts() -> list[str]:
    conflicts: list[str] = []
    for path in sorted(APP_ROOT.rglob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Dict):
                continue
            operators = _operator_fields(node)
            for first, second in CONFLICTING_PAIRS:
                if first not in operators or second not in operators:
                    continue
                overlap = operators[first] & operators[second]
                if overlap:
                    relative = path.relative_to(APP_ROOT.parent)
                    conflicts.append(
                        f"{relative}:{node.lineno} — {first} và {second} cùng ghi "
                        f"{sorted(overlap)}"
                    )
    return conflicts


class UpdateOperatorConflictTests(unittest.TestCase):
    def test_no_update_document_writes_one_field_with_two_operators(self):
        conflicts = find_conflicts()

        self.assertEqual(
            conflicts,
            [],
            "MongoDB thật sẽ trả ConflictingUpdateOperators ở những chỗ sau "
            "(mongomock không bắt được):\n  " + "\n  ".join(conflicts),
        )

    def test_the_scanner_actually_detects_a_known_conflict(self):
        """Test quét chỉ có giá trị nếu nó thật sự phát hiện được lỗi."""
        source = ast.parse(
            'update = {"$set": {"a": 1, "schema_version": 2},'
            ' "$setOnInsert": {"schema_version": 2}}'
        )
        dict_node = next(n for n in ast.walk(source) if isinstance(n, ast.Dict) and n.keys
                         and getattr(n.keys[0], "value", None) == "$set")

        operators = _operator_fields(dict_node)

        self.assertEqual(operators["$set"] & operators["$setOnInsert"], {"schema_version"})


if __name__ == "__main__":
    unittest.main()
