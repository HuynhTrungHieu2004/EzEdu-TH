from __future__ import annotations

import ast
import csv
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "artifacts" / "system-analysis" / "inventory"
CASE_OUT = ROOT / "artifacts" / "system-analysis" / "case-studio2"


MODULE_PREFIXES = {
    "backend/app/routers/db_test.py": {None: "/api/v1/db"},
    "backend/app/routers/auth.py": {None: "/api/v1/auth"},
    "backend/app/routers/documents.py": {None: "/api/v1/documents"},
    "backend/app/routers/questions.py": {None: "/api/v1/questions"},
    "backend/app/routers/chat.py": {None: "/api/v1/chat"},
    "backend/app/routers/verification.py": {None: "/api/v1/documents"},
    "backend/app/routers/admin.py": {None: "/api/v1/admin/dashboard"},
    "backend/app/routers/admin_activity_logs.py": {None: "/api/v1/admin"},
    "backend/app/routers/admin_audit_logs.py": {None: "/api/v1/admin"},
    "backend/app/routers/admin_content.py": {None: "/api/v1/admin/content"},
    "backend/app/routers/admin_ai.py": {None: "/api/v1/admin/ai"},
    "backend/app/routers/admin_notifications.py": {None: "/api/v1/admin"},
    "backend/app/routers/admin_reports.py": {None: "/api/v1/admin"},
    "backend/app/routers/admin_users.py": {None: "/api/v1/admin/users"},
    "backend/app/routers/website_content.py": {
        "router": "/api/v1/website-content",
        "admin_router": "/api/v1/admin/website-content",
    },
    "backend/app/routers/system_settings.py": {
        "router": "/api/v1/admin",
        "public_router": "/api/v1",
    },
    "backend/app/routers/classes.py": {None: "/api/v1/classes"},
    "backend/app/personalization/api/candidates.py": {None: "/api/v1/personalization"},
    "backend/app/personalization/api/digital_twin.py": {None: "/api/v1/personalization"},
    "backend/app/personalization/api/knowledge_graph.py": {None: "/api/v1/personalization"},
    "backend/app/personalization/api/learner_state.py": {None: "/api/v1/personalization"},
    "backend/app/personalization/api/learning_events.py": {None: "/api/v1/personalization"},
    "backend/app/personalization/api/recommendations.py": {None: "/api/v1/personalization"},
    "backend/app/exam_bank/api/taxonomy.py": {None: "/api/v1"},
    "backend/app/exam_bank/api/questions.py": {None: "/api/v1"},
    "backend/app/exam_bank/api/blueprints.py": {None: "/api/v1"},
    "backend/app/exam_bank/api/exams.py": {None: "/api/v1"},
    "backend/app/exam_bank/api/attempts.py": {None: "/api/v1"},
    "backend/app/web_knowledge/api/explore.py": {None: "/api/v1"},
    "backend/app/web_knowledge/api/sources.py": {None: "/api/v1"},
    "backend/app/curriculum_kb/api/search.py": {None: "/api/v1"},
    "backend/app/curriculum_kb/api/registry.py": {None: "/api/v1"},
    "backend/app/main.py": {"app": ""},
}


COLLECTIONS = [
    ("users", "Identity", "_id", "-", "Tài khoản, vai trò, trạng thái, quota và quyền ghi đè", "Tham chiếu bởi user_id/owner_id/student_id/admin_user_id"),
    ("classes", "Identity", "_id", "owner_id", "Lớp học do giảng viên quản lý", "student_ids là mảng tham chiếu users"),
    ("documents", "Learning content", "_id", "user_id", "Metadata học liệu, trạng thái xử lý, Cloudinary và checksum", "Gốc của nội dung, chunk, kiểm chứng và bộ câu hỏi"),
    ("document_contents", "Learning content", "_id", "user_id", "Văn bản trích xuất hoặc transcript", "document_id → documents"),
    ("document_chunks", "Learning content", "_id", "user_id", "Chunk văn bản và metadata phục vụ RAG", "document_id → documents; vector song song ở ChromaDB"),
    ("verification_sessions", "Learning content", "_id", "user_id", "Phiên kiểm chứng nội dung bằng AI", "document_id → documents"),
    ("verification_issues", "Learning content", "_id", "user_id", "Vấn đề, đề xuất sửa và quyết định duyệt", "session_id → verification_sessions; document_id → documents"),
    ("question_sets", "Practice assessment", "_id", "user_id", "Bộ câu hỏi sinh từ học liệu, chứa questions[] nhúng", "document_id → documents; target_class_ids → classes"),
    ("question_attempts", "Practice assessment", "_id", "user_id", "Lượt luyện tập không giới hạn thời gian", "question_set_id → question_sets"),
    ("curriculum_taxonomy", "Exam bank", "_id", "-", "Cây môn/chương/chủ đề/chuẩn đầu ra", "parent_id tự tham chiếu"),
    ("questions", "Exam bank", "_id", "owner_id", "Câu hỏi độc lập có version và workflow", "subject/topic/... → curriculum_taxonomy; source_document_id → documents"),
    ("exam_blueprints", "Exam bank", "_id", "owner_id", "Ma trận/ràng buộc sinh đề", "subject_id → curriculum_taxonomy"),
    ("exams", "Exam bank", "_id", "owner_id", "Đề thi và mã đề tương đương", "blueprint_id → exam_blueprints; question_ids → questions; target_class_ids → classes"),
    ("exam_attempts", "Exam bank", "_id", "student_id", "Phiên thi có giờ, autosave, kết quả và chấm điểm", "exam_id → exams; results[] nhúng"),
    ("chat_messages", "Conversation", "_id", "user_id", "Lịch sử chat đơn giản theo một tài liệu", "document_id → documents"),
    ("conversations", "Conversation", "_id", "user_id", "Cuộc trò chuyện nâng cao, scope và tài liệu", "document_ids → documents"),
    ("conversation_messages", "Conversation", "_id", "user_id", "Tin nhắn, bằng chứng và citation", "conversation_id → conversations"),
    ("chat_locks", "Conversation", "_id", "user_id", "Khóa tương tranh theo cuộc trò chuyện", "conversation_id → conversations; TTL expires_at"),
    ("ai_answer_feedback", "Conversation", "_id", "user_id", "Đánh giá câu trả lời AI", "message_id → conversation_messages; conversation_id → conversations"),
    ("web_knowledge_cache", "Knowledge", "_id", "-", "Cache kết quả truy vấn web đã grounding", "unique normalized_query; TTL expires_at"),
    ("web_knowledge_sources", "Knowledge", "_id", "owner_id", "Nguồn web được lưu và duyệt", "Có thể chuyển thành curriculum source"),
    ("web_knowledge_daily_quota", "Knowledge", "_id", "user_id", "Quota khám phá web theo người dùng/ngày", "unique user_id + date"),
    ("curriculum_kb_sources", "Knowledge", "_id", "owner_id", "Nguồn tri thức chương trình đã duyệt và ingest", "Có thể xuất phát từ web_knowledge_sources"),
    ("knowledge_components", "Personalization", "_id", "created_by", "Khái niệm/đơn vị kiến thức", "parent/prerequisite/related và document/chunk references"),
    ("knowledge_graph_edges", "Personalization", "_id", "created_by", "Cạnh prerequisite/related trong knowledge graph", "source/target → knowledge_components"),
    ("learning_items", "Personalization", "_id", "-", "Vật phẩm học tập có Q-matrix và độ khó", "document/question/chunk/KC references"),
    ("learning_events", "Personalization", "_id", "user_id", "Sự kiện hành vi học chuẩn hóa", "item_id → learning_items; KC ids → knowledge_components"),
    ("learning_sessions", "Personalization", "_id", "user_id", "Phiên học và ngữ cảnh", "document_id → documents"),
    ("learner_profiles", "Personalization", "_id", "user_id", "Hồ sơ, mục tiêu, sở thích và năng lực tổng quát", "unique user_id → users"),
    ("learner_knowledge_states", "Personalization", "_id", "user_id", "Mastery/BKT/IRT theo người học và KC", "unique user_id + knowledge_component_id"),
    ("recommendation_logs", "Personalization", "_id", "user_id", "Ứng viên, điểm xếp hạng, lý do và phản hồi", "item_id → learning_items"),
    ("cluster_models", "Personalization", "_id", "-", "Mô hình K-Means đã version hóa", "cluster_type + version unique"),
    ("bandit_policies", "Personalization", "_id", "-", "Chính sách contextual bandit", "policy_type + version unique"),
    ("ai_usage_events", "Operations", "_id", "user_id", "Telemetry request AI, token, độ trễ, chi phí và trạng thái", "document/conversation optional references"),
    ("audit_logs", "Operations", "_id", "actor_user_id", "Nhật ký sự kiện quản trị dashboard cũ", "actor_user_id → users"),
    ("user_activity_logs", "Operations", "_id", "user_id", "Nhật ký hoạt động người dùng và security", "resource_type/resource_id đa hình"),
    ("admin_audit_logs", "Operations", "_id", "admin_user_id", "Audit bất biến cho thao tác quản trị", "target_type/target_id đa hình"),
    ("website_content", "Operations", "_id", "-", "Nội dung CMS hiện hành theo section_key", "Mỗi section có version"),
    ("website_content_versions", "Operations", "_id", "-", "Snapshot version CMS bất biến", "section_key → website_content.section_key"),
    ("system_settings", "Operations", "_id", "-", "Cấu hình runtime", "unique key"),
    ("feature_flags", "Operations", "_id", "-", "Cờ tính năng và allowed roles/users", "unique key"),
    ("system_error_logs", "Operations", "_id", "user_id", "Lỗi chuẩn hóa theo endpoint/request", "request_id/correlation_id"),
    ("system_health_snapshots", "Operations", "_id", "-", "Ảnh chụp sức khỏe thành phần", "checked_at"),
    ("admin_notifications", "Operations", "_id", "created_by", "Thông báo theo đối tượng/role/user", "target_user_ids → users"),
    ("notification_reads", "Operations", "_id", "user_id", "Trạng thái đã đọc thông báo", "notification_id → admin_notifications"),
    ("background_jobs", "Operations", "_id", "-", "Hàng đợi job MongoDB bền, retry/dead-letter", "idempotency_key unique khi có"),
]


def clean_path(prefix: str, path: str) -> str:
    value = f"{prefix.rstrip('/')}/{path.lstrip('/')}" if path else prefix
    if not value:
        return "/"
    return "/" + "/".join(part for part in value.split("/") if part)


def literal_string(node: ast.AST | None) -> str:
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    return ""


def route_actor(path: str) -> str:
    if path in {"/", "/health", "/health/ready", "/api/v1/runtime-config", "/api/v1/website-content"}:
        return "Khách/Hệ thống"
    if "/admin/" in path:
        if "reports" in path or "dashboard" in path:
            return "Admin/Analyst"
        return "Admin theo permission"
    if "/question-bank/" in path or "/exam-blueprints" in path:
        return "Giảng viên/Admin"
    if "/exam-attempts/" in path or path.endswith("/attempts/start"):
        return "Học sinh hoặc Giảng viên chấm"
    if "/exams/" in path:
        return "Giảng viên/Học sinh theo endpoint"
    if "/classes" in path:
        return "Giảng viên/Học sinh theo endpoint"
    if "/personalization" in path:
        return "Học sinh/Giảng viên/Admin theo endpoint"
    if "/documents" in path or "/questions" in path:
        return "Giảng viên/Học sinh theo endpoint"
    if "/chat" in path or "/web-knowledge" in path or "/curriculum-kb" in path:
        return "Người dùng đã đăng nhập"
    if "/auth/" in path:
        return "Khách/Người dùng"
    return "Theo dependency của endpoint"


def subsystem(path: str) -> str:
    groups = [
        ("/auth", "Identity & Access"),
        ("/admin/users", "Admin Users"),
        ("/admin/content", "Admin Content"),
        ("/admin/ai", "Admin AI"),
        ("/admin/website-content", "CMS"),
        ("/website-content", "CMS"),
        ("/admin/settings", "Runtime Settings"),
        ("/admin/feature-flags", "Runtime Settings"),
        ("/admin/notifications", "Notifications"),
        ("/admin/reports", "Reports"),
        ("/admin/activity-logs", "Activity Logs"),
        ("/admin/audit-logs", "Audit Logs"),
        ("/admin/dashboard", "Admin Dashboard"),
        ("/documents", "Documents & Verification"),
        ("/questions", "Generated Question Sets"),
        ("/question-bank", "Question Bank"),
        ("/exam-blueprints", "Exam Blueprints"),
        ("/exam-attempts", "Timed Exam"),
        ("/exams", "Exam Bank"),
        ("/classes", "Classes"),
        ("/chat", "Chat & RAG"),
        ("/personalization", "Personalization"),
        ("/web-knowledge", "Web Knowledge"),
        ("/curriculum-kb", "Curriculum KB"),
        ("/health", "System Health"),
        ("/db", "Database"),
    ]
    for prefix, name in groups:
        if prefix in path:
            return name
    return "Platform"


def extract_routes() -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for rel_path, prefix_map in MODULE_PREFIXES.items():
        path = ROOT / rel_path
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            for dec in node.decorator_list:
                if not isinstance(dec, ast.Call) or not isinstance(dec.func, ast.Attribute):
                    continue
                method = dec.func.attr.upper()
                if method not in {"GET", "POST", "PUT", "PATCH", "DELETE"}:
                    continue
                owner = dec.func.value.id if isinstance(dec.func.value, ast.Name) else None
                if rel_path == "backend/app/main.py" and owner != "app":
                    continue
                if rel_path != "backend/app/main.py" and owner not in {"router", "admin_router", "public_router"}:
                    continue
                prefix = prefix_map.get(owner, prefix_map.get(None, ""))
                route_path = literal_string(dec.args[0]) if dec.args else ""
                full_path = clean_path(prefix, route_path)
                summary = ""
                for keyword in dec.keywords:
                    if keyword.arg == "summary":
                        summary = literal_string(keyword.value)
                doc = ast.get_docstring(node) or ""
                purpose = summary or (doc.splitlines()[0].strip() if doc else node.name.replace("_", " "))
                rows.append(
                    {
                        "method": method,
                        "path": full_path,
                        "subsystem": subsystem(full_path),
                        "actor": route_actor(full_path),
                        "handler": node.name,
                        "purpose": purpose,
                        "source": f"{rel_path}:{getattr(node, 'lineno', '')}",
                    }
                )
    rows.sort(key=lambda item: (item["subsystem"], item["path"], item["method"]))
    return rows


def write_api_csv(rows: list[dict[str, str]]) -> None:
    with (OUT / "api_inventory.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["method", "path", "subsystem", "actor", "handler", "purpose", "source"],
        )
        writer.writeheader()
        writer.writerows(rows)


def write_data_csv() -> None:
    header = ["collection", "domain", "logical_pk", "owner_field", "purpose", "relationships"]
    for target in (OUT / "data_inventory.csv", CASE_OUT / "data_dictionary.csv"):
        with target.open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.writer(handle)
            writer.writerow(header)
            writer.writerows(COLLECTIONS)


def write_system_inventory(route_count: int) -> None:
    content = f"""# Inventory hệ thống EzEdu AI

Ngày khảo sát: 29/07/2026

## Quy mô mã nguồn

- Backend: FastAPI bất đồng bộ, MongoDB/Motor, ChromaDB, worker MongoDB.
- Frontend: React 19, TypeScript 6, Vite 8, React Router 7.
- API được phát hiện từ decorator: **{route_count} endpoint**.
- Collection/logical data surfaces được đưa vào inventory: **{len(COLLECTIONS)}**.
- Vai trò ứng dụng: `student`, `lecturer`, `user` (legacy).
- Vai trò quản trị: `analyst`, `support`, `moderator`, `admin`, `super_admin`.

## Phân hệ

1. Identity & Access: đăng ký, đăng nhập, JWT, role và permission.
2. Documents & RAG: upload, extract/transcribe, chunk, embedding, index, search, clustering.
3. Verification: kiểm chứng AI, duyệt vấn đề, áp dụng sửa và re-index.
4. Generated Question Sets: sinh câu hỏi từ học liệu, workflow, publish, luyện tập, xuất Word/PDF.
5. Classes: quản lý lớp và phân phối nội dung/đề theo lớp.
6. Exam Bank: taxonomy, ngân hàng câu hỏi, blueprint, sinh mã đề, thi có giờ, chấm điểm.
7. Chat & Knowledge: chat theo tài liệu, chat nâng cao, grounding web, citation và feedback.
8. Curriculum KB: nguồn chương trình, duyệt, ingest và tìm kiếm.
9. Personalization: knowledge graph, learning events, BKT/IRT, digital twin, candidate/ranking, bandit.
10. Administration: dashboard, user/content/AI/CMS/settings/flags/notification/report/log/health.

## Kiến trúc triển khai

`React SPA → FastAPI API → MongoDB`, song song với:

- `Cloudinary/local` cho file.
- `ChromaDB` cho vector.
- `Gemini/Groq` cho sinh, kiểm chứng, embedding, chat, grounding, transcription/chấm tự luận.
- `Mongo background_jobs + worker` cho job bền và auto-submit.

## Nguồn xác minh chính

- `frontend/src/App.tsx`
- `backend/app/main.py`
- `backend/app/core/rbac.py`
- `backend/app/core/config.py`
- `backend/app/database/mongodb.py`
- `backend/app/routers/*.py`
- `backend/app/exam_bank/`
- `backend/app/personalization/`
- `backend/app/web_knowledge/`
- `backend/app/curriculum_kb/`
- `docs/feature-expansion/70-final-integration-qa.md`
- `docs/ui-redesign/17-claude-final-completion.md`
"""
    (OUT / "system_inventory.md").write_text(content, encoding="utf-8")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    CASE_OUT.mkdir(parents=True, exist_ok=True)
    routes = extract_routes()
    write_api_csv(routes)
    write_data_csv()
    write_system_inventory(len(routes))
    print(f"Generated {len(routes)} routes and {len(COLLECTIONS)} collections.")


if __name__ == "__main__":
    main()
