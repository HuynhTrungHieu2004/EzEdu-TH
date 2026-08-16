import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Menu } from 'lucide-react';
import { Button, Drawer } from '../ui';
import { useAuth } from '../../hooks/useAuth';
import type { HeaderContent, SiteIdentityContent } from '../../types/websiteContent';
import { BrandMark } from '../BrandMark';

interface PublicHeaderProps {
  content: HeaderContent;
  identity: SiteIdentityContent;
}

/** Giữ header gọn: tối đa 3 mục. */
const MAX_MENU_ITEMS = 3;

/**
 * Menu trong CMS được cấu hình cho bố cục cũ, trỏ tới các anchor như
 * `#workflow`, `#benefits` — những section không còn tồn tại sau khi thiết kế
 * lại. Bảng này ánh xạ chúng sang trang thật để không còn link chết.
 */
const LEGACY_TARGETS: Record<string, string> = {
  '#tinh-nang': '/features',
  '#features': '/features',
  '#benefits': '/features',
  '#how-it-works': '/how-it-works',
  '#cach-hoat-dong': '/how-it-works',
  '#workflow': '/how-it-works',
  '#faq': '/faq',
};

const FALLBACK_MENU = [
  { label: 'Cách hoạt động', target: '/how-it-works' },
  { label: 'Tính năng', target: '/features' },
  { label: 'Câu hỏi thường gặp', target: '/faq' },
];

function resolveMenu(content: HeaderContent): Array<{ label: string; target: string }> {
  const resolved = [...(content.menu ?? [])]
    .filter((item) => item.visible !== false)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((item) => {
      const href = (item.href || '').trim();
      const target = LEGACY_TARGETS[href] ?? href;
      return { label: item.label, target };
    })
    // Bỏ mục trỏ tới anchor không còn tồn tại thay vì để người dùng bấm vào chỗ trống.
    .filter((item) => item.target.startsWith('/') || item.target.startsWith('http'));

  // Nhiều mục CMS có thể ánh xạ về cùng một trang — chỉ giữ mục đầu tiên.
  const seen = new Set<string>();
  const unique = resolved.filter((item) => {
    if (seen.has(item.target)) return false;
    seen.add(item.target);
    return true;
  });

  // Nhiều mục CMS có thể gộp về cùng một trang, làm menu bị thiếu. Bổ sung các
  // trang chuẩn còn thiếu để header luôn có đủ ba đích quan trọng.
  for (const item of FALLBACK_MENU) {
    if (unique.length >= MAX_MENU_ITEMS) break;
    if (!seen.has(item.target)) {
      seen.add(item.target);
      unique.push(item);
    }
  }

  return unique.slice(0, MAX_MENU_ITEMS);
}

export default function PublicHeader({ content, identity }: PublicHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { status, homePath } = useAuth();
  const signedIn = status === 'authenticated';

  const menu = resolveMenu(content);

  const brand = (
    <Link to="/" className="ezp-brand">
      <BrandMark size={34} />
      <span className="ezp-brand-name">{identity.site_name || 'EzEdu AI'}</span>
    </Link>
  );

  return (
    <header className="ezp-header">
      <div className="ezp-container ezp-header-inner">
        {brand}

        <nav className="ezp-nav" aria-label="Điều hướng chính">
          {menu.map((item) => (
            <Link key={item.target} to={item.target} className="ezp-nav-link">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ezp-header-actions">
          {signedIn ? (
            <Link to={homePath}>
              <Button>{content.authenticated_cta_label || 'Vào khu vực của tôi'}</Button>
            </Link>
          ) : (
            <>
              <Link to="/login" className="ezp-nav-link">
                {content.login_label || 'Đăng nhập'}
              </Link>
              <Link to="/register">
                <Button>{content.primary_cta_label || 'Bắt đầu miễn phí'}</Button>
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

      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} side="right" title="Menu">
        <nav className="ezp-mobile-nav" aria-label="Điều hướng chính">
          {menu.map((item) => (
            <Link
              key={item.target}
              to={item.target}
              className="ezp-mobile-link"
              onClick={() => setMenuOpen(false)}
            >
              {item.label}
              <ChevronRight size={18} aria-hidden="true" />
            </Link>
          ))}
        </nav>

        <div className="ez-stack" style={{ marginTop: 'var(--ez-space-6)' }}>
          {signedIn ? (
            <Link to={homePath} onClick={() => setMenuOpen(false)}>
              <Button block>{content.authenticated_cta_label || 'Vào khu vực của tôi'}</Button>
            </Link>
          ) : (
            <>
              <Link to="/register" onClick={() => setMenuOpen(false)}>
                <Button block>{content.primary_cta_label || 'Bắt đầu miễn phí'}</Button>
              </Link>
              <Link to="/login" onClick={() => setMenuOpen(false)}>
                <Button block variant="outline">
                  {content.login_label || 'Đăng nhập'}
                </Button>
              </Link>
            </>
          )}
        </div>
      </Drawer>
    </header>
  );
}
