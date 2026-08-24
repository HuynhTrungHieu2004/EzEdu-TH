from __future__ import annotations

import asyncio
import os
from datetime import datetime, timedelta, timezone

from bson import ObjectId

from app.core.security import get_password_hash


DEMO_SEED_KEY = "ezedu-demo-v1"

ADMIN_ID = ObjectId("000000000000000000000001")
TEACHER_ID = ObjectId("000000000000000000000002")
STUDENT_ID = ObjectId("000000000000000000000003")
COURSE_ID = ObjectId("000000000000000000000101")
ENROLLMENT_ID = ObjectId("000000000000000000000102")
QUESTION_ID = ObjectId("000000000000000000000103")
EXAM_ID = ObjectId("000000000000000000000104")
ATTEMPT_ID = ObjectId("000000000000000000000105")
PROFILE_ID = ObjectId("000000000000000000000106")

AI_SUGGESTED_COURSES = (
    {
        "id": ObjectId("000000000000000000000201"),
        "code": "AI-TOAN-12",
        "title": "AI gợi ý · Toán 12",
        "subject": "Toán học",
        "description": "Lộ trình lý thuyết trọng tâm lớp 12 do AI gợi ý, bám định hướng CTGDPT 2018.",
        "goals": ["Nắm chắc kiến thức nền", "Biết vận dụng công thức", "Chuẩn bị cho bài tập tổng hợp"],
        "syllabus": "Ứng dụng đạo hàm; vectơ và tọa độ trong không gian; xác suất và thống kê.",
        "lessons": (
            ("Chương 1: Ứng dụng đạo hàm", "Tính đơn điệu và cực trị", "Đạo hàm cho biết chiều biến thiên của hàm số. Trên khoảng mà f'(x) > 0, hàm số đồng biến; khi f'(x) < 0, hàm số nghịch biến. Điểm cực trị thường xuất hiện nơi đạo hàm đổi dấu. Quy trình cơ bản gồm tìm tập xác định, tính đạo hàm, lập bảng dấu và kết luận."),
            ("Chương 1: Ứng dụng đạo hàm", "Tiệm cận và khảo sát đồ thị", "Tiệm cận đứng được nhận biết qua giới hạn vô cực tại một giá trị hữu hạn; tiệm cận ngang hoặc xiên được xác định từ giới hạn khi x tiến ra vô cực. Khi khảo sát đồ thị cần phối hợp tập xác định, biến thiên, cực trị, tiệm cận và một số điểm đặc biệt."),
            ("Chương 2: Vectơ và tọa độ Oxyz", "Vectơ trong không gian", "Vectơ trong không gian có các phép toán cộng, trừ và nhân với một số tương tự trên mặt phẳng. Tích vô hướng giúp tính góc và kiểm tra vuông góc. Trong hệ Oxyz, vectơ được biểu diễn bằng ba tọa độ và độ dài bằng căn bậc hai tổng bình phương các tọa độ."),
            ("Chương 2: Vectơ và tọa độ Oxyz", "Phương trình mặt phẳng và đường thẳng", "Một mặt phẳng được xác định bởi một điểm và vectơ pháp tuyến. Đường thẳng được mô tả bằng một điểm đi qua cùng vectơ chỉ phương. Quan hệ song song, vuông góc và góc giữa các đối tượng được xét thông qua vectơ pháp tuyến hoặc vectơ chỉ phương."),
            ("Chương 3: Xác suất và thống kê", "Độ phân tán của mẫu số liệu ghép nhóm", "Khoảng biến thiên, khoảng tứ phân vị, phương sai và độ lệch chuẩn mô tả mức độ phân tán của dữ liệu. Với mẫu ghép nhóm, ta dùng giá trị đại diện của từng lớp để ước lượng. Độ lệch chuẩn nhỏ cho thấy dữ liệu tập trung gần giá trị trung bình hơn."),
            ("Chương 3: Xác suất và thống kê", "Xác suất có điều kiện", "Xác suất có điều kiện P(A|B) đo khả năng A xảy ra khi biết B đã xảy ra. Công thức nhân là P(A∩B)=P(B)P(A|B). Hai biến cố độc lập khi việc biết một biến cố không làm thay đổi xác suất của biến cố kia; định lí Bayes hỗ trợ suy ngược xác suất."),
        ),
    },
    {
        "id": ObjectId("000000000000000000000202"),
        "code": "AI-VATLY-12",
        "title": "AI gợi ý · Vật lí 12",
        "subject": "Vật lí",
        "description": "Các chủ đề nền tảng Vật lí 12 được AI sắp xếp thành lộ trình đọc hiểu ngắn gọn.",
        "goals": ["Hiểu bản chất hiện tượng", "Sử dụng đúng đại lượng và đơn vị", "Liên hệ thí nghiệm thực tế"],
        "syllabus": "Vật lí nhiệt; từ trường và cảm ứng điện từ; vật lí hạt nhân.",
        "lessons": (
            ("Chương 1: Vật lí nhiệt", "Nội năng và nguyên lí I nhiệt động lực học", "Nội năng là tổng động năng chuyển động nhiệt và thế năng tương tác của các phân tử. Nội năng thay đổi khi hệ nhận nhiệt hoặc khi có công thực hiện lên hệ. Nguyên lí I biểu diễn định luật bảo toàn năng lượng cho quá trình nhiệt động lực học và cần dùng quy ước dấu nhất quán."),
            ("Chương 1: Vật lí nhiệt", "Khí lí tưởng và phương trình trạng thái", "Mô hình khí lí tưởng coi các phân tử có kích thước rất nhỏ và chỉ tương tác đáng kể khi va chạm. Với một lượng khí xác định, các trạng thái cân bằng liên hệ qua pV/T không đổi. Nhiệt độ trong công thức phải dùng thang Kelvin và áp suất, thể tích dùng cùng hệ đơn vị."),
            ("Chương 2: Từ trường", "Lực từ và cảm ứng từ", "Từ trường tác dụng lực lên điện tích chuyển động và dây dẫn có dòng điện. Vectơ cảm ứng từ đặc trưng độ mạnh và hướng của từ trường. Độ lớn lực phụ thuộc vào B, dòng điện hoặc điện tích, vận tốc và góc giữa hướng chuyển động với đường sức từ."),
            ("Chương 2: Từ trường", "Cảm ứng điện từ", "Từ thông qua một mạch phụ thuộc cảm ứng từ, diện tích và góc định hướng của mặt phẳng mạch. Khi từ thông biến thiên, trong mạch xuất hiện suất điện động cảm ứng. Chiều dòng điện cảm ứng tuân theo định luật Lenz, chống lại nguyên nhân gây ra biến thiên."),
            ("Chương 3: Vật lí hạt nhân", "Cấu tạo và năng lượng liên kết hạt nhân", "Hạt nhân gồm proton và neutron, được đặc trưng bởi số khối và điện tích. Khối lượng hạt nhân nhỏ hơn tổng khối lượng các nuclon tự do; độ hụt khối tương ứng với năng lượng liên kết theo E=mc². Năng lượng liên kết riêng phản ánh mức độ bền vững tương đối."),
            ("Chương 3: Vật lí hạt nhân", "Phóng xạ và phản ứng hạt nhân", "Phóng xạ là quá trình tự phát của hạt nhân không bền và tuân theo định luật giảm mũ. Chu kì bán rã là thời gian để số hạt chưa phân rã giảm còn một nửa. Trong phản ứng hạt nhân cần bảo toàn điện tích, số nuclon, năng lượng và động lượng."),
        ),
    },
    {
        "id": ObjectId("000000000000000000000203"),
        "code": "AI-TIENGANH-12",
        "title": "AI gợi ý · Tiếng Anh 12",
        "subject": "Tiếng Anh",
        "description": "Lộ trình Tiếng Anh 12 tập trung vào từ vựng, ngữ pháp và chiến lược giao tiếp học thuật.",
        "goals": ["Mở rộng từ vựng theo chủ đề", "Dùng ngữ pháp trong ngữ cảnh", "Cải thiện đọc và viết"],
        "syllabus": "Life stories and careers; urbanisation and green living; lifelong learning and future skills.",
        "lessons": (
            ("Unit 1: Life stories and careers", "Telling a life story", "A clear life story normally follows a timeline: background, turning points, achievements and impact. Use the past simple for completed events and the past continuous for actions in progress. Linking expressions such as afterwards, meanwhile and eventually make the narrative coherent."),
            ("Unit 1: Life stories and careers", "Relative clauses in context", "Relative clauses add information about people, things, places or times. Who and whom refer to people, which to things, and where to places. Defining clauses identify the noun and do not use commas; non-defining clauses add extra information and are separated by commas."),
            ("Unit 2: Urbanisation and green living", "Discussing urban change", "Urbanisation describes the movement of people and economic activity toward towns and cities. Useful vocabulary includes infrastructure, housing, public transport, employment and congestion. A balanced discussion should identify both opportunities and pressures, then support each point with an example."),
            ("Unit 2: Urbanisation and green living", "Writing a problem–solution paragraph", "Begin with a focused topic sentence that names the problem. Explain one or two causes, then propose realistic solutions and expected results. Modal verbs such as should, could and must express different strengths of recommendation. End by restating the main benefit without repeating every detail."),
            ("Unit 3: Lifelong learning", "Reading for main ideas and evidence", "Preview the title and headings before reading, then identify the main idea of each paragraph. Distinguish claims from supporting evidence and use reference words to follow connections. When answering questions, locate the relevant passage and paraphrase it instead of matching isolated words."),
            ("Unit 3: Lifelong learning", "Future skills and personal plans", "Future-ready learners combine digital literacy, communication, collaboration and self-management. Use will for predictions or spontaneous decisions, be going to for intentions, and the present continuous for arranged plans. A practical learning plan needs a goal, actions, resources and a review date."),
        ),
    },
)

DEMO_COLLECTIONS = (
    "users",
    "learner_profiles",
    "courses",
    "course_lessons",
    "course_enrollments",
    "questions",
    "exams",
    "exam_attempts",
)


async def _upsert(collection, query: dict, document: dict) -> None:
    document = {**document, "demo_seed": DEMO_SEED_KEY}
    object_id = document.pop("_id")
    created_at = document.pop("created_at", None)
    set_on_insert = {"_id": object_id}
    if created_at is not None:
        set_on_insert["created_at"] = created_at
    await collection.update_one(
        query,
        {"$set": document, "$setOnInsert": set_on_insert},
        upsert=True,
    )


async def seed_demo_data(db, *, password: str) -> dict[str, int]:
    if len(password) < 8:
        raise ValueError("Mật khẩu demo phải có ít nhất 8 ký tự.")

    now = datetime.now(timezone.utc)
    hashed_password = get_password_hash(password)
    users = (
        (ADMIN_ID, "admin.demo@ezedu.vn", "Quản trị viên Demo", "admin"),
        (TEACHER_ID, "giaovien.demo@ezedu.vn", "Giảng viên Demo", "lecturer"),
        (STUDENT_ID, "hocsinh.demo@ezedu.vn", "Học sinh Demo", "student"),
    )
    for user_id, email, full_name, role in users:
        await _upsert(db["users"], {"email": email}, {
            "_id": user_id,
            "email": email,
            "full_name": full_name,
            "role": role,
            "hashed_password": hashed_password,
            "status": "active",
            "is_active": True,
            "permissions_override": [],
            "deleted_at": None,
            "updated_at": now,
            "created_at": now,
        })

    await _upsert(db["learner_profiles"], {"user_id": str(STUDENT_ID)}, {
        "_id": PROFILE_ID,
        "user_id": str(STUDENT_ID),
        "grade_level": 10,
        "onboarding_completed": True,
        "updated_at": now,
        "created_at": now,
    })
    await _upsert(db["courses"], {"code": "DEMO-TOAN-10"}, {
        "_id": COURSE_ID,
        "code": "DEMO-TOAN-10",
        "title": "Toán 10 Demo",
        "description": "Khóa học mẫu dùng để trải nghiệm EzEdu.",
        "thumbnail": "",
        "subject": "Toán học",
        "grade": "Lớp 10",
        "teacher_ids": [str(TEACHER_ID)],
        "goals": ["Ôn tập đại số cơ bản"],
        "syllabus_overview": "Mệnh đề, tập hợp và hàm số.",
        "start_date": now.date().isoformat(),
        "end_date": (now + timedelta(days=90)).date().isoformat(),
        "status": "published",
        "deleted_at": None,
        "updated_at": now,
        "created_at": now,
    })
    lesson_number = 0
    for course in AI_SUGGESTED_COURSES:
        await _upsert(db["courses"], {"code": course["code"]}, {
            "_id": course["id"],
            "code": course["code"],
            "title": course["title"],
            "description": course["description"],
            "thumbnail": "",
            "subject": course["subject"],
            "grade": "Lớp 12",
            "teacher_ids": [str(TEACHER_ID)],
            "goals": course["goals"],
            "syllabus_overview": course["syllabus"],
            "start_date": now.date().isoformat(),
            "end_date": (now + timedelta(days=120)).date().isoformat(),
            "status": "published",
            "deleted_at": None,
            "updated_at": now,
            "created_at": now,
        })
        for sort_order, (chapter, title, content) in enumerate(course["lessons"], 1):
            lesson_number += 1
            lesson_id = ObjectId(f"000000000000000000000{300 + lesson_number:03d}")
            await _upsert(db["course_lessons"], {"_id": lesson_id}, {
                "_id": lesson_id,
                "course_id": str(course["id"]),
                "chapter_title": chapter,
                "title": title,
                "description": content[:180],
                "content": content,
                "duration_mins": 25,
                "sort_order": sort_order,
                "status": "published",
                "attachments": [],
                "deleted_at": None,
                "updated_at": now,
                "created_at": now,
            })
    await _upsert(db["course_enrollments"], {"_id": ENROLLMENT_ID}, {
        "_id": ENROLLMENT_ID,
        "course_id": str(COURSE_ID),
        "student_id": str(STUDENT_ID),
        "enrollment_date": now,
        "status": "learning",
        "progress_pct": 60,
        "gpa_average": 8.5,
        "completed_lessons": 3,
        "last_activity_at": now,
        "updated_at": now,
        "created_at": now,
    })
    await _upsert(db["questions"], {"_id": QUESTION_ID}, {
        "_id": QUESTION_ID,
        "subject_id": "toan-10",
        "grade": 10,
        "curriculum_version": "2018",
        "bloom_level": "understand",
        "difficulty": "easy",
        "question_type": "multiple_choice",
        "content": "Nghiệm của phương trình x + 2 = 5 là bao nhiêu?",
        "options": {"A": "1", "B": "2", "C": "3", "D": "4"},
        "correct_answer": "C",
        "explanation": "Chuyển 2 sang vế phải: x = 5 - 2 = 3.",
        "points": 10.0,
        "expected_time_seconds": 60,
        "tags": ["đại số", "phương trình"],
        "status": "published",
        "quality_status": "verified",
        "version": 1,
        "owner_id": str(TEACHER_ID),
        "created_by": str(TEACHER_ID),
        "updated_by": str(TEACHER_ID),
        "deleted_at": None,
        "updated_at": now,
        "created_at": now,
    })
    await _upsert(db["exams"], {"_id": EXAM_ID}, {
        "_id": EXAM_ID,
        "blueprint_id": "demo-blueprint",
        "blueprint_version": 1,
        "code": "DEMO-EXAM-01",
        "equivalent_group_id": "demo-exam-group",
        "question_ids": [str(QUESTION_ID)],
        "question_order_seed": 1,
        "total_points": 10.0,
        "duration_minutes": 15,
        "status": "published",
        "published_at": now,
        "audience_type": "all",
        "target_class_ids": [],
        "allow_retake": True,
        "version": 1,
        "owner_id": str(TEACHER_ID),
        "created_by": str(TEACHER_ID),
        "updated_by": str(TEACHER_ID),
        "deleted_at": None,
        "updated_at": now,
        "created_at": now,
    })
    await _upsert(db["exam_attempts"], {"_id": ATTEMPT_ID}, {
        "_id": ATTEMPT_ID,
        "exam_id": str(EXAM_ID),
        "exam_code": "DEMO-EXAM-01",
        "student_id": str(STUDENT_ID),
        "attempt_number": 1,
        "status": "graded",
        "answers": {str(QUESTION_ID): "C"},
        "started_at": now - timedelta(minutes=10),
        "due_at": now + timedelta(minutes=5),
        "submitted_at": now - timedelta(minutes=8),
        "auto_submitted": False,
        "total_score": 10.0,
        "max_score": 10.0,
        "results": [{
            "question_id": str(QUESTION_ID),
            "question_type": "multiple_choice",
            "points_possible": 10.0,
            "student_answer": "C",
            "is_correct": True,
            "final_score": 10.0,
        }],
        "version": 1,
        "updated_at": now,
        "created_at": now,
    })

    return {
        name: await db[name].count_documents({"demo_seed": DEMO_SEED_KEY})
        for name in DEMO_COLLECTIONS
    }


async def rollback_demo_data(db) -> int:
    removed = 0
    for name in reversed(DEMO_COLLECTIONS):
        result = await db[name].delete_many({"demo_seed": DEMO_SEED_KEY})
        removed += result.deleted_count
    return removed


async def _main() -> None:
    from app.database.mongodb import close_mongo_connection, connect_to_mongo, get_database

    password = os.getenv("DEMO_PASSWORD", "")
    if not password:
        raise SystemExit("Hãy đặt DEMO_PASSWORD trước khi chạy seed.")
    await connect_to_mongo()
    try:
        print(await seed_demo_data(get_database(), password=password))
    finally:
        await close_mongo_connection()


if __name__ == "__main__":
    asyncio.run(_main())
