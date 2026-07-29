import { useEffect, useId } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from './Button';
import { useLockBodyScroll } from './useLockBodyScroll';
import { useFocusTrap } from './useFocusTrap';

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export type DialogSize = 'sm' | 'md' | 'lg' | 'xl';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  size?: DialogSize;
  closeOnOverlayClick?: boolean;
  className?: string;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnOverlayClick = true,
  className,
}: DialogProps) {
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const descId = `${baseId}-desc`;

  useLockBodyScroll(open);
  const focusTrapRef = useFocusTrap<HTMLDivElement>(open);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <>
      <div
        className="ez-overlay"
        onClick={closeOnOverlayClick ? onClose : undefined}
      />
      <div className="ez-dialog-wrap">
        <div
          ref={focusTrapRef}
          className={cx(
            'ez-dialog',
            // CSS chỉ có sm/lg/xl — cỡ md là mặc định nên không thêm class.
            size !== 'md' && `ez-dialog-${size}`,
            className,
          )}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descId : undefined}
        >
          <div className="ez-dialog-header">
            <div>
              <h2 className="ez-dialog-title" id={titleId}>
                {title}
              </h2>
              {description ? (
                <p className="ez-dialog-desc" id={descId}>
                  {description}
                </p>
              ) : null}
            </div>
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              aria-label="Đóng"
              onClick={onClose}
            >
              <X aria-hidden="true" />
            </Button>
          </div>

          {children ? <div className="ez-dialog-body">{children}</div> : null}
          {footer ? <div className="ez-dialog-footer">{footer}</div> : null}
        </div>
      </div>
    </>,
    document.body,
  );
}

export interface DialogFooterProps {
  children?: ReactNode;
  className?: string;
}

/** Dùng khi trang tự dựng phần chân dialog thay vì truyền prop `footer`. */
export function DialogFooter({ children, className }: DialogFooterProps) {
  return <div className={cx('ez-dialog-footer', className)}>{children}</div>;
}
