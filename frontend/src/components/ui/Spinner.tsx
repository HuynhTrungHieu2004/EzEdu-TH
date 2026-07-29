function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export type SpinnerProps = {
  className?: string;
  label?: string;
};

/** Vòng xoay dùng chung cho mọi trạng thái đang tải. */
export function Spinner({ className, label }: SpinnerProps) {
  return (
    <span
      className={cx('ez-spinner', className)}
      role="status"
      aria-label={label ?? 'Đang tải'}
    />
  );
}
