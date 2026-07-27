/**
 * HeroSection — Landing page hero với nền sáng
 *
 * - Nền gradient tím/hồng rất nhạt (không tối)
 * - Tiêu đề lớn, đậm, không bị xuống dòng vụn
 * - Mô tả đầy đủ
 * - Hai nút: "Bắt đầu tạo đề" + "Xem cách hoạt động"
 * - Auth-aware: guest → /register, logged-in → /documents
 * - Feature chips với Lucide icons
 */
import { useNavigate } from 'react-router-dom';
import {
  Bot,
  FileCheck,
  FileText,
  PlayCircle,
  Search,
  Sparkles,
} from 'lucide-react';
import UploadWidget from './UploadWidget';
import HeroIllustration from './HeroIllustration';
import { scrollToSection } from './scroll';
import type { HeroContent } from '../../types/websiteContent';

interface HeroSectionProps {
  hasToken: boolean;
  content?: HeroContent;
}

const heroFeatureChips = [
  { Icon: FileText, label: 'PDF · DOCX · PPTX · Video' },
  { Icon: Search, label: 'Tìm đúng nội dung' },
  { Icon: Bot, label: 'Tạo câu hỏi nhanh' },
  { Icon: FileCheck, label: 'Có đáp án và lời giải' },
];

const heroStickers = [
  { src: '/images/stickers/pdf-learning.png', label: 'PDF', className: 'lp-sticker-pdf' },
  { src: '/images/stickers/video-learning.png', label: 'Video', className: 'lp-sticker-video' },
  { src: '/images/stickers/quiz-learning.png', label: 'Câu hỏi', className: 'lp-sticker-quiz' },
  { src: '/images/stickers/notes-learning.png', label: 'Ghi chú', className: 'lp-sticker-note' },
  { src: '/images/stickers/research-learning.png', label: 'Nghiên cứu', className: 'lp-sticker-research' },
  { src: '/images/stickers/idea-learning.png', label: 'Ý tưởng', className: 'lp-sticker-idea' },
  { src: '/images/stickers/personalization-learning.png', label: 'Cá nhân hóa', className: 'lp-sticker-personalization' },
  { src: '/images/stickers/graduation-learning.png', label: 'Học sinh', className: 'lp-sticker-graduation' },
];

export default function HeroSection({ hasToken, content }: HeroSectionProps) {
  const navigate = useNavigate();

  const scrollToSteps = () => {
    scrollToSection('#how-it-works');
  };

  return (
    <section className="lp-hero" id="hero" aria-label="Giới thiệu EzEdu AI">
      {/* Decorative background blobs — aria-hidden */}
      <div className="lp-hero-blob lp-hero-blob-1" aria-hidden="true" />
      <div className="lp-hero-blob lp-hero-blob-2" aria-hidden="true" />
      <div className="lp-hero-blob lp-hero-blob-3" aria-hidden="true" />

      <div className="lp-hero-stickers" aria-hidden="true">
        {heroStickers.map(({ src, label, className }) => (
          <div className={`lp-hero-sticker ${className}`} key={label}>
            <img className="lp-sticker-img" src={src} alt="" draggable={false} />
          </div>
        ))}
      </div>

      <div className="lp-hero-inner">

        {/* ── Tiêu đề chính ──────────────────────────────────────────── */}
        <h1 className="lp-hero-title">
          {content?.title || 'Xử lý học liệu điện tử'}{' '}
          <span className="lp-hero-title-highlight">{content?.highlight || 'thành đề thi miễn phí'}</span>
        </h1>

        {/* ── Mô tả ──────────────────────────────────────────────────── */}
        <p className="lp-hero-desc">
          {content?.description || 'Tải lên PDF, Word, PowerPoint hoặc video từ máy tính. EzEdu AI tự động trích xuất nội dung, phân tích chủ đề, kiểm tra kiến thức và tạo câu hỏi kèm đáp án, lời giải thích và mức độ khó.'}
        </p>

        {/* ── Hai nút CTA ────────────────────────────────────────────── */}
        <div className="lp-hero-cta" role="group" aria-label="Hành động chính">
          {/* Nút 1: Bắt đầu tạo đề */}
          <button
            className="lp-btn-hero-primary"
            onClick={() => {
              if (hasToken) navigate('/documents');
              else navigate('/register');
            }}
            aria-label={hasToken ? 'Đi tới trang tải học liệu' : 'Đăng ký để bắt đầu tạo đề'}
          >
            <Sparkles size={18} strokeWidth={2} aria-hidden="true" />
            {content?.primary_cta_label || 'Bắt đầu tạo đề'}
          </button>

          {/* Nút 2: Xem cách hoạt động */}
          <button
            className="lp-btn-hero-secondary"
            onClick={scrollToSteps}
            aria-label="Xem hướng dẫn cách hoạt động"
          >
            <PlayCircle size={18} strokeWidth={1.8} aria-hidden="true" />
            {content?.secondary_cta_label || 'Xem cách hoạt động'}
          </button>
        </div>

        {/* ── Upload Widget ──────────────────────────────────────────── */}
        {(content?.upload_enabled ?? true) && <div className="lp-hero-upload-wrap">
          <UploadWidget hasToken={hasToken} />
        </div>}

        {/* ── Pipeline Illustration ──────────────────────────────────── */}
        {content?.sticker_image_url ? (
          <img className="lp-hero-custom-sticker" src={content.sticker_image_url} alt="" />
        ) : (
          <HeroIllustration />
        )}

        {/* ── Feature chips ──────────────────────────────────────────── */}
        <div className="lp-hero-chips" role="list" aria-label="Định dạng hỗ trợ và tính năng">
          {(content?.chips?.length ? content.chips : heroFeatureChips.map((item) => item.label)).map((label, index) => {
            const Icon = heroFeatureChips[index % heroFeatureChips.length].Icon;
            return (
            <span className="lp-chip" role="listitem" key={label}>
              <Icon size={13} strokeWidth={2} aria-hidden="true" />
              {label}
            </span>
            );
          })}
        </div>

      </div>
    </section>
  );
}
