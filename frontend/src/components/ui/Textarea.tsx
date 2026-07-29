import type { ComponentPropsWithoutRef } from 'react';

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export type TextareaProps = ComponentPropsWithoutRef<'textarea'> & {
  invalid?: boolean;
  state?: 'success';
};

export function Textarea({ invalid, state, className, ...rest }: TextareaProps) {
  return (
    <textarea
      className={cx('ez-textarea', className)}
      aria-invalid={invalid ? 'true' : undefined}
      data-state={state}
      {...rest}
    />
  );
}
