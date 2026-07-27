/**
 * FormatsBar — Dòng hiển thị định dạng học liệu được hỗ trợ
 *
 * Đặt ngay bên dưới HeroSection, trên UploadSection.
 *
 * Nguồn thật từ backend (documents.py):
 *   DOCUMENT_EXTENSIONS = {"pdf", "docx", "pptx"}
 *   VIDEO_EXTENSIONS    = {"mp4", "mov", "webm", "mkv"}
 *   ALLOWED_EXTENSIONS  = DOCUMENT_EXTENSIONS | VIDEO_EXTENSIONS
 *
 * Chỉ hiển thị các định dạng đang được xử lý trong sản phẩm.
 */
import { FileText, Film, ArrowRight } from 'lucide-react';

// ─── Danh sách định dạng ─────────────────────────────────────────────────────
interface Format {
  id: string;
  label: string;
  subLabel?: string;
  icon: React.ReactNode;
}

const FORMATS: Format[] = [
  // ── Thực sự được hỗ trợ (backend ALLOWED_EXTENSIONS) ─────────────────────
  {
    id: 'pdf',
    label: 'PDF',
    icon: <FileText size={16} strokeWidth={2} aria-hidden="true" />,
  },
  {
    id: 'docx',
    label: 'DOCX',
    subLabel: 'Word',
    icon: <FileText size={16} strokeWidth={2} aria-hidden="true" />,
  },
  {
    id: 'pptx',
    label: 'PPTX',
    subLabel: 'PowerPoint',
    icon: <FileText size={16} strokeWidth={2} aria-hidden="true" />,
  },
  {
    id: 'video',
    label: 'Video',
    subLabel: 'MP4 · MOV · WEBM · MKV',
    icon: <Film size={16} strokeWidth={2} aria-hidden="true" />,
  },
];

// ─── Component ────────────────────────────────────────────────────────────────
export default function FormatsBar() {
  return (
    <div className="lp-formats-bar" role="region" aria-label="Định dạng học liệu hỗ trợ">
      <div className="lp-formats-inner">

        {/* Label trái */}
        <div className="lp-formats-heading" aria-hidden="true">
          <span className="lp-formats-heading-text">Hỗ trợ nhiều loại học liệu</span>
          <ArrowRight size={14} strokeWidth={2} className="lp-formats-heading-arrow" aria-hidden="true" />
        </div>

        {/* Divider dọc */}
        <div className="lp-formats-sep" aria-hidden="true" />

        {/* Các chip định dạng */}
        <div className="lp-formats-chips" role="list" aria-label="Danh sách định dạng">
          {FORMATS.map((fmt) => (
            <div
              key={fmt.id}
              className="lp-format-chip"
              role="listitem"
              aria-label={`${fmt.label}${fmt.subLabel ? ` (${fmt.subLabel})` : ''}`}
            >
              <span className="lp-format-chip-icon" aria-hidden="true">
                {fmt.icon}
              </span>
              <span className="lp-format-chip-label">{fmt.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
