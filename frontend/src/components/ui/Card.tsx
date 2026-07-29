import type { ComponentPropsWithoutRef } from 'react';

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export type CardVariant = 'default' | 'flat' | 'muted';

export type CardProps = ComponentPropsWithoutRef<'div'> & {
  variant?: CardVariant;
  interactive?: boolean;
};

export function Card({
  variant = 'default',
  interactive = false,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={cx(
        'ez-card',
        variant !== 'default' && `ez-card-${variant}`,
        interactive && 'ez-card-interactive',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  className,
  ...rest
}: ComponentPropsWithoutRef<'div'>) {
  return <div className={cx('ez-card-header', className)} {...rest} />;
}

export type CardTitleProps = ComponentPropsWithoutRef<'h3'> & {
  as?: 'h2' | 'h3' | 'h4' | 'h5';
};

export function CardTitle({ as: Tag = 'h3', className, ...rest }: CardTitleProps) {
  return <Tag className={cx('ez-card-title', className)} {...rest} />;
}

export function CardDescription({
  className,
  ...rest
}: ComponentPropsWithoutRef<'p'>) {
  return <p className={cx('ez-card-desc', className)} {...rest} />;
}

export function CardBody({
  className,
  ...rest
}: ComponentPropsWithoutRef<'div'>) {
  return <div className={cx('ez-card-body', className)} {...rest} />;
}

export function CardFooter({
  className,
  ...rest
}: ComponentPropsWithoutRef<'div'>) {
  return <div className={cx('ez-card-footer', className)} {...rest} />;
}
