import type { ComponentPropsWithoutRef, ReactNode } from 'react';

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export type InputProps = ComponentPropsWithoutRef<'input'> & {
  invalid?: boolean;
  state?: 'success';
  leadingIcon?: ReactNode;
  trailing?: ReactNode;
  wrapperClassName?: string;
};

export function Input({
  invalid,
  state,
  leadingIcon,
  trailing,
  wrapperClassName,
  className,
  ...rest
}: InputProps) {
  const input = (
    <input
      className={cx('ez-input', className)}
      aria-invalid={invalid ? 'true' : undefined}
      data-state={state}
      {...rest}
    />
  );

  if (!leadingIcon && !trailing) return input;

  return (
    <div className={cx('ez-input-group', wrapperClassName)}>
      {leadingIcon ? (
        <span className="ez-input-icon" aria-hidden="true">
          {leadingIcon}
        </span>
      ) : null}
      {input}
      {trailing ? <span className="ez-input-trailing">{trailing}</span> : null}
    </div>
  );
}
