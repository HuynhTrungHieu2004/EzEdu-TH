# Lát 4 — Luồng làm bài và kết quả (2026-08-14)

Bước 4 trong lộ trình `docs/superpowers/specs/2026-08-14-professional-motion-redesign-design.md` §10,
tiếp sau lát 3 (`2026-08-14-slice3-student-verification.md`). Phạm vi: `ExamAttemptPage` (đề có giới hạn
thời gian) và khối kết quả của `PracticeAttemptPage` (bài luyện tập).

## Đã làm

- **Làm bài theo từng câu.** Trước đây cả đề nằm trên một trang cuộn dài. Nay mỗi lần một câu, có nút
  "Câu trước"/"Câu sau" và dải chọn câu nhảy trực tiếp. Câu mới trượt vào theo hướng điều hướng
  (`gsap.fromTo` x ±28px, 0.32s); reduced motion đổi câu tức thì, không transform.
- **Dải chọn câu có trạng thái đọc được.** Câu đã trả lời phân biệt bằng viền + nền (không chỉ màu chữ),
  câu đang mở dùng nền navy + gạch vàng dưới, `aria-current` và nhãn screen reader
  "Câu N — đã/chưa trả lời". Chip đang mở thắng style "đã trả lời" (rule cùng độ ưu tiên, đặt sau).
- **Vòng đếm ngược `TimerRing`.** Thay `Badge` chữ số bằng vòng SVG chạy theo tỉ lệ thời gian còn lại,
  đổi sang màu lỗi khi còn dưới 60s. Vòng chạy bằng `stroke-dashoffset` nên không có animation JS —
  reduced motion không cần xử lý riêng. `role="timer"` + `aria-live="off"` để không đọc lại mỗi giây.
- **Thanh hành động dính dưới cùng.** Tiến độ "đã trả lời" + điều hướng + nút nộp bài luôn trong tầm tay,
  không phải cuộn hết đề mới thấy nút nộp.
- **Kết quả reveal tuần tự.** Khối tổng kết có phần trăm đếm lên (`AnimatedCounter`), điểm, số câu đúng,
  trạng thái chấm; từng dòng kết quả vào theo stagger (`StaggerGroup`).
- **Confetti tiết chế.** `motion/Confetti.tsx`: 18 mảnh (thiết bị cảm ứng 9), rơi ~1,4s rồi tự xoá node.
  Chỉ chạy khi bài **đã chấm xong** và đạt từ 80% — không nổ khi còn đang chấm tự luận. Không chạy ở
  reduced motion. Bài luyện tập dùng lại đúng component này.

## Sửa lỗi tương phản của foundation (do lát này phát hiện)

Axe trên trang làm bài/kết quả lộ hai lỗi AA có sẵn trong hệ token, đã sửa tại gốc nên mọi trang cùng hưởng:

| Token | Trước | Sau | Lý do |
| --- | --- | --- | --- |
| `--ez-text-muted` | `#617b82` | `#5a747b` | 4.17:1 trên `--ez-bg` (eyebrow của mọi `PageHeader`) → 4.61:1 |
| `--ez-success-text` | `--ez-green-700` `#10843b` | `--ez-green-800` `#0d7434` | 4.38:1 trên nền badge success → 5.39:1 |

Ghi chú cũ trong `tokens.css` chỉ bảo đảm 4.5:1 trên `--ez-surface` (trắng); chữ đặt trực tiếp trên nền
trang `--ez-bg` thì chưa đạt. Ghi chú đã được sửa lại cho đúng.

## Kiểm chứng

| Lệnh | Kết quả |
| --- | --- |
| `npm run lint` | PASS |
| `npm run build` | PASS (vẫn cảnh báo chunk > 500 kB) |
| `npm run test:foundation` | PASS — 294/294 trên 6 project viewport (đã thêm `e2e/exam-attempt.spec.ts`) |
| `npx playwright test e2e/authenticated-responsive.spec.ts` | PASS — 300/300 |
| `npm run test:chat` | PASS — 11/11 |

`e2e/exam-attempt.spec.ts` khoá các hợp đồng: một câu mỗi lần và đi tiến/lùi; dải chọn câu + tiến độ theo
số câu đã trả lời; vòng đếm ngược có `stroke-dasharray`/`stroke-dashoffset` hợp lệ; kết quả hiện 100%,
điểm, độ tin cậy AI, ba dòng kết quả không giữ transform, confetti chạy ở full motion; reduced motion
không có mảnh confetti nào và điểm hiện ngay; axe A/AA sạch cả trang làm bài và trang kết quả.

## Nợ còn lại

- `PracticeAttemptPage` vẫn là danh sách câu cuộn dài (không phân trang): bài luyện tập có phần giải thích
  và không giới hạn thời gian nên giữ nguyên cách đọc; chỉ khối kết quả được làm mới. Nếu muốn thống nhất
  hoàn toàn với đề thi thì cần một lát riêng.
- Chưa có phản hồi đúng/sai ngay trong lúc làm đề thi — đúng theo nghiệp vụ hiện tại (đề chấm sau khi nộp),
  không phải thiếu sót UI.
- Nợ từ lát trước còn nguyên: `e2e/public-responsive.spec.ts` fail vì origin Google client ID
  (`http://127.0.0.1:4173`), mật độ `KnowledgeScopeSelector` trên mobile, `ProcessTimeline` của spec §7.4,
  và `PathnameNavigationEpoch`.

## Hoãn sang lát sau

- Lát 5/6: trang giáo viên và quản trị.
- Lát 7: landing, login/register, onboarding.
- Lát 8: xoá CSS legacy trong `src/index.css`.
