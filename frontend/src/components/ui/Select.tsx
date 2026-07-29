import type { ComponentPropsWithoutRef } from 'react';

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type SelectProps = ComponentPropsWithoutRef<'select'> & {
  invalid?: boolean;
  options?: SelectOption[];
  placeholder?: string;
};

/**
 * Dùng thẻ <select> gốc của trình duyệt để có sẵn điều hướng bàn phím
 * và bộ chọn dạng bánh xe trên thiết bị di động.
 */
export function Select({
  invalid,
  options,
  placeholder,
  className,
  children,
  ...rest
}: SelectProps) {
  return (
    <select
      className={cx('ez-select', className)}
      aria-invalid={invalid ? 'true' : undefined}
      {...rest}
    >
      {placeholder ? (
        <option value="" disabled>
          {placeholder}
        </option>
      ) : null}
      {options
        ? options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))
        : children}
    </select>
  );
}
