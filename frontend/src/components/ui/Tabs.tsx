import { useId } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';

export type TabItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  badge?: ReactNode;
};

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  children?: ReactNode;
  className?: string;
}

export function Tabs({
  items,
  value,
  onChange,
  ariaLabel,
  children,
  className,
}: TabsProps) {
  const baseId = useId();
  const tabId = (id: string) => `${baseId}-tab-${id}`;
  const panelId = (id: string) => `${baseId}-panel-${id}`;

  const enabled = items.filter((item) => !item.disabled);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (enabled.length === 0) return;

    const currentIndex = enabled.findIndex((item) => item.id === value);
    let next: TabItem | undefined;

    if (event.key === 'ArrowRight') {
      next = enabled[(currentIndex + 1 + enabled.length) % enabled.length];
    } else if (event.key === 'ArrowLeft') {
      next =
        enabled[currentIndex <= 0 ? enabled.length - 1 : currentIndex - 1];
    } else if (event.key === 'Home') {
      next = enabled[0];
    } else if (event.key === 'End') {
      next = enabled[enabled.length - 1];
    } else {
      return;
    }

    if (!next || next.id === value) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    onChange(next.id);
    // Đưa tiêu điểm sang tab mới để bàn phím tiếp tục điều hướng được.
    const target = event.currentTarget.querySelector<HTMLElement>(
      `#${CSS.escape(tabId(next.id))}`,
    );
    target?.focus();
  };

  const activeItem = items.find((item) => item.id === value);

  return (
    <div className={className}>
      <div
        className="ez-tabs-list"
        role="tablist"
        aria-label={ariaLabel}
        onKeyDown={handleKeyDown}
      >
        {items.map((item) => {
          const selected = item.id === value;
          return (
            <button
              key={item.id}
              type="button"
              id={tabId(item.id)}
              className="ez-tab"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId(item.id)}
              tabIndex={selected ? 0 : -1}
              disabled={item.disabled}
              onClick={() => {
                if (!item.disabled && !selected) onChange(item.id);
              }}
            >
              {item.icon ? <span aria-hidden="true">{item.icon}</span> : null}
              {item.label}
              {item.badge}
            </button>
          );
        })}
      </div>

      {activeItem ? (
        <div
          className="ez-tab-panel"
          role="tabpanel"
          id={panelId(activeItem.id)}
          aria-labelledby={tabId(activeItem.id)}
          tabIndex={0}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
