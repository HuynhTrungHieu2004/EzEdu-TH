import { useState } from 'react';
import { ArrowRight, X } from 'lucide-react';
import { Link } from 'react-router-dom';

export interface AnnouncementBarProps {
  message: string | null | undefined;
  href?: string;
  ctaLabel?: string;
}

const STORAGE_KEY = 'ezedu_announcement_dismissed';

export default function AnnouncementBar({ message, href, ctaLabel }: AnnouncementBarProps) {
  const [dismissed, setDismissed] = useState(() => {
    if (!message) return true;
    try {
      return sessionStorage.getItem(STORAGE_KEY) === message;
    } catch {
      return false;
    }
  });

  if (!message || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem(STORAGE_KEY, message as string);
    } catch {
      // sessionStorage không khả dụng — chỉ ẩn trong phiên hiện tại, không chặn thao tác
    }
  }

  return (
    <div className="ezp-announce" role="region" aria-label="Thông báo">
      <div className="ezp-container ezp-announce-inner">
        <span className="ezp-announce-text">
          {message}
          {href && (
            <Link to={href} className="ezp-announce-link">
              {ctaLabel || 'Xem thêm'} <ArrowRight size={14} aria-hidden="true" />
            </Link>
          )}
        </span>
        <button type="button" className="ezp-announce-close" onClick={dismiss} aria-label="Đóng thông báo">
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
