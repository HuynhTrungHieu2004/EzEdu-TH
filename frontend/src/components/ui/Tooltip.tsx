import { useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export type TooltipProps = {
  label: string;
  placement?: 'top' | 'bottom';
  children: ReactNode;
  className?: string;
};

/**
 * Nhắc nhở phụ trợ khi trỏ chuột hoặc focus bàn phím.
 * Phần tử bên trong vẫn phải tự có aria-label riêng.
 */
export function Tooltip({
  label,
  placement = 'top',
  children,
  className,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);

  const hide = () => setVisible(false);
  const show = () => setVisible(true);

  const handleKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key === 'Escape') hide();
  };

  return (
    <span
      className={cx('ez-tooltip-wrap', className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onKeyDown={handleKeyDown}
    >
      {children}
      {visible ? (
        <span
          className={cx(
            'ez-tooltip',
            placement === 'bottom' && 'ez-tooltip-bottom',
          )}
          role="tooltip"
        >
          {label}
        </span>
      ) : null}
    </span>
  );
}
