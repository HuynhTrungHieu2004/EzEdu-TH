"""Gom học liệu đã công bố thành mục lục theo môn cho học sinh.

Học sinh trước đây chỉ có một danh sách phẳng "bộ câu hỏi đã công bố" xếp theo
ngày, và một ô chat AI. Muốn ôn một môn thì phải tự lọc bằng mắt qua tên tài
liệu, hoặc hỏi AI từng câu — đúng điều một bạn học sinh phản ánh.

Module này KHÔNG import FastAPI: toàn bộ logic gom nhóm ở đây phải test được mà
không cần dựng request HTTP.

Cây phân loại `curriculum_taxonomy` (môn → chương → chủ đề → chuẩn cần đạt) đã có
sẵn và đang được ngân hàng đề dùng. Ở đây chỉ mượn hai tầng trên cùng.
"""

from __future__ import annotations

from typing import Any, Optional

from bson import ObjectId

#: Khoá của nhóm chứa học liệu chưa gắn môn.
#:
#: Bắt buộc phải có. Toàn bộ học liệu công bố trước tính năng này đều chưa có
#: môn; nếu mục lục chỉ hiện những gì đã gắn thì chúng biến mất khỏi tầm mắt học
#: sinh — tính năng mới lại làm mất nội dung cũ.
CHUA_PHAN_MON = "chua-phan-mon"
CHUA_PHAN_MON_TEN = "Chưa phân môn"


def _ten_node(node: Optional[dict]) -> Optional[str]:
    return node.get("name") if node else None


async def _doc_taxonomy(db, ids: set[str]) -> dict[str, dict]:
    """Đọc một lần các node được tham chiếu, trả map id -> doc."""
    hop_le = [ObjectId(i) for i in ids if ObjectId.is_valid(i)]
    if not hop_le:
        return {}
    ket: dict[str, dict] = {}
    async for node in db["curriculum_taxonomy"].find({"_id": {"$in": hop_le}}):
        ket[str(node["_id"])] = node
    return ket


async def build_catalog(db, mongo_filter: dict[str, Any]) -> list[dict]:
    """Gom các bộ câu hỏi khớp `mongo_filter` thành cây môn → chương.

    `mongo_filter` do nơi gọi dựng, và PHẢI đã chứa điều kiện hiển thị của học
    sinh (công bố cho tất cả, hoặc cho lớp em ấy). Hàm này cố ý không tự thêm
    điều kiện quyền: gom một chỗ thì dễ quên, và quên ở đây nghĩa là học sinh
    thấy đề của lớp khác.
    """
    cursor = db["question_sets"].find(
        mongo_filter,
        {"questions": 0, "keywords": 0, "validation_stats": 0},
    )
    rows = [item async for item in cursor]

    can_doc: set[str] = set()
    for row in rows:
        for khoa in ("subject_id", "chapter_id"):
            gia_tri = row.get(khoa)
            if gia_tri:
                can_doc.add(str(gia_tri))
    taxonomy = await _doc_taxonomy(db, can_doc)

    # môn -> { ten, chuong -> { ten, so_bo } }
    gom: dict[str, dict] = {}
    for row in rows:
        subject_id = str(row.get("subject_id") or "") or CHUA_PHAN_MON
        subject_ten = _ten_node(taxonomy.get(subject_id)) or CHUA_PHAN_MON_TEN

        mon = gom.setdefault(subject_id, {"id": subject_id, "name": subject_ten, "chapters": {}, "count": 0})
        mon["count"] += 1

        chapter_id = str(row.get("chapter_id") or "") or ""
        if not chapter_id:
            continue
        chuong = mon["chapters"].setdefault(
            chapter_id,
            {"id": chapter_id, "name": _ten_node(taxonomy.get(chapter_id)) or "Chương chưa đặt tên", "count": 0},
        )
        chuong["count"] += 1

    ket_qua = []
    for mon in gom.values():
        ket_qua.append({
            "id": mon["id"],
            "name": mon["name"],
            "count": mon["count"],
            "chapters": sorted(mon["chapters"].values(), key=lambda c: c["name"]),
        })

    # "Chưa phân môn" luôn xuống cuối: nó là chỗ chứa tạm, không phải một môn.
    # Xếp theo tên như các môn khác sẽ đẩy nó lên đầu vì chữ C.
    ket_qua.sort(key=lambda m: (m["id"] == CHUA_PHAN_MON, m["name"]))
    return ket_qua


async def validate_taxonomy_ids(
    db, *, subject_id: Optional[str], chapter_id: Optional[str]
) -> tuple[Optional[str], Optional[str]]:
    """Kiểm hai id trước khi ghi vào bộ câu hỏi.

    Trả về cặp đã chuẩn hoá. Ném `ValueError` kèm câu tiếng Việt khi sai — nơi
    gọi dịch sang HTTPException.

    Kiểm cả `node_type`: không có bước này thì gán nhầm id của một "chủ đề" vào
    ô môn học vẫn lọt, và mục lục sẽ mọc ra một "môn" tên là tên chủ đề.
    """
    if not subject_id and not chapter_id:
        return None, None

    if chapter_id and not subject_id:
        raise ValueError("Chọn chương thì phải chọn môn.")

    subject = None
    if subject_id:
        if not ObjectId.is_valid(subject_id):
            raise ValueError("Môn học không hợp lệ.")
        subject = await db["curriculum_taxonomy"].find_one({"_id": ObjectId(subject_id)})
        if subject is None or subject.get("node_type") != "subject":
            raise ValueError("Môn học không hợp lệ.")

    if chapter_id:
        if not ObjectId.is_valid(chapter_id):
            raise ValueError("Chương không hợp lệ.")
        chapter = await db["curriculum_taxonomy"].find_one({"_id": ObjectId(chapter_id)})
        if chapter is None or chapter.get("node_type") != "chapter":
            raise ValueError("Chương không hợp lệ.")
        # Chương phải thuộc đúng môn vừa chọn. Thiếu chốt này thì một chương của
        # môn Toán nằm dưới môn Văn trong mục lục, và không ai hiểu vì sao.
        if str(chapter.get("parent_id") or "") != str(subject_id):
            raise ValueError("Chương này không thuộc môn đã chọn.")

    return subject_id, chapter_id


async def list_subject_options(db) -> list[dict]:
    """Danh sách môn kèm chương, cho ô chọn lúc giáo viên công bố học liệu.

    Khác `build_catalog`: hàm kia chỉ trả những môn ĐANG CÓ nội dung (mục lục
    của học sinh), còn hàm này trả toàn bộ cây để giáo viên gắn nhãn — kể cả môn
    chưa có bài nào, vì bài đầu tiên phải gắn được vào đó.

    Không đi qua `/taxonomy` của ngân hàng đề: endpoint đó khoá sau cờ
    ENABLE_EXAM_BLUEPRINT, mà việc gắn môn cho học liệu không liên quan gì tới
    ma trận đề — tắt cờ đó là giáo viên hết gắn được môn.
    """
    nodes = [
        node
        async for node in db["curriculum_taxonomy"].find(
            {"node_type": {"$in": ["subject", "chapter"]}}, {"name": 1, "node_type": 1, "parent_id": 1}
        )
    ]
    mon = {
        str(n["_id"]): {"id": str(n["_id"]), "name": n.get("name", ""), "chapters": []}
        for n in nodes
        if n.get("node_type") == "subject"
    }
    for n in nodes:
        if n.get("node_type") != "chapter":
            continue
        cha = mon.get(str(n.get("parent_id") or ""))
        if cha is None:
            # Chương mồ côi (môn đã bị xoá): bỏ qua thay vì dựng một môn giả —
            # cho giáo viên gắn vào đó thì học liệu rơi vào hư không.
            continue
        cha["chapters"].append({"id": str(n["_id"]), "name": n.get("name", "")})

    ket = sorted(mon.values(), key=lambda m: m["name"])
    for m in ket:
        m["chapters"].sort(key=lambda c: c["name"])
    return ket
