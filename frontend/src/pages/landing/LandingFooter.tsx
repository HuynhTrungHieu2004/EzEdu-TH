import { useNavigate } from 'react-router-dom';
import { scrollToSection } from './scroll';
import { BrandLogo } from './shared';
import type { FooterContent, SiteIdentityContent } from '../../types/websiteContent';

type FooterAction =
  | { label: string; type: 'scroll'; target: string }
  | { label: string; type: 'route'; target: string };

interface FooterColumn {
  title?: string;
  actions: FooterAction[];
}

const footerColumns: FooterColumn[] = [
  {
    actions: [
      { label: 'Giới thiệu EzEdu AI', type: 'scroll', target: '#hero' },
      { label: 'Cách hoạt động', type: 'scroll', target: '#how-it-works' },
    ],
  },
  {
    title: 'Tính năng',
    actions: [
      { label: 'Quản lý học liệu', type: 'route', target: '/documents' },
      { label: 'Sinh câu hỏi', type: 'route', target: '/generate' },
      { label: 'Hỏi đáp AI', type: 'route', target: '/chat-advanced' },
      { label: 'Lịch sử sinh đề', type: 'route', target: '/question-history' },
    ],
  },
  {
    title: 'Hỗ trợ',
    actions: [
      { label: 'Hướng dẫn sử dụng', type: 'scroll', target: '#how-it-works' },
    ],
  },
  {
    title: 'Tài khoản',
    actions: [
      { label: 'Đăng nhập', type: 'route', target: '/login' },
      { label: 'Đăng ký', type: 'route', target: '/register' },
    ],
  },
];

export default function LandingFooter({ content, identity }: { content?: FooterContent; identity?: SiteIdentityContent }) {
  const navigate = useNavigate();

  const runAction = (action: Exclude<FooterAction, { type: 'static' }>) => {
    if (action.type === 'scroll') {
      scrollToSection(action.target);
      return;
    }
    navigate(action.target);
  };

  return (
    <footer className="lp-footer">
      <div className="lp-footer-inner">
        <div className="lp-footer-top">
          {footerColumns.map((column, columnIndex) => (
            <div key={column.title ?? 'EzEdu AI'}>
              {columnIndex === 0 ? (
                <>
                  <BrandLogo
                    ariaLabel={`${identity?.site_name || 'EzEdu AI'} - về trang chủ`}
                    onClick={() => navigate('/')}
                    logoText={identity?.logo_text}
                    logoUrl={identity?.logo_url}
                  />
                  <p className="lp-footer-brand-tagline">{identity?.slogan || 'Biến học liệu thành đề thi dễ dàng'}</p>
                </>
              ) : (
                <p className="lp-footer-col-title">{column.title}</p>
              )}
              <ul className="lp-footer-links">
                {column.actions.map(action => (
                  <li key={action.label}>
                    <button type="button" onClick={() => runAction(action)}>
                      {action.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="lp-footer-bottom">
          <p className="lp-footer-copy">{content?.copyright || '© 2026 EzEdu AI. Biến học liệu thành đề thi dễ dàng.'}</p>
          {content?.email && <p className="lp-footer-copy">{content.contact_label || 'Hỗ trợ'}: {content.email}</p>}
        </div>
      </div>

      <div className="lp-footer-brand-giant" aria-hidden="true">
        <span className="lp-footer-brand-giant-text" translate="no">
          <span className="lp-footer-brand-ez">{(identity?.logo_text || 'EzEdu AI').split(/\s+/)[0]}</span>
          <span className="lp-footer-brand-edu"></span>
          <span className="lp-footer-brand-ai">{(identity?.logo_text || 'EzEdu AI').split(/\s+/)[1] || 'AI'}</span>
        </span>
      </div>
    </footer>
  );
}
