"""Nạp bộ dữ liệu mẫu đủ để các chức năng K-Means hiện ra số thật.

Các mô-đun K-Means chỉ nói được điều gì đó khi có dữ liệu để nhai. Trên máy
sạch, chúng chạy đúng nhưng trả về rỗng, và màn hình trống trông y hệt tính
năng hỏng. Script này dựng đúng lượng dữ liệu tối thiểu cho từng mô-đun:

- **Phân nhóm năng lực lớp học**: 12 học sinh, 3 bộ đề, điểm được thiết kế
  thành ba chân dung khác nhau (mạnh Hàm số / mạnh Lượng giác / đều tay) để
  tâm cụm đọc ra được điểm yếu, chứ không phải 12 điểm ngẫu nhiên.
- **Phát hiện câu hỏi lỗi**: một câu được cài sai đáp án — học sinh giỏi lại
  trả lời sai nhiều hơn học sinh yếu, tạo độ phân biệt âm.
- **Cảnh báo học liệu gần trùng**: một cặp tài liệu cùng nội dung khác vài chữ.
- **Phân nhóm hành vi người dùng**: nhật ký hoạt động được sinh theo ba mức
  cường độ sử dụng, đủ tách nhóm mà không tạo cụm một người.

Dữ liệu đều mang cờ `seed_tag` nên gỡ sạch được:

    python scripts/seed_kmeans_demo.py          # nạp
    python scripts/seed_kmeans_demo.py --purge  # gỡ sạch
"""

import argparse
import asyncio
import hashlib
import math
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List

from bson import ObjectId

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.core.config import settings
from app.core.security import get_password_hash
from app.database.mongodb import close_mongo_connection, connect_to_mongo, get_database
from app.services.document_duplicate_service import check_document_for_duplicates

SEED_TAG = "kmeans-demo"
PASSWORD = "Demo@12345"
NOW = datetime(2026, 8, 13, 9, 0, tzinfo=timezone.utc)

TEACHER = {"email": "gv.demo@ezedu.vn", "full_name": "Cô Nguyễn Thu Hà", "role": "lecturer"}

# Ba chân dung năng lực. Đây là thứ khiến kết quả phân cụm đọc được: tâm cụm
# sẽ nói "nhóm này 88% Hàm số nhưng 42% Lượng giác" thay vì một con số trung bình.
PROFILES = [
    {"key": "manh_ham_so", "ten": "mạnh Hàm số", "diem": {"ham_so": 88, "luong_giac": 42, "to_hop": 65}},
    {"key": "manh_luong_giac", "ten": "mạnh Lượng giác", "diem": {"ham_so": 45, "luong_giac": 90, "to_hop": 60}},
    {"key": "deu_tay", "ten": "đều tay", "diem": {"ham_so": 70, "luong_giac": 68, "to_hop": 72}},
]

STUDENTS = [
    {"email": f"hs{i:02d}@ezedu.vn", "full_name": ten, "role": "student", "profile": PROFILES[(i - 1) % 3]["key"]}
    for i, ten in enumerate(
        [
            "Trần Minh An", "Lê Bảo Châu", "Phạm Đức Duy", "Vũ Gia Hân",
            "Đỗ Khánh Linh", "Bùi Hoàng Long", "Ngô Thuý Mai", "Hồ Anh Quân",
            "Đặng Thu Trang", "Lý Nhật Tuấn", "Chu Diệu Vy", "Mai Xuân Yến",
        ],
        start=1,
    )
]

DOC_HAM_SO = (
    "Hàm số bậc hai có dạng y = ax² + bx + c với a khác 0. Đồ thị của hàm số bậc hai "
    "là một đường parabol có đỉnh và trục đối xứng. Parabol quay bề lõm lên trên khi "
    "hệ số a dương và quay xuống dưới khi a âm. Toạ độ đỉnh của parabol được xác định "
    "bởi công thức x = -b/(2a). Trục đối xứng của parabol là đường thẳng đi qua đỉnh "
    "và song song với trục tung. Biệt thức delta bằng b² - 4ac quyết định số giao điểm "
    "của parabol với trục hoành."
)

# Cùng nội dung, chỉ sửa vài chữ và thêm một câu — đúng kiểu giáo viên xuất lại
# file hoặc tải nhầm bản sửa. Đây là ca mà khử trùng theo checksum bỏ lọt.
DOC_HAM_SO_BAN_SUA = (
    "Hàm số bậc hai có dạng y = ax² + bx + c với a khác 0. Đồ thị của hàm số bậc hai "
    "là một đường parabol có đỉnh và trục đối xứng rõ ràng. Parabol quay bề lõm lên trên "
    "khi hệ số a dương và quay xuống dưới khi a âm. Toạ độ đỉnh của parabol được xác định "
    "bởi công thức x = -b/(2a). Trục đối xứng của parabol là đường thẳng đi qua đỉnh và "
    "song song với trục tung. Biệt thức delta bằng b² - 4ac quyết định số giao điểm của "
    "parabol với trục hoành. Phần này bổ sung thêm một ghi chú nhỏ cho học sinh."
)

DOC_LUONG_GIAC = (
    "Phương trình lượng giác cơ bản gồm sin x = m và cos x = m. Điều kiện có nghiệm là "
    "trị tuyệt đối của m không vượt quá 1. Công thức nghiệm tổng quát cộng thêm k2π với "
    "k là số nguyên. Phương trình tan x = m luôn có nghiệm với mọi giá trị m. Chu kỳ của "
    "hàm sin và cos là 2π, còn chu kỳ của hàm tan là π. Các công thức cộng và công thức "
    "nhân đôi giúp biến đổi phương trình về dạng cơ bản."
)

DOC_TO_HOP = (
    "Quy tắc cộng và quy tắc nhân là hai quy tắc đếm cơ bản. Hoán vị của n phần tử là "
    "n giai thừa. Chỉnh hợp chập k của n phần tử có tính đến thứ tự sắp xếp. Tổ hợp chập "
    "k của n phần tử không tính đến thứ tự. Nhị thức Newton khai triển luỹ thừa của một "
    "tổng thành tổng các số hạng chứa hệ số tổ hợp. Xác suất của biến cố bằng số kết quả "
    "thuận lợi chia cho số kết quả có thể."
)

DOCUMENTS = [
    {"key": "ham_so", "filename": "Chuong 2 - Ham so bac hai.docx", "text": DOC_HAM_SO},
    {"key": "ham_so_ban_sua", "filename": "Chuong 2 - Ham so bac hai (ban sua).docx", "text": DOC_HAM_SO_BAN_SUA},
    {"key": "luong_giac", "filename": "Chuong 3 - Phuong trinh luong giac.docx", "text": DOC_LUONG_GIAC},
    {"key": "to_hop", "filename": "Chuong 4 - To hop va xac suat.docx", "text": DOC_TO_HOP},
]

# Bộ đề: 8 câu mỗi bộ. Câu số 4 của bộ Hàm số là câu được cài lỗi.
CAU_HOI = {
    "ham_so": [
        "Đồ thị hàm số bậc hai là hình gì?",
        "Khi a > 0 thì parabol quay bề lõm về phía nào?",
        "Toạ độ đỉnh parabol có hoành độ bằng bao nhiêu?",
        "Trục đối xứng của parabol là đường thẳng nào?",  # câu cài lỗi
        "Biệt thức delta được tính bằng công thức nào?",
        "Delta âm thì parabol cắt trục hoành tại mấy điểm?",
        "Hệ số c cho biết điều gì về đồ thị?",
        "Hàm số bậc hai xác định trên tập nào?",
    ],
    "luong_giac": [
        "Phương trình sin x = m có nghiệm khi nào?",
        "Chu kỳ của hàm số sin là bao nhiêu?",
        "Phương trình tan x = m có nghiệm với mọi m đúng hay sai?",
        "Chu kỳ của hàm tan là bao nhiêu?",
        "Nghiệm tổng quát cộng thêm bội của số nào?",
        "Điều kiện của m trong phương trình cos x = m?",
        "Công thức nhân đôi dùng để làm gì?",
        "Hàm cos đạt giá trị lớn nhất bằng bao nhiêu?",
    ],
    "to_hop": [
        "Hoán vị của n phần tử bằng bao nhiêu?",
        "Chỉnh hợp có tính đến thứ tự không?",
        "Tổ hợp có tính đến thứ tự không?",
        "Nhị thức Newton khai triển biểu thức nào?",
        "Xác suất của biến cố được tính thế nào?",
        "Quy tắc nhân dùng khi nào?",
        "Quy tắc cộng dùng khi nào?",
        "Số tổ hợp chập 0 của n phần tử bằng bao nhiêu?",
    ],
}

BO_DE = [
    {"key": "ham_so", "doc": "ham_so", "ten": "Kiểm tra Hàm số bậc hai"},
    {"key": "luong_giac", "doc": "luong_giac", "ten": "Kiểm tra Phương trình lượng giác"},
    {"key": "to_hop", "doc": "to_hop", "ten": "Kiểm tra Tổ hợp - Xác suất"},
]

# Câu bị cài sai đáp án: học sinh giỏi chọn đáp án đúng theo sách nhưng bị chấm
# sai, học sinh yếu đoán bừa lại trúng ô được đánh dấu đúng.
CAU_LOI = {"bo_de": "ham_so", "chi_so": 3}

# Tỉ lệ đúng nền của từng câu trong bộ đề, dùng làm trọng số khi sinh đáp án.
# Không câu nào bằng 1.0: một bộ đề mà câu nào cũng 100% đúng là bộ đề bịa.
TY_LE_DUNG_NEN = [0.92, 0.88, 0.78, 0.55, 0.62, 0.40, 0.35, 0.30]

# Ba mức cường độ dùng hệ thống, dùng cho phân nhóm hành vi.
CUONG_DO = [
    {"so_lan": 34, "so_ngay": 12, "ty_le_loi": 0.03},
    {"so_lan": 14, "so_ngay": 6, "ty_le_loi": 0.10},
    {"so_lan": 5, "so_ngay": 2, "ty_le_loi": 0.22},
]

HANH_DONG = [
    ("document_uploaded", "document"),
    ("questions_generated", "question"),
    ("question_set_viewed", "question"),
    ("exam_submitted", "exam"),
    ("chat_message_sent", "chat"),
]


def build_options(index: int) -> Dict[str, str]:
    return {"A": f"Phương án A{index}", "B": f"Phương án B{index}", "C": f"Phương án C{index}", "D": f"Phương án D{index}"}


def build_questions(bo_de_key: str) -> List[Dict[str, Any]]:
    """Dựng 8 câu cho một bộ đề, đủ trường mà giao diện và API cần đọc."""
    muc_do = ["easy", "easy", "medium", "medium", "medium", "hard", "medium", "easy"]
    bloom = ["remember", "remember", "understand", "understand", "apply", "analyze", "understand", "remember"]
    questions = []
    for index, text in enumerate(CAU_HOI[bo_de_key]):
        questions.append({
            "question": text,
            "options": build_options(index + 1),
            "correct_answer": "A",
            "explanation": "Giải thích ngắn cho câu hỏi mẫu phục vụ demo.",
            "difficulty": muc_do[index],
            "question_type": "multiple_choice",
            "bloom_level": bloom[index],
            "tags": [bo_de_key],
            "status": "published",
            "reviewed_by": None,
            "reviewed_at": None,
            "published_at": NOW,
            "deleted_at": None,
            "hallucination_risk": "low",
        })
    return questions


def answers_for(
    percent: float, question_count: int, la_cau_loi: int | None, hat_giong: str
) -> List[Dict[str, Any]]:
    """Sinh đáp án sao cho tổng điểm khớp `percent`.

    Câu dễ có xu hướng được trả lời đúng trước, nhưng không tuyệt đối: mỗi học
    sinh được cộng một nhiễu nhỏ tất định theo `hat_giong`. Nếu bỏ nhiễu này
    thì mọi em cùng làm đúng đúng những câu đầu, độ khó của ba câu dễ nhất
    thành p = 1.00 tròn trịa và cả bộ đề trông như bịa. Nhiễu giữ cho độ phân
    biệt của từng câu vẫn có nghĩa mà phân bố không lộ ra là dàn dựng.

    Riêng câu bị cài lỗi thì đảo ngược: học sinh giỏi sai, học sinh yếu đúng.
    """
    so_dung = round(percent / 100 * question_count)

    def diem_uu_tien(index: int) -> float:
        """Lấy mẫu theo trọng số bằng mẹo Gumbel top-k.

        Chọn thẳng `so_dung` câu dễ nhất thì mọi học sinh cùng đúng đúng những
        câu đầu, và ba câu dễ nhất có p = 1.00 tròn trịa — nhìn là biết dàn
        dựng. Cách này giữ xu hướng "câu dễ hay đúng hơn" nhưng vẫn cho phép
        một em khá trượt câu dễ và một em yếu ăn may câu khó, đúng như lớp thật.
        """
        u = int(hashlib.md5(f"{hat_giong}:{index}".encode()).hexdigest()[:8], 16) / 0xFFFFFFFF
        u = min(max(u, 1e-9), 1 - 1e-9)
        return math.log(TY_LE_DUNG_NEN[index]) - math.log(-math.log(u))

    xep_hang = sorted(range(question_count), key=diem_uu_tien, reverse=True)
    dung = set(xep_hang[:so_dung])

    answers = []
    for index in range(question_count):
        is_correct = index in dung
        if la_cau_loi is not None and index == la_cau_loi:
            # Đảo ngược đúng chỗ này: đây là chữ ký của một câu sai đáp án.
            is_correct = percent < 60
        answers.append({
            "question_index": index,
            "answer": "A" if is_correct else "B",
            "correct_answer": "A",
            "is_correct": is_correct,
        })
    return answers


async def purge(db) -> None:
    """Gỡ sạch dữ liệu mẫu, kể cả phần do hệ thống tự sinh ra từ nó.

    Chỉ xoá theo `seed_tag` là chưa đủ. Khi chạy thật, hệ thống sinh thêm cả
    một tầng dữ liệu phái sinh — learning item, sự kiện học tập, trạng thái
    BKT/IRT, nhật ký gợi ý, vector trong Chroma — và những bản ghi đó do API
    thật tạo nên không mang cờ. Bỏ lại chúng thì lần seed sau chạy trên một
    kho đầy bản ghi mồ côi trỏ vào tài liệu đã biến mất.

    Mọi truy vấn dưới đây đều giới hạn theo đúng người dùng và tài liệu của bộ
    mẫu, không xoá theo collection, để không đụng vào dữ liệu thật.
    """
    seed_user_ids = [str(doc["_id"]) async for doc in db["users"].find({"seed_tag": SEED_TAG}, {"_id": 1})]
    seed_document_ids = [str(doc["_id"]) async for doc in db["documents"].find({"seed_tag": SEED_TAG}, {"_id": 1})]

    tong = 0

    async def xoa(name: str, query: dict) -> None:
        nonlocal tong
        result = await db[name].delete_many(query)
        if result.deleted_count:
            print(f"  xoá {result.deleted_count:4d} bản ghi trong {name}")
        tong += result.deleted_count

    # Vector trong Chroma phải gỡ trước, vì cần document_id còn tồn tại.
    if seed_document_ids:
        try:
            from app.services.rag_service import _delete_document_vectors, init_chroma_client

            client = init_chroma_client()
            owners = {
                str(doc["_id"]): doc.get("user_id")
                async for doc in db["documents"].find({"seed_tag": SEED_TAG}, {"_id": 1, "user_id": 1})
            }
            for document_id, owner_id in owners.items():
                _delete_document_vectors(client, document_id, owner_id)
            print(f"  gỡ vector Chroma của {len(owners)} tài liệu")
        except Exception as exc:  # noqa: BLE001 - Chroma hỏng không được chặn việc dọn Mongo
            print(f"  (bỏ qua vector Chroma: {exc})")

    if seed_user_ids:
        for name in ("learning_events", "learning_sessions", "learner_profiles",
                     "learner_knowledge_states", "recommendation_logs"):
            await xoa(name, {"user_id": {"$in": seed_user_ids}})
        await xoa("knowledge_graph_edges", {"created_by": {"$in": seed_user_ids}})
        # `knowledge_components` không có `document_id`; nó nối với tài liệu qua
        # `source_document_ids` (danh sách). Lọc theo `document_id` thì trượt
        # sạch và để lại một kho thành phần tri thức mồ côi.
        await xoa("knowledge_components", {"created_by": {"$in": seed_user_ids}})

    if seed_document_ids:
        for name in ("learning_items", "document_chunks"):
            await xoa(name, {"document_id": {"$in": seed_document_ids}})
        await xoa("knowledge_components", {"source_document_ids": {"$in": seed_document_ids}})

    for name in ("question_attempts", "question_sets", "document_contents", "documents",
                 "classes", "user_activity_logs", "users"):
        await xoa(name, {"seed_tag": SEED_TAG})

    print(f"Đã gỡ {tong} bản ghi.")
    if tong:
        print("  Lưu ý: mô hình cụm đã huấn luyện (`cluster_models`) không bị xoá — "
              "chúng chỉ là tham số, không chứa dữ liệu cá nhân. Xoá tay nếu muốn sạch hẳn.")


async def seed(db) -> None:
    hashed = get_password_hash(PASSWORD)

    async def upsert_user(spec: Dict[str, Any]) -> str:
        existing = await db["users"].find_one({"email": spec["email"]})
        if existing:
            return str(existing["_id"])
        doc = {
            "email": spec["email"], "full_name": spec["full_name"], "hashed_password": hashed,
            "role": spec["role"], "status": "active", "is_active": True, "email_verified": True,
            "permissions_override": [], "deleted_at": None, "created_at": NOW - timedelta(days=30),
            "updated_at": None, "seed_tag": SEED_TAG,
        }
        result = await db["users"].insert_one(doc)
        return str(result.inserted_id)

    teacher_id = await upsert_user(TEACHER)
    student_ids: Dict[str, str] = {}
    for spec in STUDENTS:
        student_ids[spec["email"]] = await upsert_user(spec)
    print(f"Người dùng: 1 giảng viên + {len(student_ids)} học sinh")

    # Học liệu và nội dung đã trích xuất.
    doc_ids: Dict[str, str] = {}
    for spec in DOCUMENTS:
        document_id = ObjectId()
        doc_ids[spec["key"]] = str(document_id)
        await db["documents"].insert_one({
            "_id": document_id, "user_id": teacher_id, "original_filename": spec["filename"],
            "file_type": "docx", "file_size": len(spec["text"].encode("utf-8")),
            "cloudinary_url": "", "cloudinary_public_id": "", "cloudinary_resource_type": "raw",
            "media_kind": "document", "status": "indexed", "error_message": None,
            "checksum": hashlib.sha256(spec["text"].encode("utf-8")).hexdigest(),
            "reuse_count": 0, "version": 1, "created_by": teacher_id, "updated_by": teacher_id,
            "deleted_at": None, "created_at": NOW - timedelta(days=20), "updated_at": NOW - timedelta(days=20),
            "seed_tag": SEED_TAG,
        })
        await db["document_contents"].insert_one({
            "document_id": str(document_id), "user_id": teacher_id, "extracted_text": spec["text"],
            "text_length": len(spec["text"]), "created_at": NOW - timedelta(days=20),
            "updated_at": NOW - timedelta(days=20), "seed_tag": SEED_TAG,
        })
    # Cảnh báo gần trùng vốn được tính ở bước trích xuất. Seed chèn thẳng vào
    # DB nên phải gọi lại đúng service đó — nhồi sẵn con số thì cái hiện trên
    # màn hình không còn là kết quả TF-IDF nữa.
    tong_canh_bao = 0
    for spec in DOCUMENTS:
        document_id = doc_ids[spec["key"]]
        matches = await check_document_for_duplicates(
            db, document_id=document_id, user_id=teacher_id, text=spec["text"]
        )
        if matches:
            await db["documents"].update_one(
                {"_id": ObjectId(document_id)}, {"$set": {"near_duplicates": matches}}
            )
            tong_canh_bao += len(matches)
    print(f"Học liệu: {len(doc_ids)} tài liệu — {tong_canh_bao} cảnh báo gần trùng do TF-IDF tính")

    # Bộ đề.
    set_ids: Dict[str, str] = {}
    for spec in BO_DE:
        questions = build_questions(spec["key"])
        result = await db["question_sets"].insert_one({
            "document_id": doc_ids[spec["doc"]], "user_id": teacher_id,
            "document_name": spec["ten"], "question_count": len(questions),
            "difficulty": "medium", "question_type": "multiple_choice", "questions": questions,
            "validation_stats": {},
            # Đúng hình dạng KeywordItem — danh sách chuỗi làm API trả 500.
            "keywords": [{"keyword": spec["key"], "score": 1.0}],
            "bloom_distribution": {"remember": 3, "understand": 3, "apply": 1, "analyze": 1},
            "workflow_counts": {"approved": 0, "draft": 0, "published": len(questions), "review_pending": 0},
            "published_question_count": len(questions),
            "created_at": NOW - timedelta(days=15), "updated_at": NOW - timedelta(days=15),
            "deleted_at": None, "seed_tag": SEED_TAG,
        })
        set_ids[spec["key"]] = str(result.inserted_id)
    print(f"Bộ đề: {len(set_ids)} bộ × 8 câu")

    # Lớp học.
    class_result = await db["classes"].insert_one({
        "name": "Toán 10A1 (demo)", "description": "Lớp mẫu để xem phân nhóm năng lực",
        "owner_id": teacher_id, "student_ids": list(student_ids.values()),
        "created_at": NOW - timedelta(days=25), "updated_at": None, "deleted_at": None,
        "seed_tag": SEED_TAG,
    })
    print(f"Lớp học: Toán 10A1 (demo) — {len(student_ids)} học sinh")

    # Lượt làm bài, điểm theo chân dung năng lực đã thiết kế.
    profile_map = {p["key"]: p for p in PROFILES}
    attempts = []
    for offset, spec in enumerate(STUDENTS):
        user_id = student_ids[spec["email"]]
        diem = profile_map[spec["profile"]]["diem"]
        for spec_de in BO_DE:
            key = spec_de["key"]
            # Lệch nhẹ theo từng em để không phải ai cùng nhóm cũng trùng khít
            # điểm — dữ liệu thật không bao giờ sạch như vậy.
            percent = max(0, min(100, diem[key] + ((offset % 4) - 1) * 4))
            la_cau_loi = CAU_LOI["chi_so"] if key == CAU_LOI["bo_de"] else None
            answers = answers_for(percent, 8, la_cau_loi, hat_giong=f"{spec['email']}:{key}")
            score = sum(1 for a in answers if a["is_correct"])
            attempts.append({
                "question_set_id": set_ids[key], "document_id": doc_ids[spec_de["doc"]],
                "user_id": user_id, "owner_user_id": teacher_id,
                "score": score, "max_score": 8, "percent": round(score / 8 * 100, 2),
                "answers": answers, "created_at": NOW - timedelta(days=10 - offset % 7),
                "seed_tag": SEED_TAG,
            })
    await db["question_attempts"].insert_many(attempts)
    print(f"Lượt làm bài: {len(attempts)}")

    # Nhật ký hoạt động theo ba mức cường độ.
    logs = []
    nguoi_dung = [teacher_id] + list(student_ids.values())
    for index, user_id in enumerate(nguoi_dung):
        muc = CUONG_DO[index % len(CUONG_DO)]
        for lan in range(muc["so_lan"]):
            action, category = HANH_DONG[lan % len(HANH_DONG)]
            that_bai = (lan % max(1, int(1 / muc["ty_le_loi"]))) == 0 and lan > 0
            logs.append({
                "user_id": user_id, "action": action, "category": category,
                "resource_type": category, "resource_id": None,
                "status": "failure" if that_bai else "success",
                "timestamp": NOW - timedelta(days=lan % muc["so_ngay"], hours=lan % 9),
                "request_id": None, "metadata": {},
                "duration_ms": 220 + (lan * 37) % 900 + index * 11,
                "ip_hash": None, "user_agent_summary": "Chrome on Windows",
                "seed_tag": SEED_TAG,
            })
    await db["user_activity_logs"].insert_many(logs)
    print(f"Nhật ký hoạt động: {len(logs)} bản ghi trên {len(nguoi_dung)} tài khoản")

    print()
    print("Đăng nhập thử:")
    print(f"  giảng viên: {TEACHER['email']} / {PASSWORD}")
    print(f"  học sinh  : {STUDENTS[0]['email']} / {PASSWORD}")


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--purge", action="store_true", help="Gỡ sạch dữ liệu mẫu rồi thoát")
    args = parser.parse_args()

    await connect_to_mongo()
    db = get_database()
    print(f"MongoDB: {settings.MONGODB_DB_NAME}\n")
    try:
        if args.purge:
            await purge(db)
        else:
            await purge(db)  # nạp lại từ đầu để chạy nhiều lần không sinh trùng
            await seed(db)
    finally:
        await close_mongo_connection()


if __name__ == "__main__":
    asyncio.run(main())
