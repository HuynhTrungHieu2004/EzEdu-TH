function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export interface ChalkUnderlineProps {
  className?: string;
}

/** Gạch chân tay vẽ kiểu phấn — đặt ngay dưới tiêu đề trang (H1). */
export function ChalkUnderline({ className }: ChalkUnderlineProps) {
  return (
    <svg
      className={cx('ez-chalk-underline', className)}
      viewBox="0 0 160 10"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M2 6.5 C 30 3, 60 8.5, 90 5 S 140 3, 158 6"
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
