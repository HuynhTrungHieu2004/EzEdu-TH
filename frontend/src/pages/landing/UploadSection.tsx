import { useNavigate } from 'react-router-dom';
import { Cloud } from 'lucide-react';

interface UploadSectionProps {
  hasToken: boolean;
}

const uploadBadges = [
  { label: 'PDF' },
  { label: 'DOCX' },
  { label: 'PPTX' },
  { label: 'Video' },
];

export default function UploadSection({ hasToken }: UploadSectionProps) {
  const navigate = useNavigate();
  return (
    <section className="lp-upload-section" id="upload" aria-label="Khu vực tải học liệu">
      <div className="lp-upload-box">
        <p className="lp-upload-label"><span aria-hidden="true">⚡</span> Bắt đầu ngay</p>
        <h2 className="lp-upload-title">Tải học liệu lên để bắt đầu</h2>
        <p className="lp-upload-desc" id="upload-section-desc">
          Hỗ trợ PDF, Word, PowerPoint và video. AI sẽ tự động xử lý, phân tích
          và sẵn sàng sinh đề thi chỉ trong vài giây.
        </p>
        <button
          type="button"
          className="lp-upload-zone"
          aria-describedby="upload-section-desc"
          onClick={() => navigate(hasToken ? '/documents' : '/register')}
        >
          <span className="lp-upload-zone-icon" aria-hidden="true"><Cloud size={32} strokeWidth={1.5} aria-hidden="true" /></span>
          <p className="lp-upload-zone-text">
            {hasToken ? 'Nhấn để tải học liệu lên' : 'Đăng ký miễn phí để bắt đầu'}
          </p>
          <p className="lp-upload-zone-sub">
            {hasToken
              ? 'Kéo thả file hoặc nhấn để chọn'
              : 'Không cần thẻ tín dụng · Miễn phí hoàn toàn'}
          </p>
          <div className="lp-file-types">
            {uploadBadges.map(badge => (
              <span
                className="lp-file-type-badge"
                key={badge.label}
              >
                {badge.label}
              </span>
            ))}
          </div>
        </button>
      </div>
    </section>
  );
}
