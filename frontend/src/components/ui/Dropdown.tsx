import { cloneElement, isValidElement, useCallback, useEffect, useRef, useState } from 'react';
import type {
  AriaAttributes,
  ComponentPropsWithoutRef,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from 'react';

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

const TRIGGER_FOCUSABLE = 'button, a[href], [tabindex]:not([tabindex="-1"])';

type TriggerInjectedProps = {
  onClick?: (event: ReactMouseEvent<HTMLElement>) => void;
  'aria-haspopup'?: AriaAttributes['aria-haspopup'];
  'aria-expanded'?: AriaAttributes['aria-expanded'];
};

export interface DropdownProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: 'start' | 'end';
  direction?: 'down' | 'up';
  menuLabel?: string;
  className?: string;
}

export function Dropdown({
  trigger,
  children,
  align = 'end',
  direction = 'down',
  menuLabel,
  className,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const focusTrigger = useCallback(() => {
    const first = rootRef.current?.firstElementChild;
    if (!(first instanceof HTMLElement)) return;
    const target = first.matches(TRIGGER_FOCUSABLE)
      ? first
      : first.querySelector<HTMLElement>(TRIGGER_FOCUSABLE);
    target?.focus();
  }, []);

  // Đóng bằng Escape và trả tiêu điểm về nút mở menu.
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
      focusTrigger();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, focusTrigger]);

  // Đóng khi bấm ra ngoài.
  useEffect(() => {
    if (!open) return;

    const handleMouseDown = (event: MouseEvent) => {
      const root = rootRef.current;
      if (root && event.target instanceof Node && root.contains(event.target)) {
        return;
      }
      setOpen(false);
    };

    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [open]);

  // Khi mở, đưa tiêu điểm vào mục đầu tiên để dùng được bàn phím ngay.
  useEffect(() => {
    if (!open) return;
    const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    items?.item(0)?.focus();
  }, [open]);

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const menu = menuRef.current;
    if (!menu) return;

    const items = Array.from(
      menu.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ).filter((el) => !el.hasAttribute('disabled'));
    if (items.length === 0) return;

    const currentIndex = items.findIndex((el) => el === document.activeElement);

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      items[(currentIndex + 1 + items.length) % items.length].focus();
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      const previous = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
      items[previous].focus();
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      items[0].focus();
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      items[items.length - 1].focus();
    }
  };

  const triggerNode = isValidElement<TriggerInjectedProps>(trigger) ? (
    cloneElement(trigger, {
      onClick: (event: ReactMouseEvent<HTMLElement>) => {
        trigger.props.onClick?.(event);
        setOpen((value) => !value);
      },
      'aria-haspopup': 'menu',
      'aria-expanded': open,
    })
  ) : (
    <span
      role="none"
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={() => setOpen((value) => !value)}
    >
      {trigger}
    </span>
  );

  return (
    <div ref={rootRef} className={cx('ez-dropdown', className)}>
      {triggerNode}
      {open ? (
        <div
          ref={menuRef}
          className={cx(
            'ez-dropdown-menu',
            `ez-dropdown-menu-${align}`,
            direction === 'up' && 'ez-dropdown-menu-up',
          )}
          role="menu"
          aria-label={menuLabel}
          onKeyDown={handleMenuKeyDown}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

export type DropdownItemProps = ComponentPropsWithoutRef<'button'> & {
  icon?: ReactNode;
  danger?: boolean;
};

export function DropdownItem({
  icon,
  danger = false,
  className,
  children,
  ...rest
}: DropdownItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      className={cx(
        'ez-dropdown-item',
        danger && 'ez-dropdown-item-danger',
        className,
      )}
      {...rest}
    >
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      {children}
    </button>
  );
}

export interface DropdownLabelProps {
  children?: ReactNode;
  className?: string;
}

export function DropdownLabel({ children, className }: DropdownLabelProps) {
  return (
    <div className={cx('ez-dropdown-label', className)} role="presentation">
      {children}
    </div>
  );
}

export interface DropdownSeparatorProps {
  className?: string;
}

export function DropdownSeparator({ className }: DropdownSeparatorProps) {
  return (
    <div className={cx('ez-dropdown-separator', className)} role="separator" />
  );
}
