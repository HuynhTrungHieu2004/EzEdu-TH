import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from './ui';
import './data-notice.css';

/**
 * Thông báo app lưu dữ liệu gì trên trình duyệt.
 *
 * KHÔNG phải banner cookie kiểu "Accept All / Reject All": app không đặt cookie
 * nào, không có analytics, không có pixel quảng cáo (xem
 * `docs/superpowers/specs/2026-08-16-thong-bao-du-lieu-design.md`). Cho người
 * dùng bấm "từ chối" thứ không tồn tại là nói dối họ, nên đây chỉ là thông báo.
 *
 * Khoá có số phiên bản: đổi nội dung chính sách thì tăng lên `v2` để người đã
 * đọc bản cũ thấy lại thông báo.
 */
const ACK_KEY = 'ez-data-notice-v1';

function hasAcknowledged(): boolean {
  try {
    return localStorage.getItem(ACK_KEY) === 'ack';
  } catch {
    // Trình duyệt chặn localStorage (chế độ riêng tư): coi như chưa đọc, nhưng
    // vẫn phải hiện được thông báo thay vì nổ.
    return false;
  }
}

export default function DataNotice() {
  // Đọc ngay lúc khởi tạo state chứ không qua effect: ứng dụng chạy hoàn toàn
  // ở trình duyệt (không SSR) nên `localStorage` có sẵn từ lần render đầu, và
  // người đã bấm "Đã hiểu" không thấy thông báo nháy lên một nhịp.
  const [visible, setVisible] = useState(() => !hasAcknowledged());

  // Dải cố định ở đáy che mất phần cuối trang: đánh dấu `<body>` để CSS chừa
  // đúng khoảng đó, gỡ ngay khi người dùng bấm "Đã hiểu".
  useEffect(() => {
    document.body.classList.toggle('has-data-notice', visible);
    return () => document.body.classList.remove('has-data-notice');
  }, [visible]);

  function acknowledge() {
    try {
      localStorage.setItem(ACK_KEY, 'ack');
    } catch {
      // Không ghi được thì vẫn ẩn trong phiên này.
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="ez-data-notice" role="region" aria-label="Thông báo về dữ liệu lưu trên trình duyệt">
      <p className="ez-data-notice-text">
        Trang này lưu một ít dữ liệu ngay trên trình duyệt của bạn để giữ đăng nhập và nhớ tuỳ chọn hiển thị.
        Không dùng cookie quảng cáo hay theo dõi.
      </p>
      <div className="ez-data-notice-actions">
        <Link to="/chinh-sach-du-lieu" className="ez-data-notice-link">
          Chi tiết
        </Link>
        <Button size="sm" onClick={acknowledge}>
          Đã hiểu
        </Button>
      </div>
    </div>
  );
}
