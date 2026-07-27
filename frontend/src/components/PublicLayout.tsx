/**
 * PublicLayout
 *
 * Layout dùng cho tất cả trang công khai (không cần đăng nhập):
 *   - / (LandingPage — có header/footer riêng, không dùng layout này)
 *   - /login
 *   - /register
 *
 * Cung cấp:
 *   - Mini header với logo EzEdu AI (trỏ về /)
 *   - <main> bao quanh content
 *   - Footer tối giản
 *
 * KHÔNG bao gồm sidebar.
 * Sidebar chỉ xuất hiện trong AppLayout (authenticated area).
 */
import { useNavigate } from 'react-router-dom';
import './PublicLayout.css';

interface PublicLayoutProps {
  children: React.ReactNode;
}

const authStickers = [
  { src: '/images/stickers/graduation-learning.png', className: 'pub-sticker-graduation' },
  { src: '/images/stickers/idea-learning.png', className: 'pub-sticker-idea' },
  { src: '/images/stickers/notes-learning.png', className: 'pub-sticker-notes' },
  { src: '/images/stickers/research-learning.png', className: 'pub-sticker-research' },
];

export default function PublicLayout({ children }: PublicLayoutProps) {
  const navigate = useNavigate();

  return (
    <div className="pub-layout">
      {/* ── Mini header ─────────────────────────────────────────────── */}
      <header className="pub-header" role="banner">
        <button
          type="button"
          className="pub-logo"
          onClick={() => navigate('/')}
          aria-label="Về trang chủ EzEdu AI"
        >
          <span className="pub-logo-mark" translate="no">Ez</span>
          <span className="pub-logo-text" translate="no">EzEdu AI</span>
        </button>

        <nav className="pub-header-nav" aria-label="Điều hướng xác thực">
          <button
            type="button"
            className="pub-nav-link"
            onClick={() => navigate('/login')}
          >
            Đăng nhập
          </button>
          <button
            type="button"
            className="pub-nav-cta"
            onClick={() => navigate('/register')}
          >
            Đăng ký miễn phí
          </button>
        </nav>
      </header>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <main className="pub-main" id="pub-main-content">
        <div className="pub-blob pub-blob-1" aria-hidden="true" />
        <div className="pub-blob pub-blob-2" aria-hidden="true" />
        <div className="pub-blob pub-blob-3" aria-hidden="true" />

        <div className="pub-stickers" aria-hidden="true">
          {authStickers.map(({ src, className }) => (
            <div className={`pub-sticker ${className}`} key={className}>
              <img className="pub-sticker-img" src={src} alt="" draggable={false} />
            </div>
          ))}
        </div>

        <div className="pub-card-wrap">{children}</div>
      </main>

      {/* ── Footer tối giản ─────────────────────────────────────────── */}
      <footer className="pub-footer" role="contentinfo">
        <p className="pub-footer-copy">
          © 2026 <span translate="no">EzEdu AI</span>
          {' '}· Biến học liệu thành đề thi dễ dàng
        </p>
        <button
          type="button"
          className="pub-footer-home"
          onClick={() => navigate('/')}
        >
          ← Về trang chủ
        </button>
      </footer>
    </div>
  );
}
