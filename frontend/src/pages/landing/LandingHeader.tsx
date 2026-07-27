/**
 * LandingHeader
 *
 * Pill-shaped sticky header với:
 * - Khoảng cách mép trên và hai bên
 * - Nền trắng hơi trong suốt + backdrop blur
 * - Logo EzEdu AI (icon tài liệu + tia sáng + chữ "EzEdu" + badge "AI")
 * - Nav giữa: 5 anchor link smooth-scroll
 * - Phải: Đăng nhập + Bắt đầu miễn phí (auth-aware)
 * - Mobile: Hamburger + drawer (Escape key, click outside, ARIA)
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Menu } from 'lucide-react';
import { scrollToSection } from './scroll';
import { BrandLogo } from './shared';
import type { HeaderContent, SiteIdentityContent, WebsiteMenuItem } from '../../types/websiteContent';

// ─── Nav items ─────────────────────────────────────────────────────────────────
const NAV_ITEMS: WebsiteMenuItem[] = [
  { label: 'Tính năng',          href: '#tinh-nang', order: 1, visible: true },
  { label: 'Cách hoạt động',     href: '#how-it-works', order: 2, visible: true },
  { label: 'Sơ đồ xử lý',       href: '#workflow', order: 3, visible: true },
  { label: 'Vì sao chọn EzEdu', href: '#benefits', order: 4, visible: true },
];

// ─── Props ─────────────────────────────────────────────────────────────────────
interface LandingHeaderProps {
  hasToken: boolean;
  content?: HeaderContent;
  identity?: SiteIdentityContent;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function LandingHeader({ hasToken, content, identity }: LandingHeaderProps) {
  const navigate = useNavigate();
  const [scrolled, setScrolled]   = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileNavRef = useRef<HTMLDivElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  // ── Scroll detection ──────────────────────────────────────────────────────
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // ── Escape key & click outside ────────────────────────────────────────────
  useEffect(() => {
    if (!mobileOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileOpen(false);
        hamburgerRef.current?.focus();
      }
    };

    const onClickOutside = (e: MouseEvent) => {
      if (
        mobileNavRef.current &&
        !mobileNavRef.current.contains(e.target as Node) &&
        hamburgerRef.current &&
        !hamburgerRef.current.contains(e.target as Node)
      ) {
        setMobileOpen(false);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [mobileOpen]);

  // ── Smooth scroll helper ──────────────────────────────────────────────────
  const smoothScrollTo = (href: string) => {
    setMobileOpen(false);
    scrollToSection(href);
  };

  // ── Right-side buttons (auth-aware) ──────────────────────────────────────
  const navItems = (content?.menu?.length ? content.menu : NAV_ITEMS)
    .filter((item) => item.visible !== false)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const renderAuthButtons = (mobile = false) => {
    if (hasToken) {
      return (
        <button
          className="lp-btn-primary"
          onClick={() => { setMobileOpen(false); navigate('/documents'); }}
        >
          {content?.authenticated_cta_label || 'Tải học liệu'} →
        </button>
      );
    }
    return (
      <>
        {!mobile && (
          <button
            className="lp-btn-ghost"
            onClick={() => navigate('/login')}
          >
            {content?.login_label || 'Đăng nhập'}
          </button>
        )}
        {mobile && (
          <button
            type="button"
            className="lp-mobile-auth-link"
            onClick={() => { setMobileOpen(false); navigate('/login'); }}
          >
            {content?.login_label || 'Đăng nhập'}
          </button>
        )}
        <button
          className="lp-btn-primary"
          onClick={() => { setMobileOpen(false); navigate('/register'); }}
        >
          {content?.primary_cta_label || 'Bắt đầu miễn phí'}
        </button>
      </>
    );
  };

  return (
    <>
      {/* ── Sticky pill header ─────────────────────────────────────────────── */}
      <header className="lp-header-wrap">
        <div className={`lp-header${scrolled ? ' lp-header--scrolled' : ''}`}>

          {/* LEFT: Logo */}
          <BrandLogo
            ariaLabel={`${identity?.site_name || 'EzEdu AI'} - về trang chủ`}
            onClick={() => navigate('/')}
            logoText={identity?.logo_text}
            logoUrl={identity?.logo_url}
          />

          {/* CENTER: Desktop nav */}
          <nav className="lp-nav" aria-label="Điều hướng chính">
            <ul role="list">
              {navItems.map(item => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    onClick={e => { e.preventDefault(); smoothScrollTo(item.href); }}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* RIGHT: Action buttons + hamburger */}
          <div className="lp-header-actions">
            <div className="lp-header-cta-group">
              {renderAuthButtons()}
            </div>

            {/* Hamburger — mobile only */}
            <button
              ref={hamburgerRef}
              className="lp-hamburger"
              aria-label={mobileOpen ? 'Đóng menu' : 'Mở menu'}
              aria-expanded={mobileOpen}
              aria-controls="lp-mobile-nav"
              onClick={() => setMobileOpen(v => !v)}
            >
              {mobileOpen ? (
                <X size={20} strokeWidth={2} aria-hidden="true" />
              ) : (
                <Menu size={20} strokeWidth={2} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ── Mobile drawer ──────────────────────────────────────────────────── */}
      <div
        id="lp-mobile-nav"
        ref={mobileNavRef}
        className={`lp-mobile-nav${mobileOpen ? ' lp-mobile-nav--open' : ''}`}
        aria-hidden={!mobileOpen}
        role="dialog"
        aria-label="Menu điều hướng"
      >
        {/* Drawer header */}
        <div className="lp-mobile-nav-header">
          <span className="lp-mobile-nav-title" translate="no">{identity?.site_name || 'EzEdu AI'}</span>
          <button
            className="lp-mobile-nav-close"
            onClick={() => { setMobileOpen(false); hamburgerRef.current?.focus(); }}
            aria-label="Đóng menu"
          >
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        {/* Nav links */}
        <nav aria-label="Menu mobile">
          <ul role="list" className="lp-mobile-nav-list">
            {navItems.map(item => (
              <li key={item.href}>
                <a
                  href={item.href}
                  onClick={e => { e.preventDefault(); smoothScrollTo(item.href); }}
                  tabIndex={mobileOpen ? 0 : -1}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* Divider + auth buttons */}
        <div className="lp-mobile-divider" />
        <div className="lp-mobile-nav-actions">
          {renderAuthButtons(true)}
        </div>
      </div>

      {/* ── Backdrop overlay (mobile) ─────────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="lp-mobile-backdrop"
          aria-hidden="true"
          onClick={() => setMobileOpen(false)}
        />
      )}
    </>
  );
}
