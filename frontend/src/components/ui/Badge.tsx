import type { ComponentPropsWithoutRef, ReactNode } from 'react';

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export type BadgeVariant =
  | 'neutral'
  | 'primary'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'error'
  | 'info';

export type BadgeSize = 'sm' | 'md' | 'lg';

export type BadgeProps = ComponentPropsWithoutRef<'span'> & {
  variant?: BadgeVariant;
  count?: boolean;
  icon?: ReactNode;
  size?: BadgeSize;
};

export function Badge({
  variant = 'neutral',
  count = false,
  icon,
  size,
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={cx(
        'ez-badge',
        `ez-badge-${variant}`,
        count && 'ez-badge-count',
        size && `ez-badge-${size}`,
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </span>
  );
}
