/**
 * LandingPage — Entry point
 *
 * Cấu trúc file:
 *   landing/index.tsx          ← file này (logic chính + ghép sections)
 *   landing/LandingHeader.tsx  ← header pill cố định
 *   landing/HeroSection.tsx    ← hero + upload entry point
 *   landing/UploadSection.tsx  ← upload CTA zone
 *   landing/StepsSection.tsx   ← 4 bước sử dụng
 *   landing/DiagramSection.tsx ← sơ đồ nghiệp vụ pipeline
 *   landing/DemoSection.tsx    ← browser chrome mockup
 *   landing/WhySection.tsx     ← 6 lý do chọn EzEdu
 *   landing/CtaSection.tsx     ← CTA cuối trang
 *   landing/LandingFooter.tsx  ← footer + brand giant text
 *   landing/landing.css        ← design system riêng cho landing
 */
import { useEffect, useMemo, useState } from 'react';
import LandingHeader   from './LandingHeader';
import HeroSection     from './HeroSection';
import FormatsBar      from './FormatsBar';
import UploadSection   from './UploadSection';
import StepsSection    from './StepsSection';
import DiagramSection  from './DiagramSection';
import DemoSection     from './DemoSection';
import WhySection      from './WhySection';
import CtaSection      from './CtaSection';
import LandingFooter   from './LandingFooter';
import { fetchPublicWebsiteContent } from '../../api/websiteContentApi';
import type { LandingSectionItem, WebsiteContentBundle } from '../../types/websiteContent';
import { DEFAULT_WEBSITE_CONTENT, mergeWebsiteContent } from '../../utils/websiteContentDefaults';
import './landing.css';

function OptionalCmsSection({ section }: { section: LandingSectionItem }) {
  return (
    <section className="lp-section-white" id={section.key} aria-labelledby={`${section.key}-heading`}>
      <div className="lp-container">
        <div className="lp-section-head">
          <p className="lp-section-eyebrow">{section.eyebrow}</p>
          <h2 className="lp-section-title" id={`${section.key}-heading`}>{section.title}</h2>
          <p className="lp-section-desc">{section.description}</p>
        </div>
      </div>
    </section>
  );
}

export default function LandingPage() {
  const hasToken = !!localStorage.getItem('access_token');
  const [content, setContent] = useState<WebsiteContentBundle>(DEFAULT_WEBSITE_CONTENT);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchPublicWebsiteContent(ctrl.signal)
      .then((data) => {
        const sections = Object.fromEntries(data.items.map((item) => [item.section_key, item.content]));
        setContent(mergeWebsiteContent(sections));
      })
      .catch(() => {
        setContent(DEFAULT_WEBSITE_CONTENT);
      });
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    document.title = content.site_identity.site_name || 'EzEdu AI';
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    meta.content = content.site_identity.slogan || DEFAULT_WEBSITE_CONTENT.site_identity.slogan;
    const faviconUrl = content.site_identity.favicon_url || DEFAULT_WEBSITE_CONTENT.site_identity.favicon_url;
    if (faviconUrl) {
      let favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (!favicon) {
        favicon = document.createElement('link');
        favicon.rel = 'icon';
        document.head.appendChild(favicon);
      }
      favicon.href = faviconUrl;
    }
  }, [content.site_identity.site_name, content.site_identity.slogan, content.site_identity.favicon_url]);

  const sectionItems = useMemo(
    () => [...(content.sections.items || [])]
      .filter((item) => item.enabled !== false)
      .sort((a, b) => (a.order || 0) - (b.order || 0)),
    [content.sections.items],
  );

  const sectionByKey = useMemo(() => {
    return Object.fromEntries((content.sections.items || []).map((item) => [item.key, item]));
  }, [content.sections.items]);

  const renderCmsSection = (item: LandingSectionItem) => {
    switch (item.key) {
      case 'features':
        return <DemoSection key={item.key} content={item} />;
      case 'how_it_works':
        return <StepsSection key={item.key} content={item} />;
      case 'workflow':
        return <DiagramSection key={item.key} content={item} />;
      case 'benefits':
        return <WhySection key={item.key} content={item} cmsBenefits={content.sections.benefits} />;
      case 'testimonials':
      case 'faq':
        return <OptionalCmsSection key={item.key} section={item} />;
      default:
        return null;
    }
  };

  return (
    <div className="lp-root">
      {/* Skip-to-content cho accessibility */}
      <a href="#main-content" className="lp-skip-link">
        Bỏ qua điều hướng
      </a>

      <LandingHeader hasToken={hasToken} content={content.header} identity={content.site_identity} />
      <main id="main-content">
        <HeroSection hasToken={hasToken} content={content.hero} />
        <FormatsBar />
        {(content.hero.upload_enabled ?? true) && <UploadSection hasToken={hasToken} />}
        {sectionItems.map(renderCmsSection)}
        {!sectionByKey.features && <DemoSection />}
        {!sectionByKey.how_it_works && <StepsSection />}
        {!sectionByKey.workflow && <DiagramSection />}
        {!sectionByKey.benefits && <WhySection />}
        <CtaSection hasToken={hasToken} />
      </main>
      <LandingFooter content={content.footer} identity={content.site_identity} />
    </div>
  );
}
