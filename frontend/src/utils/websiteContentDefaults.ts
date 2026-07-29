import type { WebsiteContentBundle } from '../types/websiteContent';

export const DEFAULT_WEBSITE_CONTENT: WebsiteContentBundle = {
  site_identity: {
    site_name: 'EzEdu AI',
    logo_text: 'EzEdu AI',
    favicon_url: '/favicon.svg',
    logo_url: '',
    slogan: 'Biến học liệu thành đề thi dễ dàng',
  },
  header: {
    menu: [
      { label: 'Tính năng', href: '#tinh-nang', order: 1, visible: true },
      { label: 'Cách hoạt động', href: '#how-it-works', order: 2, visible: true },
      { label: 'Sơ đồ xử lý', href: '#workflow', order: 3, visible: true },
      { label: 'Vì sao chọn EzEdu', href: '#benefits', order: 4, visible: true },
    ],
    login_label: 'Đăng nhập',
    primary_cta_label: 'Bắt đầu miễn phí',
    authenticated_cta_label: 'Tải học liệu',
  },
  hero: {
    title: 'Xử lý học liệu điện tử',
    highlight: 'thành đề thi miễn phí',
    description: 'Tải tài liệu lên, tạo câu hỏi, luyện tập và nhận hỗ trợ từ AI trong cùng một nền tảng.',
    primary_cta_label: 'Bắt đầu miễn phí',
    secondary_cta_label: 'Khám phá công cụ',
    sticker_image_url: '',
    upload_enabled: true,
    chips: ['PDF · DOCX · PPTX · Video', 'Tìm đúng nội dung', 'Tạo câu hỏi nhanh', 'Có đáp án và lời giải'],
  },
  sections: {
    items: [
      { key: 'features', title: 'Xem EzEdu AI tạo đề thi', eyebrow: 'Kết quả thực tế', description: 'Câu hỏi được sinh ra kèm đáp án, lời giải thích và mức độ phù hợp.', enabled: true, order: 1 },
      { key: 'how_it_works', title: '4 bước để biến học liệu thành đề kiểm tra', eyebrow: 'Hướng dẫn sử dụng', description: 'EzEdu AI đơn giản hóa toàn bộ quá trình từ tải học liệu đến xuất bộ câu hỏi hoàn chỉnh.', enabled: true, order: 2 },
      { key: 'workflow', title: 'Luồng xử lý học liệu', eyebrow: 'Sơ đồ xử lý', description: 'Từ học liệu đầu vào đến ngân hàng câu hỏi có kiểm tra chất lượng.', enabled: true, order: 3 },
      { key: 'benefits', title: 'Tại sao nên chọn EzEdu AI?', eyebrow: 'Lợi ích', description: 'EzEdu AI giúp giảm thao tác thủ công và tổ chức toàn bộ quy trình xử lý học liệu trong một hệ thống.', enabled: true, order: 4 },
      { key: 'testimonials', title: 'Đánh giá', eyebrow: 'Người dùng', description: 'Khu vực đánh giá đang được chuẩn bị.', enabled: false, order: 5 },
      { key: 'faq', title: 'FAQ', eyebrow: 'Câu hỏi thường gặp', description: 'Khu vực FAQ đang được chuẩn bị.', enabled: false, order: 6 },
    ],
    benefits: [
      { title: 'Hỗ trợ nhiều loại học liệu', description: 'Xử lý tài liệu văn bản, trình chiếu, PDF và video từ máy tính.' },
      { title: 'Tạo câu hỏi theo nội dung', description: 'Hệ thống bám vào học liệu đã tải lên để tạo câu hỏi, đáp án và lời giải thích phù hợp hơn với tài liệu.' },
      { title: 'Hạn chế câu hỏi sai lệch', description: 'Câu hỏi được tạo dựa trên nội dung học liệu và có thể trải qua bước kiểm tra chất lượng trước khi sử dụng.' },
      { title: 'Quản lý dữ liệu tập trung', description: 'Lưu học liệu, câu hỏi, lịch sử sinh đề, kết quả làm bài và các phiên làm việc trong cơ sở dữ liệu.' },
      { title: 'Dễ chỉnh sửa và xuất đề', description: 'Người dùng có thể xem lại, chỉnh sửa, lưu và xuất bộ câu hỏi phục vụ học tập và giảng dạy.' },
    ],
  },
  footer: {
    contact_label: 'Hỗ trợ',
    email: 'support@ezedu.ai',
    socials: [],
    policies: [
      { label: 'Chính sách bảo mật', href: '#privacy', visible: true },
      { label: 'Điều khoản sử dụng', href: '#terms', visible: true },
    ],
    copyright: '© 2026 EzEdu AI. Biến học liệu thành đề thi dễ dàng.',
  },
};

export function mergeWebsiteContent(partial: Partial<Record<keyof WebsiteContentBundle, Record<string, unknown>>>): WebsiteContentBundle {
  return {
    site_identity: { ...DEFAULT_WEBSITE_CONTENT.site_identity, ...(partial.site_identity || {}) },
    header: { ...DEFAULT_WEBSITE_CONTENT.header, ...(partial.header || {}) },
    hero: { ...DEFAULT_WEBSITE_CONTENT.hero, ...(partial.hero || {}) },
    sections: { ...DEFAULT_WEBSITE_CONTENT.sections, ...(partial.sections || {}) },
    footer: { ...DEFAULT_WEBSITE_CONTENT.footer, ...(partial.footer || {}) },
  } as WebsiteContentBundle;
}
