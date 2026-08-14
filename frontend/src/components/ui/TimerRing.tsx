function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export type TimerRingProps = {
  /** Thời gian còn lại (ms). Giá trị âm được kẹp về 0. */
  remainingMs: number;
  /** Tổng thời gian làm bài (ms) — dùng để tính phần vòng đã chạy. */
  totalMs: number;
  /** Ngưỡng chuyển sang trạng thái gấp (ms). */
  dangerMs?: number;
  label?: string;
  className?: string;
};

const SIZE = 76;
const STROKE = 6;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Vòng đếm ngược thời gian làm bài.
 *
 * Vòng chạy bằng `stroke-dashoffset` tính từ tỉ lệ thời gian còn lại — không có
 * animation JS nào, nên `prefers-reduced-motion` không cần xử lý riêng: mỗi giây
 * React vẽ lại một trạng thái tĩnh.
 */
export function TimerRing({
  remainingMs,
  totalMs,
  dangerMs = 60_000,
  label = 'Thời gian còn lại',
  className,
}: TimerRingProps) {
  const remaining = Math.max(0, remainingMs);
  const ratio = totalMs > 0 ? Math.min(1, remaining / totalMs) : 0;
  const danger = remaining <= dangerMs;
  const text = formatRemaining(remaining);

  return (
    <div className={cx('ez-timer-ring', danger && 'ez-timer-ring-danger', className)}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true" focusable="false">
        <circle
          className="ez-timer-ring-track"
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
        />
        <circle
          className="ez-timer-ring-value"
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - ratio)}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </svg>
      {/* aria-live off: đọc lại từng giây sẽ chặn hết thao tác của screen reader */}
      <span className="ez-timer-ring-text" role="timer" aria-live="off" aria-label={`${label}: ${text}`}>
        {text}
      </span>
    </div>
  );
}
