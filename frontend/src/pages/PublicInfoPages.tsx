/**
 * Ba trang thông tin public: Cách hoạt động · Tính năng · FAQ.
 *
 * Dùng lại đúng các section của trang chủ thay vì viết lại nội dung, nên không
 * có chuyện hai chỗ mô tả cùng một tính năng theo hai cách khác nhau. Ba trang
 * này tồn tại vì các nội dung đó cần link trực tiếp được từ footer, từ email và
 * từ trong ứng dụng — đó là progressive disclosure ở cấp sitemap.
 */
import { useEffect, useState } from 'react';
import PublicHeader from '../components/public/PublicHeader';
import PublicFooter from '../components/public/PublicFooter';
import {
  Faq,
  FeaturesByRole,
  FinalCta,
  HowItWorks,
  TrustBlock,
  WhyEzEdu,
} from '../components/public/LandingSections';
import { fetchPublicWebsiteContent } from '../api/websiteContentApi';
import type { WebsiteContentBundle } from '../types/websiteContent';
import { DEFAULT_WEBSITE_CONTENT, mergeWebsiteContent } from '../utils/websiteContentDefaults';
import type { ReactNode } from 'react';
import '../components/public/public-page.css';

/** Lấy nội dung nhận diện/header/footer từ CMS để ba trang này khớp với trang chủ. */
function useWebsiteContent(): WebsiteContentBundle {
  const [content, setContent] = useState<WebsiteContentBundle>(DEFAULT_WEBSITE_CONTENT);

  useEffect(() => {
    const controller = new AbortController();
    fetchPublicWebsiteContent(controller.signal)
      .then((data) => {
        const sections = Object.fromEntries(
          data.items.map((item) => [item.section_key, item.content]),
        );
        setContent(mergeWebsiteContent(sections));
      })
      .catch(() => {
        // Giữ nội dung mặc định.
      });
    return () => controller.abort();
  }, []);

  return content;
}

function PublicInfoShell({
  title,
  eyebrow,
  description,
  children,
}: {
  title: string;
  eyebrow: string;
  description: string;
  children: ReactNode;
}) {
  const content = useWebsiteContent();

  useEffect(() => {
    document.title = `${title} — ${content.site_identity.site_name || 'EzEdu AI'}`;
  }, [title, content.site_identity.site_name]);

  return (
    <div className="ezp-root">
      <a href="#main" className="ez-skip-link">
        Bỏ qua tới nội dung chính
      </a>

      <PublicHeader content={content.header} identity={content.site_identity} />

      <main id="main" className="ezp-main" tabIndex={-1}>
        <section className="ezp-container ezp-hero" style={{ paddingBottom: 'var(--ez-space-4)' }}>
          <div className="ezp-head">
            <span className="ezp-eyebrow">{eyebrow}</span>
            <h1 className="ezp-title" style={{ fontSize: 'var(--ez-text-h1)' }}>
              {title}
            </h1>
            <p className="ezp-lede">{description}</p>
          </div>
        </section>

        {children}
      </main>

      <PublicFooter content={content.footer} identity={content.site_identity} />
    </div>
  );
}

export function HowItWorksPage() {
  return (
    <PublicInfoShell
      eyebrow="Hướng dẫn"
      title="Cách EzEdu AI hoạt động"
      description="Từ một tài liệu hoặc video bài giảng có sẵn tới bộ câu hỏi dùng được, quy trình gồm bốn bước và bạn kiểm soát ở bước cuối."
    >
      <HowItWorks headingId="how-it-works-page-title" />
      <TrustBlock />
      <FinalCta />
    </PublicInfoShell>
  );
}

export function FeaturesPage() {
  return (
    <PublicInfoShell
      eyebrow="Tính năng"
      title="Tính năng chính"
      description="Danh sách dưới đây chỉ gồm những chức năng đang hoạt động trong hệ thống, tách theo vai trò học sinh và giáo viên."
    >
      <FeaturesByRole />
      <WhyEzEdu />
      <FinalCta />
    </PublicInfoShell>
  );
}

export function FaqPage() {
  return (
    <PublicInfoShell
      eyebrow="Hỗ trợ"
      title="Câu hỏi thường gặp"
      description="Định dạng được hỗ trợ, độ tin cậy của nội dung do AI tạo, và cách học liệu của bạn được sử dụng."
    >
      <Faq headingId="faq-page-title" />
      <FinalCta />
    </PublicInfoShell>
  );
}

const BROWSER_STORAGE = [
  { key: 'access_token', purpose: 'Giữ phiên đăng nhập trên thiết bị này.' },
  { key: 'theme-preference', purpose: 'Nhớ giao diện sáng, tối hoặc theo hệ thống.' },
  { key: 'ez-student-onboarding-draft', purpose: 'Giữ tạm hồ sơ học sinh đang khai báo dở.' },
  { key: 'ezedu_recent_tools', purpose: 'Đưa các công cụ thường dùng lên đầu danh sách.' },
  { key: 'learning-event-offline-queue', purpose: 'Giữ tạm hoạt động học khi mất mạng để gửi lại sau.' },
];

export function DataPolicyPage() {
  return (
    <PublicInfoShell
      eyebrow="Quyền riêng tư"
      title="Dữ liệu lưu trên trình duyệt"
      description="Những dữ liệu EzEdu AI lưu trên thiết bị, mục đích sử dụng và cách xóa."
    >
      <section className="ezp-container" style={{ paddingBottom: 'var(--ez-space-10)' }}>
        <h2 className="ezp-section-title">Dữ liệu cục bộ</h2>
        <div className="ez-datatable-wrap"><table className="ez-datatable"><thead><tr><th scope="col">Tên mục</th><th scope="col">Mục đích</th></tr></thead><tbody>
          {BROWSER_STORAGE.map((item) => <tr key={item.key}><td><code>{item.key}</code></td><td>{item.purpose}</td></tr>)}
        </tbody></table></div>
        <h2 className="ezp-section-title" style={{ marginTop: 'var(--ez-space-8)' }}>Dữ liệu trên máy chủ</h2>
        <p className="ezp-lede">Tài khoản, học liệu, câu hỏi, bài làm và kết quả được lưu trong hệ thống để cung cấp chức năng học tập. Xóa dữ liệu trình duyệt không xóa các dữ liệu này; hãy liên hệ quản trị viên khi cần xóa tài khoản.</p>
        <h2 className="ezp-section-title" style={{ marginTop: 'var(--ez-space-8)' }}>Cách xóa</h2>
        <p className="ezp-lede">Đăng xuất để xóa phiên đăng nhập. Bạn cũng có thể dùng chức năng xóa dữ liệu trang web trong phần cài đặt quyền riêng tư của trình duyệt.</p>
      </section>
      <FinalCta />
    </PublicInfoShell>
  );
}
