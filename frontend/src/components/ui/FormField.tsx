import { AlertCircle } from 'lucide-react';
import { cloneElement, isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { useFieldIds } from './useFieldIds';

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export type FormFieldProps = {
  label?: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  hintId?: string;
  error?: string;
  errorId?: string;
  children: ReactNode;
  className?: string;
};

/** Props chung mà Input/Textarea/Select/Checkbox... của hệ thống đều nhận. */
type WireableProps = {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
};

/**
 * Nối `htmlFor` của nhãn với `id` của trường nhập, và nối cả hai với gợi ý/lỗi
 * qua `aria-describedby` — tự động, không cần mỗi nơi gọi `FormField` phải tự
 * tính `useFieldIds` và truyền `htmlFor`/`id` tay.
 *
 * Trước đây `FormField` chỉ đặt `<label htmlFor>` cạnh `children` mà không có
 * gì nối `id` vào phần tử nhập bên trong, nên nhãn và trường nhập chỉ đứng
 * cạnh nhau về hình ảnh — bấm vào nhãn không focus được trường, và trình đọc
 * màn hình không biết chúng thuộc về nhau. Phát hiện qua việc một bài kiểm tra
 * Playwright không định vị được trường bằng nhãn.
 */
export function FormField({
  label,
  htmlFor,
  required,
  hint,
  hintId,
  error,
  errorId,
  children,
  className,
}: FormFieldProps) {
  const ids = useFieldIds(htmlFor);
  const resolvedHintId = hintId ?? ids.hintId;
  const resolvedErrorId = errorId ?? ids.errorId;
  const describedBy = error ? resolvedErrorId : hint ? resolvedHintId : undefined;

  let content = children;
  if (isValidElement(children)) {
    const child = children as ReactElement<WireableProps>;
    const existingDescribedBy = child.props['aria-describedby'];
    content = cloneElement(child, {
      id: child.props.id ?? ids.id,
      'aria-describedby':
        [existingDescribedBy, describedBy].filter(Boolean).join(' ') || undefined,
      'aria-invalid': child.props['aria-invalid'] ?? (error ? 'true' : undefined),
    });
  }

  return (
    <div className={cx('ez-field', className)}>
      {label ? (
        <label className="ez-label" htmlFor={ids.id}>
          {label}
          {required ? (
            <>
              <span className="ez-label-required" aria-hidden="true">
                *
              </span>
              <span className="ez-sr-only">(bắt buộc)</span>
            </>
          ) : null}
        </label>
      ) : null}

      {content}

      {/* Lỗi phải nằm ngay dưới trường nhập; khi có lỗi thì không hiện gợi ý
          để trình đọc màn hình không đọc trùng hai thông báo. */}
      {error ? (
        <p className="ez-field-error" id={resolvedErrorId} role="alert">
          <AlertCircle size={14} aria-hidden="true" />
          {error}
        </p>
      ) : hint ? (
        <p className="ez-field-hint" id={resolvedHintId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
