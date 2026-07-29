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

export type BadgeProps = ComponentPropsWithoutRef<'span'> & {
  variant?: BadgeVariant;
  count?: boolean;
  icon?: ReactNode;
};

export function Badge({
  variant = 'neutral',
  count = false,
  icon,
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
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </span>
  );
}
