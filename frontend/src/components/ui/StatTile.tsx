import type { ComponentPropsWithoutRef, ReactNode } from 'react';

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export type StatTileProps = {
  label: ReactNode;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  loading?: boolean;
  className?: string;
};

export function StatTile({
  label,
  value,
  hint,
  icon,
  loading = false,
  className,
}: StatTileProps) {
  return (
    <div className={cx('ez-stat', className)}>
      <div className="ez-stat-label">
        {icon ? <span aria-hidden="true">{icon}</span> : null}
        {label}
      </div>

      {loading ? (
        <div className="ez-skeleton ez-skeleton-title" />
      ) : (
        <div className="ez-stat-value">{value}</div>
      )}

      {hint ? <div className="ez-stat-hint">{hint}</div> : null}
    </div>
  );
}

export type StatGridProps = ComponentPropsWithoutRef<'div'> & {
  cols?: number;
};

export function StatGrid({ children, className, cols, style, ...rest }: StatGridProps) {
  const gridStyle = cols ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, ...style } : style;
  return (
    <div className={cx('ez-stat-grid', className)} style={gridStyle} {...rest}>
      {children}
    </div>
  );
}
