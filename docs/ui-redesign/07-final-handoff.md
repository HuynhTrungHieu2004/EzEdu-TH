# EzEdu AI — Bàn giao cuối (đợt MagicSchool-inspired)

- **Ngày:** 2026-07-29
- **Không tuyên bố đã thiết kế lại toàn bộ.** Phần lớn công sức thiết kế lại (design system, layout theo vai trò, dashboard thật, homepage) đã hoàn thành ở phiên trước; phiên này lấp khoảng trống cụ thể còn thiếu so với 18 nguyên tắc và 12 giai đoạn được yêu cầu. Tất cả các trang trong phạm vi đã được **rà soát** (không còn trang "chưa xem"), nhưng rà soát ≠ sửa hết — nhiều phát hiện được ghi nhận có chủ đích chưa sửa vì vượt phạm vi một lượt UI review (xem mục 3 và mục 8).

## 1. Trang đã hoàn thành trong phiên này

- Sidebar giáo viên và học sinh (cấu trúc, nhãn, sửa lỗi thiếu link Hỏi đáp AI cho giáo viên)
- Dashboard giáo viên (câu chào, tìm kiếm, quick action)
- Dashboard học sinh (câu chào, tìm kiếm, quick action)
- Thư viện công cụ AI (`/tools`) — trang mới hoàn chỉnh, cho cả hai vai trò
- Trang chủ — phần Hero (tiêu đề, mô tả, CTA)
- Rà soát vòng 2 (cùng ngày): `ExamAttemptPage`, `ExamGradingPage`, `ExamBlueprintDetailPage`, `WebKnowledgePage`, `CurriculumKbPage` — 3 lỗi thật tìm thấy và đã sửa (lộ tên "Gemini" trong copy, thiếu xác nhận trước khi Nộp bài/Publish đề — cả hai là hành động không thể hoàn tác). Chi tiết ở [05-pages-redesigned.md](05-pages-redesigned.md) §"Rà soát vòng 2"
- Rà soát vòng 3 (cùng ngày): toàn bộ 13 trang admin — 7 lỗi/thiếu sót thật tìm thấy và đã sửa (timestamp bịa ở AdminReports, dropdown định dạng không lọc theo loại báo cáo, raw key hiện cho admin, **trường CMS chết** `hero.title`/`hero.highlight` ở AdminWebsiteContentPage, hai chỗ lộ tên collection Mongo trong copy loading, một chỗ bỏ qua helper lỗi chung, nhãn tiếng Anh lẫn trong UI tiếng Việt ở log/audit). Chi tiết đầy đủ + danh sách phát hiện chưa sửa (lớn hơn, ngoài phạm vi) ở [05-pages-redesigned.md](05-pages-redesigned.md) §"Rà soát vòng 3"

## 2. Trang chưa rà soát riêng theo tiêu chí lần này

Không còn — 9 section còn lại của trang chủ ngoài Hero là điểm duy nhất chưa xem lại riêng (đã dùng design system từ phiên trước, không đổi trong phiên này nên rủi ro thấp).

## 3. Chưa làm / còn thiếu

- Kiểm tra Playwright cho từng route — **không thể**, công cụ không có trong repo (xem [06-test-report.md](06-test-report.md) §2). Thay bằng kiểm tra thủ công qua trình duyệt thật.
- Kiểm tra ở 6 viewport được yêu cầu — mới kiểm tra 2/6 (1280×720, 375×812).
- Audit accessibility (bàn phím, ARIA, focus-visible) cho `SearchCommand`/`ToolCard` mới.
- Đổi màu chủ đạo theo mã đề xuất trong đặc tả — **cố ý không làm**, xem lý do ở [04-design-system.md](04-design-system.md) §1.
- Đối chiếu tên 7 nhóm nav admin với tên gợi ý trong đặc tả ("Học liệu hệ thống", "AI và API", "Nhật ký hệ thống" tách riêng).
- 13 trang admin không dùng `components/ui/` — mỗi trang tự dựng Card/Badge/EmptyState/Dialog/Button/bảng riêng. Đây là phát hiện lớn nhất của rà soát vòng 3, **cố ý không sửa** vì là một tái cấu trúc ~5000 dòng, không phải một lượt review nhỏ.
- Một số hành động nguy hiểm ở trang admin (reset quota AI, sửa quota mặc định theo role, sinh lại câu hỏi bằng AI) bắn ngay không qua xác nhận, hoặc dùng `window.confirm` thay vì `Dialog` dùng chung.
- Raw ObjectId/enum hiện trực tiếp cho admin ở nhiều nơi (student_id ở ExamGradingPage, user_id/resource_id/target_id ở log & audit, id ở AdminUsersPage) — sửa đúng cần thêm tra cứu tên, không chỉ đổi copy.

## 4. Component mới

`ToolCard` (`components/ui/ToolCard.tsx`), `SearchCommand` (`components/ui/SearchCommand.tsx`) — cả hai dựng từ primitive có sẵn (`Card`, `Badge`, `Input`), không thêm dependency.

## 5. Dependency mới

**Không có.** Toàn bộ thay đổi dùng thư viện đã có trong `package.json`.

## 6. File đã đổi trong phiên này

```
frontend/src/data/toolRegistry.ts                       (mới)
frontend/src/components/ui/ToolCard.tsx                 (mới)
frontend/src/components/ui/SearchCommand.tsx             (mới)
frontend/src/pages/ToolLibraryPage.tsx                   (mới)
frontend/src/components/ui/index.ts                     (sửa — export mới)
frontend/src/App.tsx                                     (sửa — route /tools)
frontend/src/components/AppLayout.tsx                    (sửa — sidebar giáo viên/học sinh)
frontend/src/pages/teacher/TeacherDashboardPage.tsx       (sửa)
frontend/src/pages/student/StudentDashboardPage.tsx       (sửa)
frontend/src/pages/dashboard.css                          (sửa — style quick action)
frontend/src/utils/websiteContentDefaults.ts              (sửa — copy hero)
frontend/src/components/public/LandingSections.tsx        (sửa — H1 + CTA phụ)
backend/app/services/website_content_defaults.py          (sửa — copy hero, đồng bộ frontend)
.claude/launch.json                                       (mới — cấu hình chạy dev server, không phải mã nguồn ứng dụng)
docs/ui-redesign/01-interface-audit.md                    (mới)
docs/ui-redesign/02-information-architecture.md           (viết lại — thay thế bản kế hoạch /hs /gv chưa triển khai)
docs/ui-redesign/03-route-mapping.md                      (mới)
docs/ui-redesign/04-design-system.md                      (mới)
docs/ui-redesign/05-pages-redesigned.md                    (mới)
docs/ui-redesign/06-test-report.md                        (mới)
docs/ui-redesign/07-final-handoff.md                       (mới, file này)

── Rà soát vòng 2 (cùng ngày) ──
frontend/src/pages/WebKnowledgePage.tsx                     (sửa — bỏ lộ tên "Gemini" khỏi copy)
frontend/src/pages/student/ExamAttemptPage.tsx              (sửa — thêm xác nhận trước khi Nộp bài)
frontend/src/pages/teacher/ExamBlueprintDetailPage.tsx      (sửa — thêm xác nhận trước khi Publish)
docs/ui-redesign/05-pages-redesigned.md                    (cập nhật — mục "Rà soát vòng 2")

── Rà soát vòng 3 (cùng ngày) ──
frontend/src/pages/AdminReportsPage.tsx                     (sửa — timestamp thật, format lọc theo loại, bỏ raw key)
frontend/src/pages/AdminWebsiteContentPage.tsx              (sửa — bỏ 2 trường hero chết, preview đúng H1 thật)
frontend/src/pages/AdminSettingsPage.tsx                    (sửa — copy loading không lộ tên collection)
frontend/src/pages/AdminFeatureFlagsPage.tsx                (sửa — copy loading + copy phạm vi + empty-state)
frontend/src/pages/AdminNotificationsPage.tsx               (sửa — dùng apiErrorMessage nhất quán)
frontend/src/pages/AdminActivityLogsPage.tsx                (sửa — nhãn tiếng Việt, copy cảnh báo)
frontend/src/pages/AdminAuditLogsPage.tsx                   (sửa — nhãn tiếng Việt)
docs/ui-redesign/05-pages-redesigned.md                    (cập nhật — mục "Rà soát vòng 3")
```

Ngoài ra: bản ghi CMS `website_content` (section `hero`) trong MongoDB được cập nhật trực tiếp để khớp với default mới (publish thủ công, tăng version, có version history) — vì bản ghi đã seed từ trước với nội dung cũ.

## 7. Test đã chạy

`tsc -b`, `eslint`, `npm run build` — sạch. Kiểm tra thủ công qua trình duyệt cho hai vai trò + hồi quy admin — không lỗi console. Chi tiết đầy đủ ở [06-test-report.md](06-test-report.md).

## 8. Lỗi còn tồn đọng (biết nhưng chưa sửa, ngoài phạm vi phiên này)

- ~~Trường CMS `hero.title`/`hero.highlight`~~ — **đã sửa** ở rà soát vòng 3 (bỏ khỏi form admin, preview sửa đúng).
- Không có trang cho học sinh khám phá danh sách đề thi công khai đang mở (`/take-exam/:examId` cần ID) — đã ghi từ Giai đoạn 4, chưa có backend endpoint tương ứng.
- 13 trang admin không dùng component `components/ui/` chung (Card/Badge/EmptyState/Dialog/Button/bảng) — mỗi trang tự dựng CSS riêng. Không phải lỗi hiển thị, là nợ kỹ thuật lớn nhất tìm thấy trong toàn phiên. Cần một phiên tái cấu trúc riêng, không phải một lượt sửa nhỏ.
- `ExamGradingPage.tsx` hiển thị "Học sinh {attempt.student_id}" — ObjectId thô, không phải tên. Không sửa được chỉ bằng giao diện: `publishExam` phía client luôn gửi `target_class_ids: []`, nên không có đường tra cứu tên đáng tin cậy qua lớp học. Cần quyết định ở tầng nghiệp vụ (chọn lớp cụ thể khi publish, hoặc thêm cách tra cứu khác) trước khi sửa UI.
- Một số hành động nguy hiểm ở trang admin (reset quota AI, sửa quota mặc định theo role, sinh lại câu hỏi bằng AI) thiếu bước xác nhận nhất quán với phần còn lại của app.
- Raw ObjectId/enum ở nhiều trang admin (user_id, resource_id, target_id, processing_status...) — cần tra cứu tên/nhãn, không chỉ đổi copy.

## 9. Đề xuất bước tiếp theo

1. Kiểm tra 4 viewport còn lại + accessibility cho `SearchCommand`/`ToolCard`.
2. Quyết định có cài Playwright hay không — đây là thay đổi hạ tầng, cần xác nhận riêng trước khi thêm dependency mới.
3. Quyết định hướng xử lý "Học sinh {student_id}" ở `ExamGradingPage` (mục 8).
4. Nếu muốn, lên kế hoạch riêng cho việc chuyển 13 trang admin sang dùng `components/ui/` chung — quy mô lớn, không làm trong một lượt review.
5. Thêm bước xác nhận (Dialog) cho các hành động nguy hiểm còn thiếu ở trang admin (mục 8).
