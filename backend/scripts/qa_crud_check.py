"""Đối chiếu kết quả CRUD của `frontend/e2e/live-crud.spec.ts` với MongoDB.

Bộ kiểm giao diện chỉ chứng minh giao diện và API đồng ý với nhau. Script này đọc
thẳng CSDL để chứng minh dữ liệu thực sự đi hết ba lớp.

    QA_RUN_ID=123 npm run test:live            # bộ kiểm giao diện
    python scripts/qa_crud_check.py --phase created --run-id 123
    python scripts/qa_crud_check.py --phase updated --run-id 123
    python scripts/qa_crud_check.py --phase deleted --run-id 123
    python scripts/qa_crud_check.py --phase created --cleanup   # dọn mọi bản ghi QA CRUD

Thoát mã 1 nếu có mục nào sai, để chạy được trong chuỗi lệnh.
"""

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parent.parent))

from app.database.mongodb import close_mongo_connection, connect_to_mongo, get_database

# Bộ kiểm giao diện gắn mã lượt chạy vào tên để chạy lại được nhiều lần
# (email đã xoá mềm vẫn giữ chỗ trong chỉ mục duy nhất). Truyền cùng mã đó vào
# đây bằng --run-id.
def names(run_id: str) -> dict[str, str]:
    return {
        "class": f"QA CRUD Lớp {run_id}",
        "class_updated": f"QA CRUD Lớp {run_id} đã đổi tên",
        "blueprint": f"QA CRUD Ma trận {run_id}",
        "email": f"qa-crud-{run_id}@example.com",
        "user_updated": f"QA CRUD Người dùng {run_id} đã sửa",
    }


def report(label: str, ok: bool, detail: str = "") -> bool:
    print(f"  {'PASS' if ok else 'FAIL'}  {label}{(' — ' + detail) if detail else ''}")
    return ok


async def check_created(db, n) -> bool:
    results = []
    cls = await db["classes"].find_one({"name": n["class"], "deleted_at": None})
    results.append(report("lớp học có trong MongoDB", cls is not None,
                          f"_id={cls['_id']}" if cls else "không tìm thấy"))
    if cls:
        results.append(report("mô tả lưu đúng", bool(cls.get("description")), str(cls.get("description"))[:50]))

    blueprint = await db["exam_blueprints"].find_one({"name": n["blueprint"]})
    results.append(report("ma trận đề có trong MongoDB", blueprint is not None,
                          f"môn={blueprint.get('subject_id')} lớp={blueprint.get('grade')}" if blueprint else "không tìm thấy"))

    user = await db["users"].find_one({"email": n["email"]})
    results.append(report("người dùng có trong MongoDB", user is not None,
                          f"tên={user.get('full_name')}" if user else "không tìm thấy"))
    if user:
        results.append(report("mật khẩu được băm, không lưu thô",
                              bool(user.get("hashed_password")) and "QaCrud" not in str(user.get("hashed_password"))))
    return all(results)


async def check_updated(db, n) -> bool:
    results = []
    old = await db["classes"].find_one({"name": n["class"], "deleted_at": None})
    new = await db["classes"].find_one({"name": n["class_updated"], "deleted_at": None})
    results.append(report("tên lớp mới đã ghi vào MongoDB", new is not None))
    results.append(report("tên lớp cũ không còn", old is None))

    user = await db["users"].find_one({"email": n["email"]})
    results.append(report("họ tên người dùng đã cập nhật",
                          user is not None and user.get("full_name") == n["user_updated"],
                          str(user.get("full_name")) if user else "không tìm thấy"))
    return all(results)


async def check_deleted(db, n) -> bool:
    results = []
    cls = await db["classes"].find_one({"name": {"$in": [n["class"], n["class_updated"]]}, "deleted_at": None})
    results.append(report("lớp học đã bị xoá", cls is None,
                          "" if cls is None else f"vẫn còn _id={cls['_id']}"))

    user = await db["users"].find_one({"email": n["email"]})
    if user is None:
        results.append(report("người dùng đã bị xoá cứng", True))
    else:
        soft_deleted = user.get("status") == "deleted" or user.get("deleted_at") is not None
        results.append(report("người dùng đã xoá mềm (status/deleted_at)", soft_deleted,
                              f"status={user.get('status')} deleted_at={user.get('deleted_at')}"))
    return all(results)


CHECKS = {"created": check_created, "updated": check_updated, "deleted": check_deleted}


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--phase", required=True, choices=sorted(CHECKS))
    parser.add_argument("--run-id", default="local", help="Cùng mã với QA_RUN_ID của bộ kiểm giao diện.")
    parser.add_argument("--cleanup", action="store_true", help="Xoá hẳn mọi bản ghi 'QA CRUD' còn sót.")
    args = parser.parse_args()

    await connect_to_mongo()
    db = get_database()
    try:
        if args.cleanup:
            for collection, query in (
                ("classes", {"name": {"$regex": "^QA CRUD "}}),
                ("exam_blueprints", {"name": {"$regex": "^QA CRUD "}}),
                ("users", {"email": {"$regex": "^qa-crud-"}}),
            ):
                result = await db[collection].delete_many(query)
                print(f"  xóa {collection}: {result.deleted_count}")
            return

        print(f"Pha '{args.phase}':")
        ok = await CHECKS[args.phase](db, names(args.run_id))
        print("KẾT QUẢ:", "ĐẠT" if ok else "KHÔNG ĐẠT")
        if not ok:
            sys.exit(1)
    finally:
        await close_mongo_connection()


if __name__ == "__main__":
    asyncio.run(main())
