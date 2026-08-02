function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export interface RedCheckmarkProps {
  size?: number;
  className?: string;
}

/** Dấu tích tay vẽ kiểu bút đỏ — dùng cho trạng thái đạt/hoàn thành/đúng. */
export function RedCheckmark({ size = 20, className }: RedCheckmarkProps) {
  return (
    <svg
      className={cx('ez-red-checkmark', className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M4 13 L9.5 18 L20 6"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
