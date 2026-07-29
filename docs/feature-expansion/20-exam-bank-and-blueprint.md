# 20 — Bàn giao: Ngân hàng câu hỏi, Ma trận đề, Sinh đề theo ma trận (Giai đoạn 3)

> Tiếp theo [10-foundation-implementation.md](10-foundation-implementation.md) (Giai đoạn 2, đã hoàn thành). Phạm vi giai đoạn này: ma trận đề thi (blueprint), ngân hàng câu hỏi (question bank, tách khỏi `question_sets.questions[]` hiện có), sinh đề tự động từ ma trận bằng CP-SAT (OR-Tools), nhiều mã đề tương đương, và UI giáo viên cho toàn bộ luồng trên.

## Dependency đã thêm

| Package | Lý do |
|---|---|
| `ortools==9.15.6755` | CP-SAT solver — bắt buộc theo quyết định ở [01-target-architecture.md](01-target-architecture.md): sinh đề theo ma trận nhiều ràng buộc (số câu/điểm theo chủ đề, Bloom, độ khó, dạng câu, tổng điểm, không trùng câu) cần constraint-satisfaction solver thật, không dùng AI để thay thế bước kiểm tra ràng buộc |
| `numpy` nâng từ `1.26.4` → `2.4.6`, `pandas==3.0.5`, `absl-py==2.5.0`, `immutabledict==4.3.1` | Kéo theo tự động khi cài `ortools` (transitive dependencies). Đã xác nhận không phá scikit-learn/chromadb hiện có — chạy lại toàn bộ 284 test cũ ngay sau khi cài, không có regression |

Không thêm Redis/Celery/Temporal — sinh đề chạy đồng bộ trong request (`POST /exams/generate`, có idempotency-key), vì thời gian giải CP-SAT thực đo được dưới 1 giây kể cả với 2000 câu hỏi ứng viên (xem `test_blueprint_solver.py` phần performance) — chưa đến ngưỡng cần đẩy ra background job.

## Kiến trúc — module `app/exam_bank/`

Nhân bản đúng vertical-slice pattern đã có ở `app/personalization/` (`api/`, `schemas/`, `services/`, `repositories/`, `constants/`), thay vì tạo router lẻ trong `app/routers/`.

**Quyết định dữ liệu quan trọng nhất** (chi tiết ở [02-data-model-plan.md](02-data-model-plan.md)): collection `questions` (ngân hàng câu hỏi dùng chung nhiều đề) là entity **hoàn toàn tách biệt, song song** với `question_sets.questions[]` (mảng lồng hiện có) — **không** merge/migrate. Lý do: tránh phá `QuestionSetEditorPage.tsx`/`PracticeAttemptPage.tsx`/`QuestionCard.tsx` (đã redesign kỹ ở phiên trước) và tránh trùng lặp dữ liệu giữa hai luồng nghiệp vụ khác mục đích (sinh nhanh theo tài liệu vs. ngân hàng câu hỏi tái sử dụng nhiều lần).

Taxonomy câu hỏi giữ nguyên giá trị hiện có để không tạo hệ phân loại thứ hai không tương thích:
`question_type ∈ {multiple_choice, true_false, short_answer}`, `difficulty ∈ {easy, medium, hard}`, `bloom_level ∈ {remember, understand, apply, analyze}`.

### File backend đã tạo mới

| File | Việc |
|---|---|
| `app/exam_bank/constants/collections.py` | Tên collection: `curriculum_taxonomy`, `questions`, `exam_blueprints`, `exams` |
| `app/exam_bank/schemas/taxonomy.py`, `question.py`, `blueprint.py`, `exam.py` | Pydantic schema + state machine cho từng entity (`is_valid_bank_transition`, `is_valid_blueprint_transition`, `is_valid_exam_transition`) |
| `app/exam_bank/repositories/indexes.py` | `ensure_exam_bank_indexes(db)` — index cho cả 4 collection, gọi trong `lifespan()` của `main.py` |
| `app/exam_bank/services/taxonomy_service.py` | CRUD cây môn/lớp/chương/chủ đề/chuẩn đầu ra |
| `app/exam_bank/services/question_bank_service.py` | CRUD + import hàng loạt + review (draft→reviewing→approved→published→archived) + bulk approve/archive. Sửa câu đã duyệt/xuất bản tự động reset về `draft` (giống hành vi `question_sets` hiện có) |
| `app/exam_bank/services/blueprint_service.py` | CRUD ma trận (chỉ sửa được khi `draft`), `fetch_candidate_questions` (lọc theo môn/lớp/chương trình + trạng thái approved/published + loại câu dùng gần đây nếu có cấu hình `exclude_recently_used_days`), `validate_blueprint` (gọi solver, chuyển `draft→validated` khi khả thi, **không** chuyển trạng thái khi INFEASIBLE), `clone_blueprint`, `archive_blueprint` |
| `app/exam_bank/services/blueprint_solver_service.py` | Lõi CP-SAT: biến chọn/không-chọn từng câu ứng viên, ràng buộc tổng điểm/số câu theo từng nhóm (chủ đề/Bloom/độ khó/dạng câu), điểm float quy đổi số nguyên qua `POINTS_SCALE=100`, `max_time_in_seconds=10`, trả đúng 1 trong 4 trạng thái `OPTIMAL/FEASIBLE/INFEASIBLE/UNKNOWN`. Khi INFEASIBLE: phân tích heuristic từng nhóm ràng buộc riêng lẻ (không phải IIS đầy đủ — đã ghi rõ trong docstring), trả về đúng số câu/điểm còn thiếu ở từng nhóm, **không** tạo đề sai ma trận |
| `app/exam_bank/services/shuffle_service.py` | Sinh N mã đề tương đương: RNG có seed riêng theo từng mã (`f"{base_seed}:{code_index}"`, không dùng chung state ngẫu nhiên toàn cục) — luôn xáo thứ tự câu hỏi, chỉ xáo đáp án của `multiple_choice` (không xáo `true_false`/`short_answer` vì sẽ phá nghĩa câu), đáp án đúng được ánh xạ lại theo **nội dung** đáp án (không theo vị trí chữ cái cũ) để đảm bảo đúng sau khi xáo |
| `app/exam_bank/services/exam_service.py` | `generate_exams` (validate blueprint đã `validated`, giải 1 lần, sinh N mã), `regenerate_section` (ép giữ nguyên câu hỏi ngoài nhóm cần sinh lại qua `solve_blueprint_with_forced`), `preview_exam` (áp xáo trộn theo từng mã, có tuỳ chọn ẩn đáp án), `publish_exam`, `clone_exam`, `archive_exam` |
| `app/exam_bank/api/deps.py` | `require_exam_bank_actor()` — chỉ `user/lecturer/admin/super_admin` được dùng (học sinh bị chặn 403), theo đúng yêu cầu "không hiện công cụ này cho học sinh". Cố ý dùng tập vai trò ad-hoc giống các router nghiệp vụ khác (`questions.py`), không dùng hệ `Permission` tinh hơn của `app/core/rbac.py` (hệ đó dành cho khu vực admin-console) |
| `app/exam_bank/api/taxonomy.py`, `questions.py`, `blueprints.py`, `exams.py`, `api/__init__.py` | Router FastAPI — xem bảng endpoint bên dưới |

### File backend đã sửa

| File | Thay đổi |
|---|---|
| `app/main.py` | Thêm `ensure_exam_bank_indexes` vào `lifespan()`; đăng ký `exam_bank_router` với `prefix=settings.API_V1_STR`, đặt sau `classes.router` |
| `backend/requirements.txt` | Thêm `ortools`, `pandas`, `absl-py`, `immutabledict`; nâng `numpy` |

### Endpoint đã tạo (xác nhận qua `GET /api/v1/openapi.json`, không va chạm route hiện có)

```
POST   /api/v1/taxonomy
GET    /api/v1/taxonomy

POST   /api/v1/question-bank/questions
GET    /api/v1/question-bank/questions
GET    /api/v1/question-bank/questions/{id}
PATCH  /api/v1/question-bank/questions/{id}
POST   /api/v1/question-bank/questions/import
POST   /api/v1/question-bank/questions/{id}/review
POST   /api/v1/question-bank/questions/bulk-approve
POST   /api/v1/question-bank/questions/bulk-archive

POST   /api/v1/exam-blueprints
GET    /api/v1/exam-blueprints
GET    /api/v1/exam-blueprints/{id}
PATCH  /api/v1/exam-blueprints/{id}
POST   /api/v1/exam-blueprints/{id}/validate
POST   /api/v1/exam-blueprints/{id}/clone
POST   /api/v1/exam-blueprints/{id}/archive

POST   /api/v1/exams/generate          (bắt buộc header Idempotency-Key)
GET    /api/v1/exams
GET    /api/v1/exams/{id}
GET    /api/v1/exams/{id}/preview
POST   /api/v1/exams/{id}/regenerate-section
POST   /api/v1/exams/{id}/publish
POST   /api/v1/exams/{id}/clone
POST   /api/v1/exams/{id}/archive
```

## Frontend — UI giáo viên

| File | Việc |
|---|---|
| `frontend/src/api/examBankApi.ts` | Toàn bộ type + hàm gọi API cho 3 nhóm trên; `newIdempotencyKey()` tự gắn header `Idempotency-Key` cho `generateExams()` |
| `frontend/src/pages/teacher/QuestionBankPage.tsx` | Danh sách câu hỏi, lọc theo trạng thái/Bloom/độ khó, chọn nhiều + duyệt hàng loạt/lưu trữ hàng loạt, có đủ trạng thái rỗng/tải/lỗi |
| `frontend/src/pages/teacher/ExamBlueprintListPage.tsx` | Danh sách ma trận + dialog tạo mới (tên, môn, lớp, chương trình, tổng điểm, thời gian) |
| `frontend/src/pages/teacher/ExamBlueprintDetailPage.tsx` | Trang cấu hình ma trận dạng bảng: 4 nhóm ràng buộc (chủ đề/Bloom/độ khó/dạng câu), tổng số câu/điểm tính real-time (`useMemo`), nút Lưu ràng buộc + Kiểm tra khả thi (hiển thị đúng trạng thái solver và chi tiết từng nhóm thiếu khi INFEASIBLE), nút Sinh đề (chỉ hiện khi đã `validated`), danh sách mã đề đã sinh + Xem trước (ẩn đáp án) |
| `frontend/src/App.tsx` | Thêm 3 route lazy-loaded: `/question-bank`, `/exam-blueprints`, `/exam-blueprints/:id` — bọc `RoleRoute allow={TEACHER_ONLY}` (học sinh không thấy, đúng yêu cầu) |
| `frontend/src/components/AppLayout.tsx` | Thêm 2 mục nav trong khu vực giáo viên: "Ngân hàng câu hỏi", "Ma trận đề" |

**Ràng buộc UI quan trọng đã cài đúng:** một khi ma trận chuyển `validated`, backend chặn `PATCH /exam-blueprints/{id}` (chỉ sửa được khi `draft`) — trang chi tiết vô hiệu hoá toàn bộ ô nhập/nút thêm dòng/nút Lưu ràng buộc khi `status !== 'draft'` và hiện banner giải thích, tránh gọi API chắc chắn lỗi 400.

## Test đã chạy

```
python -m pytest tests -q
```
**342 passed**, 0 fail (284 test cũ từ Giai đoạn 1–2 + 58 test mới của giai đoạn này). Danh sách test mới:

| File | Số test | Bao phủ |
|---|---|---|
| `test_blueprint_solver.py` | 9 | OPTIMAL/FEASIBLE cơ bản, thiếu câu ở 1 nhóm cụ thể, thiếu tổng điểm, sai tổng điểm, trùng câu bị chặn, hiệu năng 2000 câu ứng viên (< 15s) |
| `test_shuffle_service.py` | 9 | Seed tái lập được, các mã đề độc lập nhau, không xáo `true_false`/`short_answer`, đáp án đúng ánh xạ lại đúng theo nội dung sau khi xáo |
| `test_exam_bank_question.py` | 11 | CRUD, import hàng loạt, review đúng state machine, sửa câu đã duyệt tự reset draft, phân trang, quyền sở hữu |
| `test_exam_bank_blueprint.py` | 7 | Tạo/sửa/validate/clone/archive, chặn sửa khi không phải draft, kết quả `missing` khi INFEASIBLE |
| `test_exam_bank_exam.py` | 13 | Sinh N mã đề, regenerate 1 nhóm giữ nguyên câu ngoài nhóm, preview ẩn/hiện đáp án, publish/clone/archive, version-conflict (409), blueprint infeasible không cho generate |
| `test_exam_bank_api_idempotency.py` | 3 | Thiếu idempotency-key bị từ chối (400), gọi lại cùng key không tạo đề 2 lần, key khác nhau tạo đề độc lập |
| `test_exam_bank_role_guard.py` | 6 | Học sinh bị chặn 403, giáo viên/user cũ/admin được phép, vai trò admin-console (`analyst`) không tự động có quyền |

## Kiểm thử thủ công trên server thật + trình duyệt (không chỉ mongomock)

Đăng nhập bằng tài khoản giáo viên tạo tạm (đã xoá sạch sau khi kiểm thử — xem mục dọn dẹp bên dưới), thao tác trực tiếp qua UI đã build:

1. Tạo 8 câu hỏi mẫu (chủ đề `algebra`, môn `math`, lớp 10, `remember`/`easy`, 1 điểm/câu) qua API thật, duyệt qua `draft → reviewing → approved`.
2. Trang **Ngân hàng câu hỏi**: hiển thị đúng 8 câu, đúng badge trạng thái/Bloom/độ khó/điểm.
3. Tạo ma trận "Kiểm tra 15 phút - Đại số" (4 điểm), thêm ràng buộc chủ đề `algebra`: 4 câu / 4 điểm — tổng real-time hiển thị đúng "4 câu hỏi đã cấu hình" / "4 / 4 điểm".
4. **Kiểm tra khả thi** → `OPTIMAL` (0.01s) — ma trận tự chuyển `validated`, các ô nhập bị khoá đúng như thiết kế.
5. **Sinh đề** với 2 mã → 2 exam tạo thành công (`Mã đề 101`, `Mã đề 102`), mỗi mã 4 câu/4 điểm.
6. **Xem trước** mã đề 101 → hiển thị đúng 4 câu, đáp án trắc nghiệm đã xáo trộn, ẩn đáp án đúng (theo `hide_answers=true` mặc định).
7. Tạo thêm 1 ma trận cố ý **INFEASIBLE** (yêu cầu 20 câu chủ đề `algebra` trong khi ngân hàng chỉ có 8) → **phát hiện và tự sửa 1 bug thật** (xem mục bên dưới) → sau khi sửa, hiển thị đúng: `Chủ đề · algebra: cần 20 câu, ngân hàng có 8 câu — thiếu 12 câu` và `Tổng thể: cần 20 điểm, ngân hàng có 8 điểm — thiếu 12 điểm`.

## Bug phát hiện và tự sửa trong phiên này (trước khi bàn giao)

**Bug:** `_diagnose_missing_groups()` trong `blueprint_solver_service.py` quy đổi `required_count`/`available_count`/`shortfall` của nhóm `"total"` qua `POINTS_SCALE` (×100) trước khi trả về, trong khi các nhóm khác (`topic`/`bloom_level`/`difficulty`/`question_type`) trả về số câu thô, không quy đổi. Hậu quả: UI hiển thị "Tổng thể: cần 2000, ngân hàng có 800" thay vì "cần 20 điểm, ngân hàng có 8 điểm" — số liệu đúng về mặt tỷ lệ nhưng đơn vị sai 100 lần, đủ để gây hiểu nhầm nghiêm trọng cho giáo viên đọc kết quả INFEASIBLE. Bug này không bị 7 test hiện có bắt vì test chỉ so `shortfall > 0`, không so giá trị tuyệt đối.

**Đã sửa:** đổi `MissingGroup.required_count/available_count/shortfall` (dataclass + Pydantic schema `MissingQuestionGroup`) từ `int` sang `float`; bỏ quy đổi `POINTS_SCALE` khi tính nhóm `"total"`, dùng thẳng điểm thật (`round(..., 2)`). Cập nhật UI hiển thị đúng đơn vị theo loại nhóm (`điểm` cho `total`, `câu` cho các nhóm còn lại). Đã chạy lại `test_blueprint_solver.py` + `test_exam_bank_blueprint.py` + `test_exam_bank_exam.py` (29 test) và toàn bộ 342 test — không hồi quy. Đã xác minh lại trực tiếp trên trình duyệt sau khi sửa (mục 7 ở trên).

## Dọn dữ liệu QA sau kiểm thử

Đã xoá sạch dữ liệu tạo ra để kiểm thử UI thật (đúng nguyên tắc không để lại dữ liệu test khi bàn giao): 8 câu hỏi mẫu, 2 ma trận đề, 2 exam đã sinh, và tài khoản giáo viên QA tạm thời (`qa.exambank@ezedu-qa.example.com`) — xoá trực tiếp trên MongoDB Atlas theo `owner_id`, xác nhận số lượng xoá khớp số lượng tạo ra.

## RBAC / Security

- Toàn bộ endpoint yêu cầu `require_exam_bank_actor` — học sinh nhận 403, đã kiểm thử qua `test_exam_bank_role_guard.py`.
- Ownership: mọi thao tác đọc/sửa 1 bản ghi cụ thể đều lọc theo `owner_id` (trừ khi `is_admin_actor()` true) — đã kiểm thử ở `test_exam_bank_question.py`/`test_exam_bank_blueprint.py`.
- `POST /exams/generate` bắt buộc `Idempotency-Key` (tái sử dụng `run_idempotent` từ Giai đoạn 2) — tránh sinh trùng đề khi client bấm submit nhiều lần hoặc retry mạng.
- Optimistic concurrency (`compare_and_set` từ Giai đoạn 2) áp dụng cho `PATCH` câu hỏi/ma trận và các thao tác đổi trạng thái — trả 409 khi version lệch, đã kiểm thử.

## Giả định / hạng mục chưa xử lý, cần lưu ý ở giai đoạn sau

- **Phân tích INFEASIBLE là heuristic, không phải IIS đầy đủ** — chỉ kiểm tra từng nhóm ràng buộc riêng lẻ, bỏ qua tương tác giữa các ràng buộc (ví dụ: đủ câu cho từng nhóm riêng nhưng vẫn INFEASIBLE do 2 ràng buộc đè lên cùng 1 tập câu hỏi hẹp). Đủ đáp ứng yêu cầu "nêu cần bổ sung bao nhiêu câu ở nhóm nào" cho trường hợp phổ biến nhất, đã ghi rõ giới hạn này trong docstring và tài liệu này để tránh hiểu nhầm là phân tích đầy đủ.
- **Import câu hỏi hàng loạt** (`POST /question-bank/questions/import`) mới hỗ trợ nhận mảng câu hỏi qua JSON body — chưa có UI kéo-thả file trong trang Ngân hàng câu hỏi (giáo viên hiện tạo câu qua API hoặc — ở giai đoạn sau — qua luồng "đưa câu từ bộ đề đã sinh vào ngân hàng" chưa xây).
- **"Đưa câu hỏi từ bộ đề đã sinh (`question_sets`) vào ngân hàng"** — nhắc tới trong mô tả nghiệp vụ (`QuestionBankPage.tsx` empty-state) nhưng chưa có API/nút bấm thật để chuyển 1 câu từ `question_sets.questions[]` sang collection `questions` mới; để lại cho giai đoạn tích hợp cuối ([70-74](.)) vì cần quyết định thêm về việc giữ liên kết ngược (câu trong ngân hàng biết nó bắt nguồn từ bộ đề nào).
- **Export đề ra file** (PDF/Word) chưa làm — mô tả nghiệp vụ ghi "nếu project đã hỗ trợ", và hiện `question_sets` cũng chưa có export thật để tái sử dụng, nên không thêm mới ở giai đoạn này.
- Toàn bộ luồng đã kiểm thử với ngân hàng câu hỏi cỡ nhỏ (8–2000 câu ứng viên trong test hiệu năng) — chưa có dữ liệu thật cỡ hàng chục nghìn câu để xác nhận thời gian giải CP-SAT trong môi trường production.
