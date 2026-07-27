import { BrainCircuit, Database, FilePenLine, Files, ShieldCheck } from 'lucide-react';
import { SectionHeading } from './shared';
import type { BenefitItem, LandingSectionItem } from '../../types/websiteContent';

const benefits = [
  {
    Icon: Files,
    title: 'Hỗ trợ nhiều loại học liệu',
    desc: 'Xử lý tài liệu văn bản, trình chiếu, PDF và video từ máy tính.',
  },
  {
    Icon: BrainCircuit,
    title: 'Tạo câu hỏi theo nội dung',
    desc: 'Hệ thống bám vào học liệu đã tải lên để tạo câu hỏi, đáp án và lời giải thích phù hợp hơn với tài liệu.',
  },
  {
    Icon: ShieldCheck,
    title: 'Hạn chế câu hỏi sai lệch',
    desc: 'Câu hỏi được tạo dựa trên nội dung học liệu và có thể trải qua bước kiểm tra chất lượng trước khi sử dụng.',
  },
  {
    Icon: Database,
    title: 'Quản lý dữ liệu tập trung',
    desc: 'Lưu học liệu, câu hỏi, lịch sử sinh đề, kết quả làm bài và các phiên làm việc trong cơ sở dữ liệu.',
  },
  {
    Icon: FilePenLine,
    title: 'Dễ chỉnh sửa và xuất đề',
    desc: 'Người dùng có thể xem lại, chỉnh sửa, lưu và xuất bộ câu hỏi phục vụ học tập và giảng dạy.',
  },
];

export default function WhySection({ content, cmsBenefits }: { content?: LandingSectionItem; cmsBenefits?: BenefitItem[] }) {
  const renderedBenefits = cmsBenefits?.length
    ? cmsBenefits.map((item, index) => ({
        Icon: benefits[index % benefits.length].Icon,
        title: item.title,
        desc: item.description,
      }))
    : benefits;

  return (
    <section className="lp-section-alt" id="benefits" aria-labelledby="why-heading">
      <div className="lp-container">
        <SectionHeading
          eyebrow={content?.eyebrow || 'Lợi ích'}
          title={content?.title || 'Tại sao nên chọn EzEdu AI?'}
          description={content?.description || 'EzEdu AI giúp giảm thao tác thủ công và tổ chức toàn bộ quy trình xử lý học liệu trong một hệ thống.'}
          titleId="why-heading"
        />

        <div className="lp-why-grid">
          {renderedBenefits.map(({ Icon, title, desc }) => (
            <article className="lp-why-card" key={title}>
              <div className="lp-why-card-top">
                <span className="lp-why-icon" aria-hidden="true">
                  <Icon size={24} strokeWidth={1.8} aria-hidden="true" />
                </span>
              </div>
              <h3 className="lp-why-title">{title}</h3>
              <p className="lp-why-desc">{desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
