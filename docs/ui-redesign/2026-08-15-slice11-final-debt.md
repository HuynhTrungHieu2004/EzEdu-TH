# Lát 11 — Ba khoản nợ cuối (2026-08-15)

Tiếp sau `2026-08-15-slice10-clear-debt.md`, xử lý nốt ba khoản còn lại.

## A. Đo nhịp khung hình khi CPU bị hãm (spec §11)

`e2e/motion-performance.spec.ts` hãm CPU gấp 4 lần qua CDP (`Emulation.setCPUThrottlingRate`) rồi đếm khung
hình thật bằng `requestAnimationFrame`:

- page entrance + stagger của dashboard;
- reveal theo cuộn của trang chủ, đo **trong lúc đang cuộn** (ScrollTrigger scrub là chỗ dễ giật nhất);
- chuyển câu trong đề thi: đọc inline style ngay lúc tween chạy và khẳng định chỉ có
  `transform`/`opacity`/`visibility` — animate `width`/`top`/`left` sẽ buộc trình duyệt layout lại.

Ngưỡng: fps trung bình > 24 và khung dài nhất < 120ms. Đây là mức "không giật thấy được", không phải 60fps —
mục tiêu là bắt hồi quy, không khoá một con số máy CI. Số đo thực tế trên máy phát triển:

| CPU throttle | fps | khung dài nhất |
| ---: | ---: | ---: |
| ×1 | 55.4 | 33ms |
| ×4 | 60.2 | 17ms |
| ×10 | 57.7 | 67ms |

Bài đo chạy ở project Playwright riêng (`perf`, một worker) — chạy song song sáu viewport vừa chậm vừa làm
nhiễu số đo. Lệnh: `npm run test:perf`.

## B. Ảnh so sánh trước/sau (spec §11)

`docs/ui-redesign/screenshots/before-after/` — bảy cặp ảnh: dashboard học sinh, chat, kho học liệu, dashboard
giáo viên, tổng quan quản trị, đăng nhập, onboarding.

Bản "trước" chụp từ git worktree tại commit `d7d4de5` (ngay trước khi merge lát foundation), bản "sau" từ
`main`; cùng fixture Playwright, cùng viewport `desktop-1440`, cùng `stubApi` — khác biệt trong ảnh là khác
biệt giao diện, không phải khác biệt dữ liệu. Cách chụp lại ghi trong README của thư mục đó.

## C. Bỏ lớp alias biến hệ cũ

`tokens.css` §12 giữ 59 alias kiểu `--accent: var(--ez-primary)` để CSS cũ chạy được trong lúc di trú. Vì mỗi
alias là **đúng một** `var(--ez-*)`, thay thế là tương đương tuyệt đối về giá trị tính toán:

- **596 chỗ** trong **27 file** đổi từ `var(--accent)`, `var(--muted)`, `var(--danger-bg)`… sang token `--ez-*`;
- xoá **59 khai báo alias** trong `tokens.css` và **105 khai báo** trùng tên trong `index.css`;
- rà lại: 0 class chết, 0 biến chết, 0 biến bị dùng mà không khai báo.

| File | Trước lát 8 | Sau lát 10 | Sau lát 11 |
| --- | ---: | ---: | ---: |
| `src/index.css` | 2905 | 1859 | **1742** |
| `src/styles/tokens.css` | 617 | 617 | **561** |

### Ba biến hỏng có sẵn, phát hiện khi rà

| Chỗ dùng | Vấn đề | Sửa |
| --- | --- | --- |
| `FeedbackDialog` | `var(--shadow-deep)` chưa từng được khai báo ở đâu → hộp thoại không có bóng | `var(--ez-shadow-xl)` |
| `App.css` (2 chỗ) | `var(--social-bg)` chưa từng được khai báo → nền không áp dụng | `var(--ez-surface-muted)` |
| `AdminDashboardPage.css` | `var(--surface-muted, var(--ez-surface))` — fallback che mất việc alias đã mất | `var(--ez-surface-muted)` |

## Kiểm chứng

| Lệnh | Kết quả |
| --- | --- |
| `npx tsc -b --force` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS, không cảnh báo chunk |
| `npm run test:chat` | PASS — 11/11 |
| `npx playwright test` | PASS — **879/879** |
| `npm run test:perf` | PASS — 3/3 |

## Còn lại

`src/index.css` còn 1742 dòng nhưng **không còn dòng nào chết**: toàn bộ class và biến trong đó đều có
consumer thật (chat, admin, landing, các primitive dùng chung). Muốn nhỏ hơn nữa thì phải viết lại từng
component đang dùng chúng — việc đó thuộc phạm vi thiết kế lại từng trang, không phải dọn dẹp.
