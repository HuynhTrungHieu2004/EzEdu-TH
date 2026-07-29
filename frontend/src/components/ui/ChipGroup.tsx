import type { ComponentPropsWithoutRef, ReactNode } from 'react';

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export type ChipProps = ComponentPropsWithoutRef<'button'> & {
  selected?: boolean;
};

export function Chip({ selected, className, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      className={cx('ez-chip', className)}
      aria-pressed={selected}
      {...rest}
    />
  );
}

export type ChipGroupProps = {
  label?: string;
  children: ReactNode;
  className?: string;
};

export function ChipGroup({ label, children, className }: ChipGroupProps) {
  return (
    <div className={cx('ez-chip-group', className)} role="group" aria-label={label}>
      {children}
    </div>
  );
}
