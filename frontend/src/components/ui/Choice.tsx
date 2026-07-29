import { useId } from 'react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

type NativeInputProps = Omit<ComponentPropsWithoutRef<'input'>, 'type'>;

export type CheckboxProps = NativeInputProps & {
  label: ReactNode;
  description?: string;
};

export type RadioProps = CheckboxProps;

type ChoiceProps = CheckboxProps & { type: 'checkbox' | 'radio' };

function Choice({
  type,
  label,
  description,
  disabled,
  className,
  'aria-describedby': ariaDescribedBy,
  ...rest
}: ChoiceProps) {
  const descId = `${useId()}-desc`;
  const describedBy =
    [ariaDescribedBy, description ? descId : undefined].filter(Boolean).join(' ') || undefined;

  return (
    <label
      className={cx('ez-check', className)}
      data-disabled={disabled ? 'true' : undefined}
    >
      <input
        type={type}
        disabled={disabled}
        aria-describedby={describedBy}
        {...rest}
      />
      <span>
        <span className="ez-check-label">{label}</span>
        {description ? (
          <span className="ez-check-desc" id={descId}>
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}

export function Checkbox(props: CheckboxProps) {
  return <Choice type="checkbox" {...props} />;
}

export function Radio(props: RadioProps) {
  return <Choice type="radio" {...props} />;
}

export type RadioCardProps = Omit<ComponentPropsWithoutRef<'input'>, 'type' | 'title'> & {
  title: string;
  description?: string;
};

export function RadioCard({
  title,
  description,
  className,
  'aria-describedby': ariaDescribedBy,
  ...rest
}: RadioCardProps) {
  const descId = `${useId()}-desc`;
  const describedBy =
    [ariaDescribedBy, description ? descId : undefined].filter(Boolean).join(' ') || undefined;

  return (
    <label className={cx('ez-radio-card', className)}>
      <input type="radio" aria-describedby={describedBy} {...rest} />
      {/* Dùng div để tiêu đề và mô tả xếp thành hai dòng — ez-radio-card-desc
          không được khai báo display: block trong ui.css. */}
      <div>
        <div className="ez-radio-card-title">{title}</div>
        {description ? (
          <div className="ez-radio-card-desc" id={descId}>
            {description}
          </div>
        ) : null}
      </div>
    </label>
  );
}
