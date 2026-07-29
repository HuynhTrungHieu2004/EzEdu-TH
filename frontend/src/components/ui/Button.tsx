import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { Spinner } from './Spinner';

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'link';

export type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonBaseProps = ComponentPropsWithoutRef<'button'> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  block?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
};

/** Nút chỉ có icon: bắt buộc có aria-label để trình đọc màn hình đọc được. */
interface IconOnlyButtonProps extends ButtonBaseProps {
  iconOnly: true;
  'aria-label': string;
}

interface LabelledButtonProps extends ButtonBaseProps {
  iconOnly?: false;
}

export type ButtonProps = IconOnlyButtonProps | LabelledButtonProps;

export function Button(props: ButtonProps) {
  const {
    variant = 'primary',
    size = 'md',
    loading = false,
    block = false,
    iconOnly = false,
    leadingIcon,
    trailingIcon,
    className,
    children,
    disabled,
    // Mặc định là 'button' để nút không vô tình submit form khi đặt trong <form>.
    type = 'button',
    ...rest
  } = props;

  return (
    <button
      type={type}
      className={cx(
        'ez-btn',
        `ez-btn-${variant}`,
        size !== 'md' && `ez-btn-${size}`,
        block && 'ez-btn-block',
        iconOnly && 'ez-btn-icon',
        className,
      )}
      data-loading={loading ? 'true' : undefined}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner /> : leadingIcon}
      {children}
      {trailingIcon}
    </button>
  );
}
