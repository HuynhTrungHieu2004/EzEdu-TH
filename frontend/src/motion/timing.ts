/**
 * Thang thời lượng và easing dùng chung cho lớp motion.
 *
 * `tokens.css` là nguồn thật cho CSS (`--ez-motion-fast|base|slow`,
 * `--ez-ease-standard|emphasized`). GSAP không đọc được biến CSS nên các con số
 * ở đây phải khớp đúng thang đó — trước lát 9 mỗi component tự chọn một con số
 * riêng (0.28 / 0.32 / 0.34 / 0.42 / 0.58 / 0.62) nên cùng một loại chuyển động
 * lại chạy khác nhau giữa các trang.
 *
 * Quy ước:
 *   fast   0.16s — phản hồi trực tiếp thao tác (indicator, hover)
 *   base   0.28s — đổi trạng thái trong cùng một khung (chuyển câu, mở thẻ)
 *   slow   0.52s — nội dung mới vào màn hình (entrance, reveal, stagger)
 */
export const MOTION_DURATION = {
  fast: 0.16,
  base: 0.28,
  slow: 0.52,
} as const;

/** Khớp `--ez-ease-standard` / `--ez-ease-emphasized`. */
export const MOTION_EASE = {
  standard: 'power2.out',
  emphasized: 'power3.out',
} as const;

/** Độ trễ giữa các phần tử trong một nhóm stagger. */
export const MOTION_STAGGER = 0.07;
