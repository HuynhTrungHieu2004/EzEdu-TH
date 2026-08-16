/**
 * Theo dõi "máy chủ đang ngủ dậy".
 *
 * Backend chạy trên gói miễn phí của Render: không ai gọi trong 15 phút thì nó
 * tắt, và lần gọi kế tiếp phải chờ 1-2 phút để khởi động lại (đo thật: 105 giây). Render có
 * trang chờ, nhưng chỉ hiện khi trình duyệt điều hướng THẲNG vào backend —
 * frontend nằm ở Netlify và gọi API bằng XHR nên người dùng không thấy gì cả,
 * chỉ thấy ứng dụng đứng im.
 *
 * Module này đếm số request đang treo quá lâu để giao diện nói rõ chuyện gì
 * đang xảy ra. Không huỷ request, không thử lại — chỉ báo.
 */

/** Chờ quá ngần này mới coi là bất thường; request bình thường mất dưới 1 giây. */
export const SLOW_REQUEST_MS = 4000;

type Listener = (waking: boolean) => void;

const listeners = new Set<Listener>();
let slowCount = 0;

function emit() {
  const waking = slowCount > 0;
  for (const listener of listeners) listener(waking);
}

export function subscribeServerWaking(listener: Listener): () => void {
  listeners.add(listener);
  listener(slowCount > 0);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Gọi khi một request bắt đầu. Trả về hàm dọn — gọi lúc request kết thúc dù
 * thành công hay lỗi, nếu không cờ sẽ kẹt ở trạng thái "đang khởi động".
 */
export function trackRequest(): () => void {
  let counted = false;
  const timer = setTimeout(() => {
    counted = true;
    slowCount += 1;
    emit();
  }, SLOW_REQUEST_MS);

  return () => {
    clearTimeout(timer);
    if (counted) {
      counted = false;
      slowCount = Math.max(0, slowCount - 1);
      emit();
    }
  };
}
