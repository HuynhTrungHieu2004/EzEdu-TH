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
import { ArrowLeft } from 'lucide-react';

interface PublicLayoutProps {
  children: React.ReactNode;
}

export default function PublicLayout({ children }: PublicLayoutProps) {
  const navigate = useNavigate();

  return (
    <div className="pub-layout">
      <a href="#pub-main-content" className="ez-skip-link">
        Bỏ qua tới nội dung chính
      </a>

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
      <main className="pub-main" id="pub-main-content" tabIndex={-1}>
        <div className="pub-blob pub-blob-1" aria-hidden="true" />
        <div className="pub-blob pub-blob-2" aria-hidden="true" />
        <div className="pub-blob pub-blob-3" aria-hidden="true" />

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
          <ArrowLeft size={16} aria-hidden="true" />
          Về trang chủ
        </button>
      </footer>
    </div>
  );
}
