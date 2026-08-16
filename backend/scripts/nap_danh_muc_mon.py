"""Nạp danh mục môn học phổ thông vào `curriculum_taxonomy`.

Tính năng "Học theo môn" cần cây môn → chương thì ô chọn của giáo viên mới có gì
để chọn. Chưa nạp thì mọi học liệu rơi vào nhóm "Chưa phân môn".

CHẠY LẠI ĐƯỢC NHIỀU LẦN: script khớp theo (node_type, name, parent_id) nên chạy
hai lần không nhân đôi danh mục. Đây không phải chuyện gọn gàng — chạy nhầm lần
hai mà tạo ra hai môn "Toán" thì mục lục của học sinh có hai thẻ giống hệt nhau
và không cách nào biết bài nào thuộc thẻ nào.

Dùng:
    python -m scripts.nap_danh_muc_mon              # nạp
    python -m scripts.nap_danh_muc_mon --xem-truoc  # chỉ in ra, không ghi
"""

from __future__ import annotations

import argparse
import asyncio
import os
import ssl
from datetime import datetime, timezone

import certifi
from motor.motor_asyncio import AsyncIOMotorClient

# Chương trình GDPT 2018. Chỉ liệt kê chương cho các môn hay dùng nhất; môn còn
# lại để trống chương — giáo viên gắn ở mức môn cũng đã đủ dùng, và một danh mục
# chương bịa ra cho đủ còn tệ hơn không có.
DANH_MUC: dict[str, list[str]] = {
    "Toán": [
        "Mệnh đề và tập hợp",
        "Hàm số và đồ thị",
        "Hàm số bậc hai",
        "Hệ thức lượng trong tam giác",
        "Vectơ",
        "Thống kê và xác suất",
        "Đạo hàm",
        "Nguyên hàm và tích phân",
    ],
    "Ngữ văn": [
        "Truyện ngắn",
        "Thơ",
        "Kịch",
        "Văn nghị luận",
        "Tiếng Việt",
        "Viết",
    ],
    "Tiếng Anh": [
        "Ngữ pháp",
        "Từ vựng",
        "Đọc hiểu",
        "Nghe",
        "Viết",
    ],
    "Vật lí": [
        "Động học",
        "Động lực học",
        "Năng lượng",
        "Điện học",
        "Từ trường",
        "Vật lí hạt nhân",
    ],
    "Hoá học": [
        "Cấu tạo nguyên tử",
        "Bảng tuần hoàn",
        "Liên kết hoá học",
        "Phản ứng oxi hoá khử",
        "Hoá học hữu cơ",
    ],
    "Sinh học": [
        "Tế bào",
        "Trao đổi chất",
        "Di truyền",
        "Tiến hoá",
        "Sinh thái",
    ],
    "Lịch sử": [],
    "Địa lí": [],
    "Tin học": [],
    "Giáo dục kinh tế và pháp luật": [],
}


def _ket_noi() -> AsyncIOMotorClient:
    uri = os.environ.get("MONGODB_URI")
    if not uri:
        raise SystemExit("Thiếu biến môi trường MONGODB_URI.")
    # macOS thiếu bộ chứng chỉ hệ thống mà driver cần; không truyền certifi thì
    # kết nối Atlas hỏng bằng CERTIFICATE_VERIFY_FAILED.
    return AsyncIOMotorClient(uri, tlsCAFile=certifi.where() if uri.startswith("mongodb+srv") else None)


async def _tim_hoac_tao(db, *, node_type: str, name: str, parent_id: str | None, xem_truoc: bool) -> tuple[str | None, bool]:
    """Trả `(id, vừa_tạo)`. Khớp theo đúng bộ ba định danh một node."""
    da_co = await db["curriculum_taxonomy"].find_one(
        {"node_type": node_type, "name": name, "parent_id": parent_id}
    )
    if da_co is not None:
        return str(da_co["_id"]), False
    if xem_truoc:
        return None, True

    now = datetime.now(timezone.utc)
    ket_qua = await db["curriculum_taxonomy"].insert_one({
        "node_type": node_type,
        "name": name,
        "parent_id": parent_id,
        "grade": None,
        "curriculum_version": "GDPT 2018",
        "created_by": "script:nap_danh_muc_mon",
        "created_at": now,
        "updated_at": now,
    })
    return str(ket_qua.inserted_id), True


async def chay(xem_truoc: bool) -> None:
    client = _ket_noi()
    db = client[os.environ.get("MONGODB_DB_NAME", "chuyende02")]

    them_mon = them_chuong = bo_qua = 0
    try:
        for ten_mon, cac_chuong in DANH_MUC.items():
            mon_id, moi = await _tim_hoac_tao(
                db, node_type="subject", name=ten_mon, parent_id=None, xem_truoc=xem_truoc
            )
            if moi:
                them_mon += 1
                print(f"  + môn   {ten_mon}")
            else:
                bo_qua += 1

            for ten_chuong in cac_chuong:
                if mon_id is None:
                    # Chỉ xảy ra ở chế độ xem trước, khi môn cha chưa tồn tại.
                    print(f"      + chương {ten_chuong}  (sau khi tạo môn {ten_mon})")
                    them_chuong += 1
                    continue
                _, moi_chuong = await _tim_hoac_tao(
                    db, node_type="chapter", name=ten_chuong, parent_id=mon_id, xem_truoc=xem_truoc
                )
                if moi_chuong:
                    them_chuong += 1
                    print(f"      + chương {ten_chuong}")
                else:
                    bo_qua += 1

        dau = "SẼ THÊM" if xem_truoc else "ĐÃ THÊM"
        print(f"\n{dau}: {them_mon} môn, {them_chuong} chương. Bỏ qua vì đã có: {bo_qua}.")
    finally:
        client.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Nạp danh mục môn học vào curriculum_taxonomy.")
    parser.add_argument("--xem-truoc", action="store_true", help="Chỉ in ra, không ghi vào cơ sở dữ liệu.")
    args = parser.parse_args()
    asyncio.run(chay(args.xem_truoc))


if __name__ == "__main__":
    main()
