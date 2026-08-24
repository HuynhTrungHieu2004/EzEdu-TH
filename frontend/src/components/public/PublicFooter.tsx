import { Link } from 'react-router-dom';
import type { FooterContent, SiteIdentityContent } from '../../types/websiteContent';

interface PublicFooterProps {
  content?: FooterContent;
  identity?: SiteIdentityContent;
}

interface FooterGroup {
  id: string;
  title: string;
  links: Array<{ label: string; to: string; isAnchor?: boolean }>;
}

export default function PublicFooter({ identity }: PublicFooterProps) {
  const email = 'lienhe@ezedu.vn';

  const groups: FooterGroup[] = [
    {
      id: 'platform',
      title: 'Nền tảng',
      links: [
        { label: 'Trang chủ', to: '/', isAnchor: false },
        { label: 'Giới thiệu', to: '#gioi-thieu', isAnchor: true },
        { label: 'Tính năng', to: '#tinh-nang', isAnchor: true },
        { label: 'Hướng dẫn', to: '#huong-dan', isAnchor: true },
      ],
    },
    {
      id: 'learning',
      title: 'Học tập',
      links: [
        { label: 'Dành cho học sinh', to: '#hoc-sinh', isAnchor: true },
        { label: 'Dành cho giảng viên', to: '#giang-vien', isAnchor: true },
        { label: 'AI Education', to: '#ai-education', isAnchor: true },
        { label: 'Lộ trình cá nhân', to: '#tinh-nang', isAnchor: true },
      ],
    },
    {
      id: 'support',
      title: 'Hỗ trợ',
      links: [
        { label: 'Trung tâm trợ giúp', to: '#faq', isAnchor: true },
        { label: 'Câu hỏi thường gặp', to: '#faq', isAnchor: true },
        { label: 'Liên hệ hỗ trợ', to: `mailto:${email}`, isAnchor: false },
        { label: 'Điều khoản & Chính sách', to: '#faq', isAnchor: true },
      ],
    },
  ];

  return (
    <footer className="ezp-footer">
      <div className="ezp-container">
        <div className="ezp-footer-grid">
          <div className="ezp-footer-about">
            <Link to="/" className="ezp-brand">
              <img className="ezp-brand-mark" src={identity?.logo_url || '/logo-mark.png'} alt="" />
              <span className="ezp-brand-name">{identity?.site_name || 'EzEdu AI'}</span>
            </Link>
            <p className="ezp-footer-slogan">
              Nền tảng học tập thông minh ứng dụng trí tuệ nhân tạo dành cho Học sinh và Giảng viên. 
              Tự động hóa sinh đề, chấm bài và cá nhân hóa lộ trình học.
            </p>
          </div>

          {groups.map((group) => (
            <nav key={group.id} aria-label={group.title}>
              <h2 className="ezp-footer-group-title">{group.title}</h2>
              <ul className="ezp-footer-list">
                {group.links.map((link, index) => (
                  <li key={`${group.id}-${index}-${link.label}`}>
                    {link.isAnchor ? (
                      <a className="ezp-footer-link" href={link.to}>
                        {link.label}
                      </a>
                    ) : link.to.startsWith('mailto:') ? (
                      <a className="ezp-footer-link" href={link.to}>
                        {link.label}
                      </a>
                    ) : (
                      <Link className="ezp-footer-link" to={link.to}>
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="ezp-footer-bottom">
          <p className="ezp-footer-copy">
            © {new Date().getFullYear()} EzEdu AI. Tất cả quyền được bảo lưu.
          </p>
          <p className="ezp-footer-disclaimer">
            EzEdu AI – Giải pháp EdTech thông minh hỗ trợ chuyển đổi số trong giáo dục và khảo thí.
          </p>
        </div>
      </div>
    </footer>
  );
}
