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
