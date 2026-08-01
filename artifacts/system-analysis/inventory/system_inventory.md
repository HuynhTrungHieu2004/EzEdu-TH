# Inventory hệ thống EzEdu AI

Ngày khảo sát: 29/07/2026

## Quy mô mã nguồn

- Backend: FastAPI bất đồng bộ, MongoDB/Motor, ChromaDB, worker MongoDB.
- Frontend: React 19, TypeScript 6, Vite 8, React Router 7.
- API được phát hiện từ decorator: **199 endpoint**.
- Collection/logical data surfaces được đưa vào inventory: **46**.
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
