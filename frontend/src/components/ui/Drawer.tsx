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

export type DrawerSide = 'left' | 'right' | 'bottom';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  side?: DrawerSide;
  children: ReactNode;
  footer?: ReactNode;
  ariaLabel?: string;
  className?: string;
}

export function Drawer({
  open,
  onClose,
  title,
  side = 'right',
  children,
  footer,
  ariaLabel,
  className,
}: DrawerProps) {
  const baseId = useId();
  const titleId = `${baseId}-title`;

  useLockBodyScroll(open);
  const focusTrapRef = useFocusTrap<HTMLElement>(open);

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
      <div className="ez-overlay" onClick={onClose} />
      <aside
        ref={focusTrapRef}
        className={cx('ez-drawer', `ez-drawer-${side}`, className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={!title ? ariaLabel : undefined}
      >
        <div className="ez-drawer-header">
          {title ? (
            <h2 className="ez-drawer-title" id={titleId}>
              {title}
            </h2>
          ) : (
            <span />
          )}
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

        <div className="ez-drawer-body">{children}</div>
        {footer ? <div className="ez-drawer-footer">{footer}</div> : null}
      </aside>
    </>,
    document.body,
  );
}
