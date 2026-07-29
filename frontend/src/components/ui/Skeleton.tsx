import type { ComponentPropsWithoutRef, ReactNode } from 'react';

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export type SkeletonProps = ComponentPropsWithoutRef<'div'> & {
  width?: string;
  height?: string;
  circle?: boolean;
};

/**
 * Khối giả chỗ khi đang tải. Chỉ mang tính trang trí nên luôn bị ẩn với
 * trình đọc màn hình — thông báo "đang tải" thuộc về một vùng aria-live khác.
 */
export function Skeleton({
  width,
  height,
  circle = false,
  className,
  style,
  ...rest
}: SkeletonProps) {
  return (
    <div
      className={cx('ez-skeleton', circle && 'ez-skeleton-circle', className)}
      style={{ width, height, ...style }}
      aria-hidden="true"
      {...rest}
    />
  );
}

export interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  const total = Math.max(1, lines);

  return (
    <div className={className} aria-hidden="true">
      {Array.from({ length: total }, (_, index) => (
        <div
          key={index}
          className="ez-skeleton ez-skeleton-text"
          style={index === total - 1 ? { width: '60%' } : undefined}
        />
      ))}
    </div>
  );
}

export interface SkeletonStackProps {
  children: ReactNode;
  className?: string;
}

export function SkeletonStack({ children, className }: SkeletonStackProps) {
  return (
    <div className={cx('ez-skeleton-stack', className)} aria-busy="true">
      <span className="ez-sr-only" role="status">
        Đang tải nội dung…
      </span>
      <div aria-hidden="true">
        {children}
      </div>
    </div>
  );
}
