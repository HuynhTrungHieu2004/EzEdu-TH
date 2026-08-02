function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export interface GradeStampProps {
  value: string | number;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/** Badge tròn kiểu con dấu chấm điểm — dùng cho điểm số/kết quả nổi bật. */
export function GradeStamp({ value, label, size = 'md', className }: GradeStampProps) {
  return (
    <div className={cx('ez-grade-stamp', `ez-grade-stamp-${size}`, className)}>
      <span className="ez-grade-stamp-value">{value}</span>
      {label ? <span className="ez-grade-stamp-label">{label}</span> : null}
    </div>
  );
}
