# EzEdu AI — Trang đã sửa trong phiên MagicSchool-inspired này

- **Ngày:** 2026-07-29
- Chỉ liệt kê thay đổi **trong phiên này**. Phần lớn app đã được thiết kế lại ở phiên trước (xem `00-progress-log.md`) và không bị động tới lần này trừ khi ghi rõ dưới đây.

## Đã sửa hoàn chỉnh

| Trang/Thành phần | File | Thay đổi |
|---|---|---|
| Sidebar giáo viên | `components/AppLayout.tsx` | Thêm "Công cụ AI" (`/tools`), thêm lại "Hỏi đáp AI" (route đã cho phép nhưng thiếu link — lỗi thật), bỏ "Khám phá kiến thức"/"Kho tri thức chuẩn" khỏi top-level |
| Sidebar học sinh | `components/AppLayout.tsx` | Thêm "Công cụ AI", đổi nhãn "Cá nhân hóa" → "Lộ trình học", bỏ hai mục công cụ khỏi top-level (lý do như trên) |
| Dashboard giáo viên | `pages/teacher/TeacherDashboardPage.tsx` | Câu chào đổi đúng mẫu ("Xin chào, [tên]" / "Hôm nay bạn muốn chuẩn bị nội dung gì?"), thêm `SearchCommand`, thêm hàng 5 quick action (Tải học liệu, Sinh câu hỏi, Tạo đề, Ngân hàng câu hỏi, Hỏi đáp AI), bỏ khối CTA đơn trùng lặp với StatGrid bên dưới |
| Dashboard học sinh | `pages/student/StudentDashboardPage.tsx` | Câu chào đổi đúng mẫu ("Chào [tên]" / "Hôm nay bạn muốn học gì?"), thêm `SearchCommand`, thêm 4 quick action (Tiếp tục học, Luyện tập, Hỏi AI, Xem kết quả). Khối "Tiếp tục học" hiện có (tên bài + số câu) **giữ nguyên** vì chứa thông tin không trùng với quick action |
| Thư viện công cụ AI | `pages/ToolLibraryPage.tsx` (mới), `data/toolRegistry.ts` (mới) | Trang mới: lưới `ToolCard`, lọc theo nhóm (`ChipGroup`), tìm kiếm, "Gần đây" dựa trên `localStorage` thật. 9 công cụ cho giáo viên, 6 cho học sinh — đúng số công cụ có backend thật, không thêm công cụ giả |
| Trang chủ — Hero | `components/public/LandingSections.tsx`, `utils/websiteContentDefaults.ts`, `backend/.../website_content_defaults.py` + bản ghi CMS đã publish | Tiêu đề, mô tả, hai CTA đổi đúng nguyên văn theo mẫu Giai đoạn 5. CTA phụ trỏ tới khu vực tải học liệu thật (`#cong-cu`) thay vì "cách hoạt động" |

## Rà soát vòng 2 — 5 trang còn lại (2026-07-29, cùng ngày)

Đã đọc toàn bộ mã nguồn 5 trang, đối chiếu với 18 nguyên tắc (đặc biệt #6/7/8/9/10/11/18) và nguyên tắc "không lộ thuật ngữ kỹ thuật". Ba lỗi thật được tìm thấy và đã sửa:

| Trang | Lỗi | Sửa |
|---|---|---|
| `WebKnowledgePage.tsx` | Mô tả đầu trang lộ tên mô hình AI ("Tra cứu qua **Gemini** có tìm kiếm Google") — không nhất quán với mô tả cùng công cụ ở Thư viện công cụ, vốn đã viết đúng | Đổi thành "Tra cứu qua AI có tìm kiếm, ưu tiên nguồn chính thống…" — khớp `toolRegistry.ts` |
| `pages/student/ExamAttemptPage.tsx` | Nút "Nộp bài" (hành động không thể hoàn tác — nộp xong không sửa lại được) không có bước xác nhận, có thể bấm nhầm | Thêm `Dialog` xác nhận trước khi nộp (tái dùng `Dialog`/`DialogFooter` có sẵn, đúng mẫu đã dùng ở `ExamBlueprintListPage`). Tự nộp khi hết giờ **không** qua xác nhận — đúng vì đó không phải lựa chọn của học sinh |
| `pages/teacher/ExamBlueprintDetailPage.tsx` | Nút "Publish" (đề thi hiển thị cho học sinh, không sửa lại được sau đó) không có bước xác nhận | Thêm `Dialog` xác nhận, hiện rõ mã đề trước khi publish |

Đã kiểm tra: `tsc -b`, `eslint` sạch; xác nhận trực tiếp qua trình duyệt bản sửa của `WebKnowledgePage`. Hai dialog xác nhận đã qua type-check + tái dùng component đã kiểm chứng, **chưa** click-through hết vì cần dựng đủ ngân hàng câu hỏi + ma trận khả thi mới có nút Publish/Nộp bài xuất hiện — chi phí dựng dữ liệu vượt phạm vi một lượt rà soát.

**Một phát hiện chưa sửa** (cần thay đổi lớn hơn, không sửa trong lượt này):

| Trang | Vấn đề | Vì sao chưa sửa |
|---|---|---|
| `ExamGradingPage.tsx` | Hiển thị "Học sinh {attempt.student_id}" — lộ ObjectId thô thay vì tên học sinh | `Attempt` (backend) không kèm tên. Có thể suy ra tên qua `target_class_ids` của đề (`GET /exams/{id}`) rồi tra cứu từng lớp (`classesApi.detail`) — nhưng `publishExam` ở client hiện luôn gửi `target_class_ids: []` (audience toàn bộ), nên trong thực tế trường này rỗng, tra cứu qua lớp sẽ không tìm được. Sửa đúng cần hoặc (a) đổi luồng publish để chọn lớp cụ thể, hoặc (b) thêm cách tra cứu khác — cả hai vượt phạm vi "chỉ sửa giao diện". Ghi vào roadmap |

Không phát hiện thêm vi phạm nguyên tắc 9/10 (không có nút giả, không có dữ liệu giả) ở 5 trang này — mọi nút đều gọi API thật đã xác nhận trong `03-route-mapping.md`.

## Rà soát vòng 3 — 13 trang admin (2026-07-29, cùng ngày)

Đọc toàn bộ 13 trang admin (4933 dòng) theo 6 nhóm song song, đối chiếu 18 nguyên tắc + đối chiếu API thật (`frontend/src/api/*`). Không phát hiện nút giả hay dữ liệu bịa ở bất kỳ trang nào — mọi action đều gọi API thật đang tồn tại ở backend. Phát hiện chính, theo mức độ:

**Đã sửa (7 lỗi/thiếu sót cụ thể, rủi ro thấp):**

| Trang | Vấn đề | Sửa |
|---|---|---|
| `AdminReportsPage.tsx` | Dòng "Cập nhật manifest {giờ hiện tại}" lấy từ `new Date()` lúc render, không phải thời điểm thật danh sách báo cáo được tạo — thông tin sai hiển thị cho admin mỗi lần load trang | Đọc và hiện `generated_at` thật từ response `GET /admin/reports/types` |
| `AdminReportsPage.tsx` | Dropdown "Định dạng" luôn hiện CSV/XLSX/PDF bất kể loại báo cáo đã chọn có hỗ trợ hay không (`item.formats` được fetch nhưng không dùng) | Lấy option từ `current.formats`, tự chuyển định dạng đang chọn nếu không còn hợp lệ |
| `AdminReportsPage.tsx` | Raw enum `item.key` (vd `ai_quality`) hiện ngay cạnh tên báo cáo trong lưới "Loại báo cáo hiện có" | Bỏ khỏi nội dung hiển thị, giữ lại dạng `title` (tooltip) để debug |
| `AdminWebsiteContentPage.tsx` | **Trường ẩn không hoạt động**: form có ô "Tiêu đề"/"Dòng nổi bật" cho hero, admin sửa và thấy đúng trong preview riêng của trang này, nhưng H1 thật trên trang chủ đã hardcode từ Giai đoạn 5 nên **không đọc hai trường này nữa** — sửa xong không có tác dụng gì trên trang chủ thật, có thể khiến admin tưởng đã cập nhật | Bỏ hai ô khỏi form, thêm ghi chú giải thích H1 cố định trong mã nguồn, sửa preview hiện đúng H1 thật thay vì hai trường chết |
| `AdminSettingsPage.tsx` | Copy loading "Đang đọc system_settings từ backend." lộ tên collection Mongo | Đổi thành "Đang tải cấu hình hệ thống…" |
| `AdminFeatureFlagsPage.tsx` | Copy loading lộ tên collection `feature_flags`; mô tả đầu trang ngụ ý đây là nơi kiểm soát "các luồng quan trọng" trong khi còn một hệ thống flag tĩnh khác (`config.py` `ENABLE_*`) không xuất hiện ở đây; không có empty-state khi danh sách rỗng | Sửa copy loading; làm rõ phạm vi ("một số tính năng... không phải toàn bộ cấu hình"); thêm `EmptyState` khi rỗng |
| `AdminNotificationsPage.tsx` | Một nhánh lỗi đọc thẳng `err.response?.data?.detail` thay vì helper `apiErrorMessage` dùng nhất quán ở các nhánh khác trong cùng file — rủi ro lộ chuỗi lỗi kỹ thuật thô | Đổi sang `apiErrorMessage(err, ...)` |
| `AdminActivityLogsPage.tsx`, `AdminAuditLogsPage.tsx` | Nhãn "Request ID"/"IP hash"/"User agent" để tiếng Anh giữa UI tiếng Việt; cảnh báo "Cần kiểm tra backend sanitizer" lộ thuật ngữ nội bộ | Dịch nhãn sang tiếng Việt thường; đổi cảnh báo thành hướng dẫn hành động rõ ràng |

Đã kiểm tra: `tsc -b`, `eslint`, `npm run build` sạch. Xác nhận trực tiếp qua trình duyệt (tài khoản admin tạm, đã xoá sau khi test): `AdminReportsPage` hiện đúng giờ thật + không còn raw key; `AdminWebsiteContentPage` — tab Hero không còn hai ô chết, ghi chú hiện đúng, preview khớp trang chủ thật; `AdminFeatureFlagsPage` — copy mới hiện đúng, không lỗi console. Không test lại `AdminSettingsPage`/`AdminActivityLogsPage`/`AdminAuditLogsPage`/`AdminNotificationsPage` qua trình duyệt (chỉ đổi 1 dòng copy/1 dòng error-handling mỗi nơi, rủi ro thấp, đã qua type-check).

**Đã ghi nhận, chưa sửa (vượt phạm vi một lượt rà soát UI):**

| Phạm vi | Vấn đề |
|---|---|
| Toàn bộ 13 trang | Không trang nào import từ `components/ui/` — mỗi trang tự dựng `Card`/`Badge`/`EmptyState`/`Dialog`/`Button`/bảng bằng CSS riêng (`admin-content-*`, `admin-settings-*`...), và `AdminContentShared.tsx` còn định nghĩa `EmptyState`/`Badge` riêng che khuất bản thật trong design system. Đây là vi phạm rõ nhất nguyên tắc "tái sử dụng component" nhưng là một cuộc tái cấu trúc lớn (13 file, ~5000 dòng), không phải một lượt sửa nhỏ — cần một phiên riêng nếu muốn làm |
| `AdminUsersPage.tsx`, `AdminSettingsPage.tsx`, `AdminFeatureFlagsPage.tsx` | Xác nhận hành động nguy hiểm dùng `ConfirmModal`/`window.confirm` tự dựng thay vì `Dialog` dùng chung (mất focus-trap/khoá cuộn nền có sẵn) |
| `AdminAIPage.tsx` | Nút "Reset quota" và "Lưu" quota mặc định theo role bắn ngay không qua xác nhận, dù có tác động toàn hệ thống ngay lập tức |
| `AdminQuestionsPage.tsx` | Nút "Sinh lại" (AI regenerate) không qua xác nhận trong khi nút Xoá cùng trang có |
| `ExamGradingPage.tsx`, `AdminUsersPage.tsx`, `AdminActivityLogsPage.tsx`, `AdminAuditLogsPage.tsx`, `AdminDocumentsPage.tsx`, `AdminQuestionsPage.tsx` | Raw Mongo ObjectId / raw enum hiện trực tiếp cho admin ở nhiều nơi (student_id, user_id, resource_id, target_id, processing_status...) thay vì tên/nhãn đã dịch — sửa đúng cần thêm tra cứu tên (backend hoặc client-side join), không chỉ đổi copy |
| `AdminUserDetailPage.tsx` | 4/6 tab chi tiết (documents/questions/ai/sessions) luôn hiện là tab bấm được nhưng chỉ hiện "chưa có API backend" — trung thực (không phải nút giả) nhưng nên ẩn/disable thay vì để tab active |
| Nhiều cặp file (`AdminUsersPage`/`AdminUserDetailPage`, `AdminActivityLogsPage`/`AdminAuditLogsPage`/`AdminReportsPage`) | `ROLE_LABELS`, `fmtNumber`, `fmtDateTime`, `StatCard` bị copy-paste giữa các file thay vì dùng chung một helper — nợ kỹ thuật, không phải lỗi hiển thị |

Chi tiết đầy đủ, theo từng file:line, đã dùng để chọn ra danh sách trên — không lặp lại toàn bộ ở đây để tránh trùng lặp.

## Đã có sẵn từ phiên trước, xác nhận vẫn đúng (không cần sửa)

Public homepage (9 section còn lại + footer), trang đăng nhập/đăng ký, luồng tải học liệu → sinh câu hỏi → ban hành, ngân hàng câu hỏi, ma trận đề, lớp học, hỏi đáp AI nâng cao — đã qua kiểm tra ở phiên trước (`07-final-qa-report.md`) và **không bị động chạm** trong phiên này ngoài việc đường dẫn tới hai trang (web-knowledge, curriculum-kb) đổi từ sidebar sang Thư viện công cụ.

## Trạng thái rà soát cuối cùng

Tất cả các trang trong phạm vi 12 giai đoạn của phiên này (bao gồm 5 trang vòng 2 và 13 trang admin vòng 3) **đã được rà soát**. Không còn trang nào "chưa rà soát" trong danh sách ban đầu — xem [07-final-handoff.md](07-final-handoff.md) để biết danh sách việc còn lại (không phải "chưa rà soát", mà là "đã rà soát, cố ý chưa sửa vì vượt phạm vi").

## Chưa đụng tới (ngoài phạm vi 12 giai đoạn của phiên này)

Không có trang nào bị xoá hoặc mất chức năng. Không có route nào đổi contract.
