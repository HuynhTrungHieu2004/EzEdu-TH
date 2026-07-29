import { useId } from 'react';

/**
 * Sinh bộ id nhất quán cho một trường nhập: id của input, id của gợi ý và id của lỗi.
 * Dùng useId của React khi không truyền id sẵn để tránh trùng id giữa các lần render.
 *
 * Tách khỏi FormField.tsx để file component chỉ export component — điều kiện
 * để Fast Refresh của Vite hoạt động đúng.
 */
export function useFieldIds(providedId?: string): {
  id: string;
  hintId: string;
  errorId: string;
} {
  const autoId = useId();
  const id = providedId ?? autoId;
  return { id, hintId: `${id}-hint`, errorId: `${id}-error` };
}
