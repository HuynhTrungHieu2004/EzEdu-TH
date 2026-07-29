import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export type AlertTone = 'info' | 'success' | 'warning' | 'error';

const ICONS: Record<AlertTone, ReactNode> = {
  info: <Info size={18} />,
  success: <CheckCircle2 size={18} />,
  warning: <AlertTriangle size={18} />,
  error: <AlertCircle size={18} />,
};

export interface AlertProps extends ComponentPropsWithoutRef<'div'> {
  tone?: AlertTone;
  title?: string;
  /** Ẩn icon khi thông báo nằm trong ngữ cảnh đã rõ nghĩa. */
  hideIcon?: boolean;
}

/**
 * Thông báo trong luồng nội dung.
 *
 * Cảnh báo và lỗi mang `role="alert"` để trình đọc màn hình thông báo ngay;
 * thông tin thường thì không, tránh cắt ngang việc người dùng đang làm.
 * Icon luôn đi kèm màu để trạng thái không chỉ được truyền tải bằng màu sắc.
 */
export function Alert({
  tone = 'info',
  title,
  hideIcon = false,
  className,
  children,
  ...rest
}: AlertProps) {
  const assertive = tone === 'error' || tone === 'warning';

  return (
    <div
      className={cx('ez-alert', `ez-alert-${tone}`, className)}
      role={assertive ? 'alert' : undefined}
      {...rest}
    >
      {!hideIcon && (
        <span className="ez-alert-icon" aria-hidden="true">
          {ICONS[tone]}
        </span>
      )}
      <div className="ez-alert-content">
        {title ? <p className="ez-alert-title">{title}</p> : null}
        {children}
      </div>
    </div>
  );
}
