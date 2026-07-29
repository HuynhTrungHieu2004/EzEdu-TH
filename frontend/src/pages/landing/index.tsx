/**
 * LandingPage — trang chủ public
 *
 * Nội dung vẫn lấy từ CMS (`GET /api/v1/website-content`) và hợp nhất với bộ
 * mặc định, nên trang quản trị Website CMS tiếp tục hoạt động không đổi. Phần
 * bố cục và thị giác được dựng lại bằng design system trong `styles/tokens.css`.
 *
 * Thứ tự section: Hero -> Công cụ chính -> Ví dụ -> Cách hoạt động -> Vì sao ->
 * Tính năng theo vai trò -> Chất lượng & tin cậy -> FAQ -> CTA cuối.
 */
import { useEffect, useState } from 'react';
import AnnouncementBar from '../../components/public/AnnouncementBar';
import PublicHeader from '../../components/public/PublicHeader';
import PublicFooter from '../../components/public/PublicFooter';
import {
  BuiltForLearning,
  Faq,
  FeaturesByRole,
  FinalCta,
  Hero,
  HowItWorks,
  IntegrationsTeaser,
  PrimaryTool,
  QuickExamples,
  StatsBlock,
  StudentToolsShowcase,
  TeacherToolsShowcase,
  TestimonialBlock,
  TrustBlock,
  WhyEzEdu,
} from '../../components/public/LandingSections';
import { fetchPublicWebsiteContent } from '../../api/websiteContentApi';
import type { WebsiteContentBundle } from '../../types/websiteContent';
import { DEFAULT_WEBSITE_CONTENT, mergeWebsiteContent } from '../../utils/websiteContentDefaults';
import '../../components/public/public-page.css';

export default function LandingPage() {
  const [content, setContent] = useState<WebsiteContentBundle>(DEFAULT_WEBSITE_CONTENT);

  // Nội dung mặc định hiện ngay, CMS ghi đè khi tải xong. Lỗi mạng không làm
  // trắng trang và không hiện thông báo kỹ thuật cho khách.
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

  useEffect(() => {
    const identity = content.site_identity;
    document.title = identity.site_name
      ? `${identity.site_name} — Xử lý học liệu thành đề luyện tập bằng AI`
      : 'EzEdu AI';

    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    meta.content = identity.slogan || DEFAULT_WEBSITE_CONTENT.site_identity.slogan;

    const faviconUrl = identity.favicon_url || DEFAULT_WEBSITE_CONTENT.site_identity.favicon_url;
    if (faviconUrl) {
      let favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (!favicon) {
        favicon = document.createElement('link');
        favicon.rel = 'icon';
        document.head.appendChild(favicon);
      }
      favicon.href = faviconUrl;
    }
  }, [content.site_identity]);

  const uploadEnabled = content.hero.upload_enabled ?? true;

  return (
    <div className="ezp-root">
      <a href="#main" className="ez-skip-link">
        Bỏ qua tới nội dung chính
      </a>

      <AnnouncementBar message={null} />
      <PublicHeader content={content.header} identity={content.site_identity} />

      <main id="main" className="ezp-main" tabIndex={-1}>
        <Hero content={content.hero} />
        <BuiltForLearning />
        {uploadEnabled && <PrimaryTool />}
        <QuickExamples />
        <HowItWorks />
        <WhyEzEdu />
        <FeaturesByRole />
        <TeacherToolsShowcase />
        <StudentToolsShowcase />
        <StatsBlock />
        <TestimonialBlock />
        <IntegrationsTeaser />
        <TrustBlock />
        <Faq />
        <FinalCta />
      </main>

      <PublicFooter content={content.footer} identity={content.site_identity} />
    </div>
  );
}
