# 70 — Bàn giao: Tích hợp & QA cuối cùng (Giai đoạn 8)

> Tiếp theo [60-standard-curriculum-knowledge.md](60-standard-curriculum-knowledge.md) (Giai đoạn 7, đã hoàn thành — giai đoạn cuối cùng có tính năng mới). Phạm vi: KHÔNG thêm tính năng mới — rà soát toàn hệ thống 7 phân hệ đã xây (00→60), tìm và sửa lỗi tích hợp chéo phân hệ, đối chiếu tài liệu kế hoạch (Giai đoạn 1) với thực tế đã build, chạy toàn bộ test/build/lint.

## Phương pháp
Chạy 1 lượt rà soát có hệ thống qua 8 mục: (1) tính nhất quán feature flag, (2) va chạm route, (3) tính nhất quán tài liệu kế hoạch vs thực tế, (4) đăng ký job nền, (5) test suite, (6) frontend build/lint/typecheck, (7) hạ tầng Playwright/E2E, (8) dữ liệu QA còn sót lại trong mã nguồn. Mỗi mục có bằng chứng cụ thể (file:line), không chỉ liệt kê chung chung.

## Bug thật phát hiện và đã sửa

### 1. Thiếu feature flag cho Ngân hàng câu hỏi/Ma trận đề (Giai đoạn 3) và Làm bài thi (Giai đoạn 4)
**Phát hiện:** `01-target-architecture.md` (mục 12, giai đoạn 1) đã lên kế hoạch rõ 4 flag: `ENABLE_EXAM_BLUEPRINT`, `ENABLE_TIMED_EXAM`, `ENABLE_WEB_KNOWLEDGE`, `ENABLE_CURRICULUM_KB` — tất cả mặc định `False`, "bật dần theo roadmap". Giai đoạn 6 và 7 đã thêm đúng 2 flag của mình. Giai đoạn 3 và 4 thì **không** — `app/exam_bank/api/deps.py` chỉ kiểm tra `role`, không có cổng feature-flag nào, khiến 2 phân hệ cốt lõi này **không có công tắc tắt cấp quản trị**, khác biệt với chính 2 phân hệ mới hơn được xây sau — vi phạm nhất quán trong cùng 1 codebase.

**Đã sửa:** thêm `ENABLE_EXAM_BLUEPRINT`/`ENABLE_TIMED_EXAM` vào `config.py` (mặc định `False`, đúng kế hoạch gốc). Cổng riêng 2 flag (không dùng chung 1) vào đúng 2 dependency đã có sẵn:
- `require_exam_bank_actor` (giáo viên soạn ngân hàng câu hỏi/ma trận đề/sinh đề) → cổng bằng `ENABLE_EXAM_BLUEPRINT`.
- `require_student_actor` (học sinh làm bài thi có giờ) → cổng bằng `ENABLE_TIMED_EXAM`.

Tách riêng 2 flag (thay vì 1 flag chung) có chủ đích: cho phép bật ngân hàng câu hỏi/ma trận đề để giáo viên soạn đề trước, trong khi vẫn có thể tắt riêng việc học sinh làm bài thi thật cho tới khi sẵn sàng — đúng tinh thần "bật dần theo roadmap".

**Tác động tới môi trường dev đang chạy:** vì đây là 2 phân hệ đã xây dựng, kiểm thử đầy đủ và đã được dùng xuyên suốt các phiên trước (khác Giai đoạn 6/7 mới, còn thử nghiệm), **đã bật `ENABLE_EXAM_BLUEPRINT=true`/`ENABLE_TIMED_EXAM=true` trong `backend/.env` cục bộ** (không phải giá trị mặc định trong code — code vẫn mặc định `False` đúng kế hoạch) để môi trường dev này tiếp tục hoạt động như trước. `ENABLE_WEB_KNOWLEDGE`/`ENABLE_CURRICULUM_KB` giữ nguyên tắt (`.env` không có 2 dòng này) vì là tính năng mới hơn, phù hợp còn ở trạng thái "chờ bật khi sẵn sàng".

**Test:** 4 test cũ trong `test_exam_bank_role_guard.py` (kiểm tra vai trò "allowed") bị lỗi 403 do flag mặc định `False` — đã sửa bằng `patch.object(settings, "ENABLE_EXAM_BLUEPRINT"/"ENABLE_TIMED_EXAM", True)` bọc quanh phần kiểm tra vai trò (tách rõ 2 mối quan tâm: vai trò vs feature flag). Thêm 2 test mới xác nhận rõ ràng feature flag tắt thì chặn TẤT CẢ vai trò kể cả admin (`test_exam_blueprint_feature_flag_off_blocks_everyone`, `test_timed_exam_feature_flag_off_blocks_everyone`). 51 test khác trong các file `test_exam_bank_*.py`/`test_exam_bank_attempt.py` gọi thẳng hàm service (không qua tầng dependency), nên không bị ảnh hưởng — đã xác nhận qua chạy lại toàn bộ.

## Rà soát — không phát hiện lỗi (đã kiểm tra kỹ, ghi lại để không kiểm tra lại về sau)

### 2. Va chạm route
Kiểm tra toàn bộ path của 3 router mới (`exam_bank`, `web_knowledge`, `curriculum_kb`) cộng router cũ (`documents`, `questions`) — không có va chạm literal path+method nào. Xác nhận lỗi thứ tự route kiểu Giai đoạn 3 (`/{question_set_id}` che khuất `/questions/import`, đã sửa lúc đó) **không lặp lại** ở bất kỳ router nào khác — mọi route tham số hoá (`/{document_id}`, `/{question_set_id}`) đều đặt sau các route tĩnh cùng cấp, và các route mới đều dùng tiền tố riêng biệt (`/question-bank/*`, `/exam-blueprints/*`, `/exams/*`, `/exam-attempts/*`, `/web-knowledge/*`, `/curriculum-kb/*`).

### 3. Đối chiếu `03-api-plan.md` (kế hoạch Giai đoạn 1) với thực tế đã build
Tài liệu kế hoạch viết TRƯỚC khi có bất kỳ dòng code nào — như mọi kế hoạch, có sai khác với thực tế khi build, đây là bình thường và đã được từng giai đoạn tự động điều chỉnh theo nhu cầu thực tế phát sinh (ví dụ: gộp dedup thẳng vào `upload_document` thay vì endpoint `reuse-check` riêng — đã giải thích trong `40-cloudinary-learning-materials.md`). Liệt kê lại các sai khác CHƯA từng được ghi chú ở đâu, để không ai nhầm là còn thiếu việc:

| Kế hoạch (`03-api-plan.md`) | Thực tế | Ghi chú |
|---|---|---|
| `/question-bank/taxonomy` | `/taxonomy` (bare) | Đổi tên namespace, không ảnh hưởng chức năng |
| `/curriculum/*` | `/curriculum-kb/*` | Đổi tên namespace lúc build Giai đoạn 7 |
| `POST /web-knowledge/{id}/reverify`, `GET /web-knowledge/{id}` | Không xây | Chấm điểm AI + duyệt lại thủ công (`review`) đã đủ đáp ứng yêu cầu nghiệp vụ, không cần "reverify" riêng |
| `GET /exam-attempts/{id}/result`, `GET /exam-attempts/pending-review` | Không xây | `GET /exam-attempts/{id}` (học sinh) + `GET /exams/{exam_id}/attempts` (giáo viên, đã có mọi kết quả) đã đủ, không cần 2 endpoint riêng |
| `GET /exams/{id}/export` | Không xây | Kế hoạch gốc đã tự ghi "không hứa trước" — chưa có nhu cầu thực tế |
| `POST /documents/{id}/reuse-check`, `PATCH .../metadata`, `POST .../restore`, `GET /documents/usage-summary` | Không xây | Dedup gộp vào upload; `restore`/`usage-summary` chưa có yêu cầu nghiệp vụ cụ thể — để lại nếu phát sinh nhu cầu (YAGNI) |
| `GET /admin/content/exams` (đề thi CŨ, dựa trên `question_sets`) vs `Exam` MỚI (exam_bank) | Cả 2 cùng tồn tại, tên khác nhau ở tầng UI | Đã kiểm tra: sidebar admin ghi "Đề thi" (`/admin/exams`), sidebar giáo viên ghi "Ma trận đề"/"Ngân hàng câu hỏi" (`/exam-blueprints`, `/question-bank`) — **2 khu vực UI khác nhau, nhãn khác nhau, không nhầm lẫn trong thực tế** dù cùng khái niệm "đề thi". Không cần đổi tên gì thêm. |

### 4. Đăng ký job nền (`app/worker.py`)
3 job type đã đăng ký (`grade_essay_answer`, `cleanup_cloudinary_asset`, `ingest_curriculum_source`) khớp chính xác với 3 nơi gọi `enqueue()` duy nhất trong toàn bộ backend — không có job nào bị xếp hàng mà thiếu handler (sẽ bị kẹt vĩnh viễn ở `pending` nếu có).

### 5-6. Test suite + frontend
- Backend: `python -m pytest tests -q` → **405 passed**, 0 fail (toàn bộ 7 giai đoạn cộng dồn + 2 test mới của giai đoạn này).
- Frontend: `tsc --noEmit` sạch, `eslint src` sạch, `npm run build` thành công.

### 7. Playwright / E2E
**Không có** — không tìm thấy `playwright.config.*`, không có thư mục test E2E, không có dependency `playwright` trong `package.json`. Thư mục `.playwright-mcp/` chỉ là thư mục scratch của MCP tool, không phải bộ test thật. Đây là khoảng trống có thật, KHÔNG tự ý xây dựng thêm ở giai đoạn này (yêu cầu chỉ nói "tự chạy Playwright nếu phù hợp" — không có gì để chạy; dựng cả bộ khung E2E từ đầu là phạm vi lớn ngoài yêu cầu "tích hợp & QA cuối" của giai đoạn này). Ghi nhận rõ để nếu cần, giai đoạn sau biết đây là việc phải làm từ đầu, không phải "đã có nhưng quên chạy".

### 8. Dữ liệu QA còn sót trong mã nguồn
Không tìm thấy tài khoản/dữ liệu QA (`ezedu-qa.example.com` hay tương tự) lẫn vào mã nguồn thật — chỉ có trong `tests/` (đúng chỗ) và ví dụ docstring generic (`user@example.com`). Đã xoá tài khoản QA tạo trong phiên này (`qa.p8.teacher@...`) sau khi kiểm thử.

## Quan sát thêm (không phải lỗi, không cần sửa)
`frontend/.claude/worktrees/cool-wu-808bec/` — thư mục worktree cũ, đã có từ trước phiên làm việc này (không phải do các giai đoạn 1-8 tạo ra), đã nằm trong `.git/info/exclude` (không được Git theo dõi, không ảnh hưởng commit/deploy). Không đụng tới vì không rõ có phải phiên làm việc khác đang dùng dở hay không — an toàn hơn là để nguyên.

## Tổng kết toàn bộ 8 giai đoạn

| Giai đoạn | Tài liệu | Trạng thái |
|---|---|---|
| 1 — Khảo sát & kiến trúc | 00-05 | Hoàn thành |
| 2 — Hạ tầng dùng chung | 10 | Hoàn thành |
| 3 — Ngân hàng câu hỏi & Ma trận đề | 20 | Hoàn thành, **nay có `ENABLE_EXAM_BLUEPRINT`** |
| 4 — Làm bài thi có giờ & chấm AI | 30 | Hoàn thành, **nay có `ENABLE_TIMED_EXAM`** |
| 5 — Cloudinary dedup/retry/webhook | 40 | Hoàn thành |
| 6 — Khám phá kiến thức Internet | 50 | Hoàn thành, có `ENABLE_WEB_KNOWLEDGE` |
| 7 — Kho tri thức chuẩn | 60 | Hoàn thành, có `ENABLE_CURRICULUM_KB` |
| 8 — Tích hợp & QA cuối | 70 (tài liệu này) | Hoàn thành |

**Test cộng dồn: 405 backend test, 100% pass.** Mỗi giai đoạn đều đã kiểm thử thật trên MongoDB Atlas + (Cloudinary/Gemini/Chroma) thật, không chỉ mongomock — ít nhất 1 bug thật được phát hiện và tự sửa ở mỗi giai đoạn 3-8 trước khi bàn giao (chi tiết trong từng tài liệu 20-70), cộng thêm bug feature-flag phát hiện ở chính giai đoạn này.
