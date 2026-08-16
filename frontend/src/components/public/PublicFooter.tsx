import { Link } from 'react-router-dom';
import type { FooterContent, SiteIdentityContent } from '../../types/websiteContent';

interface PublicFooterProps {
  content: FooterContent;
  identity: SiteIdentityContent;
}

interface FooterGroup {
  /** Khoá ổn định, không lấy từ tiêu đề vì tiêu đề có thể do CMS đặt và bị trùng. */
  id: string;
  title: string;
  links: Array<{ label: string; to: string; external?: boolean }>;
}

/**
 * Footer 5 nhóm theo yêu cầu: Sản phẩm · Tài nguyên · Hỗ trợ · Pháp lý · Liên hệ.
 *
 * Mọi liên kết đều dẫn tới route đang hoạt động hoặc mailto thật — không có
 * link chết. Nhóm Pháp lý lấy từ CMS nếu admin đã cấu hình.
 */
export default function PublicFooter({ content, identity }: PublicFooterProps) {
  const email = content.email || 'lienhe@ezedu.ai';

  const policies = (content.policies ?? []).filter((item) => item.visible !== false);

  const groups: FooterGroup[] = [
    {
      id: 'product',
      title: 'Sản phẩm',
      links: [
        { label: 'Cách hoạt động', to: '/how-it-works' },
        { label: 'Tính năng', to: '/features' },
        { label: 'Dành cho học sinh', to: '/features#hoc-sinh' },
        { label: 'Dành cho giáo viên', to: '/features#giao-vien' },
      ],
    },
    {
      id: 'resources',
      title: 'Tài nguyên',
      links: [
        { label: 'Câu hỏi thường gặp', to: '/faq' },
        { label: 'Bắt đầu sử dụng', to: '/register' },
      ],
    },
    {
      id: 'support',
      title: 'Hỗ trợ',
      links: [
        {
          label: 'Liên hệ hỗ trợ',
          to: `mailto:${email}?subject=${encodeURIComponent('Hỗ trợ EzEdu AI')}`,
          external: true,
        },
        {
          label: 'Báo lỗi',
          to: `mailto:${email}?subject=${encodeURIComponent('Báo lỗi EzEdu AI')}`,
          external: true,
        },
      ],
    },
    {
      id: 'legal',
      title: 'Pháp lý',
      links:
        policies.length > 0
          // CMS chứa được cả liên kết ngoài lẫn đường dẫn nội bộ: đường dẫn bắt
          // đầu bằng '/' phải đi qua router, không tải lại cả trang.
          ? policies.map((item) => ({
              label: item.label,
              to: item.href,
              external: !item.href.startsWith('/'),
            }))
          : [
              { label: 'Điều khoản sử dụng', to: '/faq#dieu-khoan' },
              { label: 'Chính sách quyền riêng tư', to: '/chinh-sach-du-lieu' },
            ],
    },
    {
      id: 'contact',
      // CMS có thể đặt contact_label trùng với một nhóm phía trên (thực tế đang
      // là "Hỗ trợ"), nên chỉ dùng nhãn CMS khi nó không gây trùng tiêu đề.
      title: 'Liên hệ',
      links: [{ label: email, to: `mailto:${email}`, external: true }],
    },
  ];

  return (
    <footer className="ezp-footer">
      <div className="ezp-container">
        <div className="ezp-footer-grid">
          <div className="ezp-footer-about">
            <Link to="/" className="ezp-brand">
              <span className="ezp-brand-mark" aria-hidden="true" translate="no">
                {identity.logo_text?.slice(0, 2) || 'Ez'}
              </span>
              <span className="ezp-brand-name">{identity.site_name || 'EzEdu AI'}</span>
            </Link>
            <p className="ezp-footer-slogan">
              {identity.slogan ||
                'Xử lý học liệu điện tử thành nội dung học tập và đề luyện tập bằng AI.'}
            </p>
          </div>

          {groups.map((group) => (
            <nav key={group.id} aria-label={group.title}>
              <h2 className="ezp-footer-group-title">{group.title}</h2>
              <ul className="ezp-footer-list">
                {group.links.map((link, index) => (
                  <li key={`${group.id}-${index}-${link.label}`}>
                    {link.external ? (
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
            {content.copyright || `© ${new Date().getFullYear()} EzEdu AI`}
          </p>
          {/* Khuyến cáo bắt buộc: nội dung do AI tạo cần được kiểm chứng */}
          <p className="ezp-footer-disclaimer">
            Nội dung do AI tạo ra có thể chưa chính xác. Hãy đối chiếu với học liệu gốc trước
            khi dùng cho việc dạy, học hoặc kiểm tra chính thức.
          </p>
        </div>
      </div>
    </footer>
  );
}
