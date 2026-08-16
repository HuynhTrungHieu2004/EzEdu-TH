import { useEffect, useState } from 'react';
import { subscribeServerWaking } from '../api/serverWaking';
import './server-waking-notice.css';

/**
 * Báo cho người dùng biết máy chủ đang khởi động lại.
 *
 * Backend nằm trên gói miễn phí của Render: ngủ sau 15 phút không ai dùng, dậy
 * mất khoảng một phút. Không có thông báo này thì lần đầu vào buổi sáng ứng
 * dụng trông như hỏng — người dùng bấm lại, tải lại trang, rồi bỏ đi.
 *
 * Chỉ thông báo, không huỷ hay thử lại request: request vẫn đang chạy và sẽ
 * trả về khi máy chủ sẵn sàng.
 */
export default function ServerWakingNotice() {
  const [waking, setWaking] = useState(false);

  useEffect(() => subscribeServerWaking(setWaking), []);

  if (!waking) return null;

  return (
    <div className="ez-waking" role="status" aria-live="polite">
      <span className="ez-waking-dot" aria-hidden="true" />
      <span>Máy chủ đang khởi động lại, thường mất khoảng một phút. Bạn không cần tải lại trang.</span>
    </div>
  );
}
