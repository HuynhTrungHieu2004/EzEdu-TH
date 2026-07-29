import { useEffect } from 'react';

/**
 * Khoá cuộn trang khi có lớp phủ (dialog / drawer) đang mở.
 * Ghi nhớ giá trị overflow trước đó và trả lại đúng như cũ khi dọn dẹp,
 * nhờ vậy nhiều lớp phủ lồng nhau không làm mất trạng thái ban đầu.
 */
export function useLockBodyScroll(active: boolean): void {
  useEffect(() => {
    if (!active) return;

    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = 'hidden';

    return () => {
      body.style.overflow = previousOverflow;
    };
  }, [active]);
}
