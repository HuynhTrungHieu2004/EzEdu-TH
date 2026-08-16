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
import { ChalkUnderline } from '../components/ui';
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
            <ChalkUnderline />
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

/**
 * Chính sách dữ liệu — liệt kê đúng những gì app lưu trên trình duyệt.
 *
 * Viết tay thay vì lấy từ CMS: nội dung này phải khớp với mã nguồn (bốn khoá
 * localStorage), nên để cạnh mã dễ giữ đồng bộ hơn là để quản trị viên sửa.
 */
const BROWSER_STORAGE = [
  { key: 'access_token', purpose: 'Giữ đăng nhập để mỗi lần mở trang không phải nhập lại mật khẩu.' },
  { key: 'theme-preference', purpose: 'Nhớ bạn chọn giao diện sáng, tối hay theo hệ thống.' },
  { key: 'ez-student-onboarding-draft', purpose: 'Giữ dở phần khai báo hồ sơ học sinh khi bạn thoát giữa chừng.' },
  { key: 'ezedu_recent_tools', purpose: 'Đưa công cụ bạn hay dùng lên đầu danh sách.' },
  { key: 'ezedu_announcement_dismissed', purpose: 'Ghi nhớ bạn đã tắt dải thông báo trên đầu trang. Mục này xoá ngay khi bạn đóng tab.' },
  { key: 'learning-event-offline-queue', purpose: 'Giữ tạm hoạt động học khi mất mạng, gửi lên máy chủ khi có mạng lại.' },
  { key: 'learning-session:…', purpose: 'Nối các thao tác trong cùng một buổi học vào một phiên, để thống kê thời lượng học.' },
  { key: 'ez-data-notice-v1', purpose: 'Ghi nhớ bạn đã đọc thông báo này, để không hiện lại.' },
];

export function DataPolicyPage() {
  return (
    <PublicInfoShell
      eyebrow="Quyền riêng tư"
      title="Dữ liệu lưu trên trình duyệt"
      description="Trang này liệt kê chính xác những gì EzEdu AI lưu trên máy bạn, dùng để làm gì và cách xoá."
    >
      <section className="ezp-container" style={{ paddingBottom: 'var(--ez-space-10)' }}>
        <h2 className="ezp-section-title">Không dùng cookie</h2>
        <p className="ezp-lede">
          EzEdu AI không đặt cookie nào, không gắn công cụ phân tích lưu lượng, không có mã theo dõi quảng
          cáo. Những gì lưu trên máy bạn nằm trong <code>localStorage</code> của trình duyệt và chỉ phục vụ
          việc dùng ứng dụng.
        </p>

        <h2 className="ezp-section-title" style={{ marginTop: 'var(--ez-space-8)' }}>
          {/* Đếm từ chính danh sách. Viết cứng "Năm mục" đã lệch một lần khi
              thêm mục mới, và một trang chính sách sai số liệu thì tệ hơn là
              không có trang nào. */}
          {BROWSER_STORAGE.length} mục được lưu
        </h2>
        <div className="ez-datatable-wrap">
          <table className="ez-datatable">
            <thead>
              <tr>
                <th scope="col">Tên mục</th>
                <th scope="col">Dùng để làm gì</th>
              </tr>
            </thead>
            <tbody>
              {BROWSER_STORAGE.map((item) => (
                <tr key={item.key}>
                  <td><code>{item.key}</code></td>
                  <td>{item.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="ezp-section-title" style={{ marginTop: 'var(--ez-space-8)' }}>Cách xoá</h2>
        <p className="ezp-lede">
          Bấm <strong>Đăng xuất</strong> là xoá phần giữ đăng nhập. Muốn xoá sạch, dùng chức năng xoá dữ liệu
          trang web của trình duyệt: Chrome và Edge ở mục <em>Cài đặt → Quyền riêng tư → Dữ liệu duyệt web</em>,
          Safari ở <em>Cài đặt → Nâng cao → Dữ liệu trang web</em>.
        </p>

        <h2 className="ezp-section-title" style={{ marginTop: 'var(--ez-space-8)' }}>Đăng nhập bằng Google</h2>
        <p className="ezp-lede">
          Nếu bạn dùng nút đăng nhập bằng Google, trình duyệt sẽ tải mã của Google Identity Services và Google
          có thể lưu dữ liệu theo chính sách riêng của họ. Mã này chỉ được tải ở trang đăng nhập và đăng ký.
          Không dùng nút đó thì không có gì của Google chạy.
        </p>

        <h2 className="ezp-section-title" style={{ marginTop: 'var(--ez-space-8)' }}>Dữ liệu học tập</h2>
        <p className="ezp-lede">
          Học liệu bạn tải lên, câu hỏi được sinh ra, bài làm và kết quả nằm trên máy chủ chứ không nằm trong
          trình duyệt. Xoá dữ liệu trình duyệt không xoá những thứ đó; muốn xoá tài khoản và dữ liệu kèm theo,
          liên hệ quản trị viên.
        </p>
      </section>
      <FinalCta />
    </PublicInfoShell>
  );
}
