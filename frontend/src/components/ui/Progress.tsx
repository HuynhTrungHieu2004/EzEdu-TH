import { Check, X } from 'lucide-react';

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export type ProgressBarProps = {
  value: number;
  max?: number;
  label?: string;
  valueText?: string;
  tone?: 'primary' | 'success' | 'warning' | 'error';
  showHeader?: boolean;
  className?: string;
};

const TONE_CLASS: Record<'success' | 'warning' | 'error', string> = {
  success: 'ez-progress-fill-success',
  warning: 'ez-progress-fill-warning',
  error: 'ez-progress-fill-error',
};

export function ProgressBar({
  value,
  max = 100,
  label,
  valueText,
  tone = 'primary',
  showHeader,
  className,
}: ProgressBarProps) {
  const safeMax = max > 0 ? max : 100;
  const clamped = Math.min(Math.max(Number.isFinite(value) ? value : 0, 0), safeMax);
  const pct = (clamped / safeMax) * 100;

  return (
    <div className={className}>
      {showHeader ? (
        <div className="ez-progress-header">
          <span className="ez-progress-label">{label}</span>
          <span className="ez-progress-value">{valueText}</span>
        </div>
      ) : null}
      <div
        className="ez-progress"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-label={label}
        aria-valuetext={valueText}
      >
        <div
          className={cx('ez-progress-fill', tone !== 'primary' && TONE_CLASS[tone])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export type ProgressStep = {
  id: string;
  label: string;
  description?: string;
  status: 'pending' | 'active' | 'done' | 'error';
};

export type ProgressStepsProps = {
  steps: ProgressStep[];
  className?: string;
};

/** Từ mô tả trạng thái cho trình đọc màn hình — không chỉ dựa vào màu và icon. */
const STATUS_TEXT: Record<ProgressStep['status'], string> = {
  pending: 'chưa thực hiện',
  active: 'đang thực hiện',
  done: 'hoàn thành',
  error: 'lỗi',
};

export function ProgressSteps({ steps, className }: ProgressStepsProps) {
  return (
    <ol className={cx('ez-steps', className)}>
      {steps.map((step, index) => (
        <li key={step.id} className="ez-step" data-status={step.status}>
          <span className="ez-step-marker" aria-hidden="true">
            {step.status === 'done' ? (
              <Check size={16} />
            ) : step.status === 'error' ? (
              <X size={16} />
            ) : (
              index + 1
            )}
          </span>
          <div>
            <div className="ez-step-label">
              {step.label}
              <span className="ez-sr-only"> — {STATUS_TEXT[step.status]}</span>
            </div>
            {step.description ? (
              <div className="ez-step-desc">{step.description}</div>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
