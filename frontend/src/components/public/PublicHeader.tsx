import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Menu } from 'lucide-react';
import { Button, Drawer } from '../ui';
import { useAuth } from '../../hooks/useAuth';
import type { HeaderContent, SiteIdentityContent } from '../../types/websiteContent';

interface PublicHeaderProps {
  content?: HeaderContent;
  identity?: SiteIdentityContent;
}

const DEFAULT_NAV_MENU = [
  { label: 'Trang chủ', target: '/' },
  { label: 'Giới thiệu', target: '#gioi-thieu' },
  { label: 'Tính năng', target: '#tinh-nang' },
  { label: 'Dành cho học sinh', target: '#hoc-sinh' },
  { label: 'Dành cho giảng viên', target: '#giang-vien' },
  { label: 'AI Education', target: '#ai-education' },
  { label: 'Hướng dẫn', target: '#huong-dan' },
];

export default function PublicHeader({ identity }: PublicHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { status, homePath } = useAuth();
  const signedIn = status === 'authenticated';

  const menu = DEFAULT_NAV_MENU;

  const brand = (
    <Link to="/" className="ezp-brand">
      <span className="ezp-brand-mark" aria-hidden="true" translate="no">
        {identity?.logo_text?.slice(0, 2) || 'Ez'}
      </span>
      <span className="ezp-brand-name">{identity?.site_name || 'EzEdu AI'}</span>
    </Link>
  );

  return (
    <header className="ezp-header">
      <div className="ezp-container ezp-header-inner">
        {brand}

        <nav className="ezp-nav" aria-label="Điều hướng chính">
          {menu.map((item) =>
            item.target.startsWith('#') ? (
              <a key={item.label} href={item.target} className="ezp-nav-link">
                {item.label}
              </a>
            ) : (
              <Link key={item.label} to={item.target} className="ezp-nav-link">
                {item.label}
              </Link>
            )
          )}
        </nav>

        <div className="ezp-header-actions">
          {signedIn ? (
            <Link to={homePath}>
              <Button>Đăng nhập</Button>
            </Link>
          ) : (
            <>
              <Link to="/login" className="ezp-nav-link" style={{ fontWeight: 600 }}>
                Đăng nhập
              </Link>
              <Link to="/register">
                <Button>Đăng ký ngay</Button>
              </Link>
            </>
          )}
        </div>

        <div className="ezp-header-burger">
          <Button
            variant="ghost"
            iconOnly
            aria-label="Mở menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <Menu size={20} aria-hidden="true" />
          </Button>
        </div>
      </div>

      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} side="right" title="Menu EzEdu AI">
        <nav className="ezp-mobile-nav" aria-label="Điều hướng mobile">
          {menu.map((item) =>
            item.target.startsWith('#') ? (
              <a
                key={item.label}
                href={item.target}
                className="ezp-mobile-link"
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
                <ChevronRight size={18} aria-hidden="true" />
              </a>
            ) : (
              <Link
                key={item.label}
                to={item.target}
                className="ezp-mobile-link"
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
                <ChevronRight size={18} aria-hidden="true" />
              </Link>
            )
          )}
        </nav>

        <div className="ez-stack" style={{ marginTop: 'var(--ez-space-6)', gap: '0.75rem' }}>
          {signedIn ? (
            <Link to={homePath} onClick={() => setMenuOpen(false)}>
              <Button block>Đăng nhập</Button>
            </Link>
          ) : (
            <>
              <Link to="/register" onClick={() => setMenuOpen(false)}>
                <Button block>Đăng ký ngay</Button>
              </Link>
              <Link to="/login" onClick={() => setMenuOpen(false)}>
                <Button block variant="outline">
                  Đăng nhập
                </Button>
              </Link>
            </>
          )}
        </div>
      </Drawer>
    </header>
  );
}
