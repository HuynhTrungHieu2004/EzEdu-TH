# EzEdu AI — Báo cáo kiểm thử (đợt MagicSchool-inspired)

- **Ngày:** 2026-07-29

## 1. Kiểm tra tự động

| Lệnh | Kết quả |
|---|---|
| `npx tsc -b` (frontend) | ✅ Sạch, không lỗi |
| `npx eslint src` (frontend) | ✅ Sạch, không lỗi |
| `npm run build` (frontend) | ✅ Build thành công. Cảnh báo có sẵn từ trước: 1 chunk (`index-*.js`, 565KB) vượt 500KB — không phải hồi quy mới, không nằm trong phạm vi phiên này |
| Bộ test backend (405 test, từ Giai đoạn 8) | Không chạy lại trong phiên này vì không sửa business logic backend (chỉ sửa nội dung CMS mặc định — xem §3) |

## 2. Playwright

**Không thể chạy** — repo không có `playwright.config.*`, không có `frontend/tests/`/`e2e/`, không có `@playwright/test` trong `package.json`. Xác nhận bằng khảo sát trực tiếp, không phải giả định. Thay thế bằng kiểm tra thủ công qua trình duyệt thật, ghi lại dưới đây.

## 3. Kiểm tra thủ công qua trình duyệt (Browser pane, `localhost:5173` + `localhost:8000`)

Ba tài khoản QA được tạo mới cho phiên này (`qa.teacher.redesign2026@…`, `qa.student.redesign2026b@…`, và một tài khoản admin tạm để kiểm tra hồi quy) — **cả ba đã bị xoá khỏi database sau khi kiểm tra xong**, không để lại dữ liệu QA (đúng nguyên tắc dọn dẹp).

| Kiểm tra | Kết quả |
|---|---|
| Đăng ký + đăng nhập giáo viên | ✅ |
| Dashboard giáo viên: câu chào, `SearchCommand`, 5 quick action | ✅ Đúng nguyên văn mẫu |
| Sidebar giáo viên: "Công cụ AI", "Hỏi đáp AI" hiện diện | ✅ |
| `/tools` (giáo viên): 9 công cụ đúng nhóm, lọc theo `ChipGroup` hoạt động | ✅ |
| Đăng ký + đăng nhập học sinh | ✅ (đăng nhập lần đầu vào đúng `/student-onboarding`, hành vi có sẵn, không phải lỗi) |
| Dashboard học sinh: câu chào, `SearchCommand`, 4 quick action | ✅ Đúng nguyên văn mẫu |
| `/tools` (học sinh): 6 công cụ đúng nhóm | ✅ |
| Trang chủ: hero đúng tiêu đề/mô tả/CTA mẫu Giai đoạn 5 | ✅ |
| Responsive di động (375×812) — dashboard học sinh | ✅ Không tràn ngang, quick action tự xuống dòng, bottom nav hiện đúng |
| Console lỗi (mọi trang kiểm tra) | Không có |
| Hồi quy `AppLayout.tsx` cho admin (dùng chung layout) | ✅ Đăng nhập admin, `/admin/dashboard` render đúng, không lỗi console |
| Network — `POST /auth/register`, `/auth/login` | 201 / 200 đúng như kỳ vọng |

## 4. Chưa kiểm tra trong phiên này

- Các viewport 1440×900, 1280×800, 1024×768, 768×1024, 360×800 (chỉ kiểm tra 1280×720 và 375×812).
- Điều hướng theo bàn phím / focus-visible / kiểm tra ARIA cho các thành phần mới (`SearchCommand`, `ToolCard`) — chưa audit riêng lần này.
- `ExamAttemptPage`, `ExamGradingPage`, `WebKnowledgePage`, `CurriculumKbPage`, toàn bộ trang admin — chưa test thủ công lại (không đổi code nên rủi ro hồi quy thấp, nhưng chưa xác nhận bằng mắt trong phiên này).
- Refresh trực tiếp (F5) trên từng route mới — chưa kiểm tra riêng cho `/tools`.

## 5. Dữ liệu QA

Không có dữ liệu QA nào bị bỏ lại. Không có ảnh chụp màn hình hoặc file tạm nào được thêm vào git.
