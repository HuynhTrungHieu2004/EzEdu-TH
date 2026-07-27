import {
  CheckCircle,
  ClipboardCheck,
  Download,
  Edit3,
  FileSearch,
  FileText,
  Loader,
  SlidersHorizontal,
  UploadCloud,
  Video,
} from 'lucide-react';
import { SectionHeading } from './shared';
import type { LandingSectionItem } from '../../types/websiteContent';

function UploadMiniature() {
  return (
    <>
      <div className="lp-step-mini-toolbar">
        <span aria-hidden="true" />
        <span aria-hidden="true" />
        <span aria-hidden="true" />
      </div>
      <div className="lp-step-upload-mini">
        <UploadCloud size={24} strokeWidth={1.8} aria-hidden="true" />
        <strong>Kéo thả học liệu</strong>
        <small>PDF, DOCX, PPTX, Video</small>
      </div>
      <div className="lp-step-mini-row">
        <FileText size={13} strokeWidth={2} aria-hidden="true" />
        <span>chuong-1.pdf</span>
      </div>
      <div className="lp-step-mini-row">
        <Video size={13} strokeWidth={2} aria-hidden="true" />
        <span>bai-giang.mp4</span>
      </div>
    </>
  );
}

function AnalysisMiniature() {
  const steps = [
    { label: 'Trích xuất văn bản', done: true },
    { label: 'Làm sạch dữ liệu', done: true },
    { label: 'Chia đoạn nội dung', done: true },
    { label: 'Xác định chủ đề', done: false },
  ];

  return (
    <>
      <div className="lp-step-mini-title">Pipeline xử lý</div>
      <div className="lp-step-progress-track">
        <span style={{ width: '76%' }} />
      </div>
      <div className="lp-step-check-list">
        {steps.map((step) => (
          <div key={step.label} className="lp-step-check-row">
            {step.done ? (
              <CheckCircle size={13} strokeWidth={2} aria-hidden="true" />
            ) : (
              <Loader size={13} strokeWidth={2} className="lp-step-loader" aria-hidden="true" />
            )}
            <span>{step.label}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function ConfigMiniature() {
  return (
    <>
      <div className="lp-step-mini-title">Cấu hình đề</div>
      <div className="lp-step-config-grid">
        <span>10 câu</span>
        <span>Trắc nghiệm</span>
        <span>Trung bình</span>
        <span>Mức độ</span>
      </div>
      <div className="lp-step-slider">
        <span aria-hidden="true" />
      </div>
      <div className="lp-step-topic-line">
        <strong>Chủ đề</strong>
        <small>CSDL · Lập trình Web</small>
      </div>
    </>
  );
}

function ReviewMiniature() {
  return (
    <>
      <div className="lp-step-mini-title">Bộ câu hỏi</div>
      <div className="lp-step-question-preview">
        <div>
          <strong>Câu 1</strong>
          <span>Đã duyệt</span>
        </div>
        <p>Khái niệm nào mô tả khóa chính?</p>
      </div>
      <div className="lp-step-review-actions">
        <span><Edit3 size={12} strokeWidth={2} aria-hidden="true" /> Sửa</span>
        <span><Download size={12} strokeWidth={2} aria-hidden="true" /> Xuất</span>
      </div>
    </>
  );
}

const HOW_IT_WORKS_STEPS = [
  {
    number: 1,
    icon: UploadCloud,
    title: 'Tải học liệu',
    description: 'Tải tài liệu, video hoặc nhập đường dẫn nội dung cần xử lý.',
    Visual: UploadMiniature,
  },
  {
    number: 2,
    icon: FileSearch,
    title: 'Phân tích nội dung',
    description: 'Hệ thống trích xuất văn bản, làm sạch dữ liệu, chia đoạn và xác định các chủ đề kiến thức.',
    Visual: AnalysisMiniature,
  },
  {
    number: 3,
    icon: SlidersHorizontal,
    title: 'Cấu hình đề kiểm tra',
    description: 'Chọn số lượng câu, loại câu hỏi, mức độ khó, chủ đề và đối tượng người học.',
    Visual: ConfigMiniature,
  },
  {
    number: 4,
    icon: ClipboardCheck,
    title: 'Kiểm tra và xuất đề',
    description: 'Xem lại câu hỏi, chỉnh sửa nội dung, lưu lịch sử hoặc xuất ra định dạng phù hợp.',
    Visual: ReviewMiniature,
  },
];

export default function StepsSection({ content }: { content?: LandingSectionItem }) {
  return (
    <section className="lp-section-alt" id="how-it-works" aria-labelledby="steps-heading">
      <div className="lp-container">
        <SectionHeading
          eyebrow={content?.eyebrow || 'Hướng dẫn sử dụng'}
          title={content?.title || '4 bước để biến học liệu thành đề kiểm tra'}
          description={content?.description || 'EzEdu AI đơn giản hóa toàn bộ quá trình từ tải học liệu đến xuất bộ câu hỏi hoàn chỉnh.'}
          titleId="steps-heading"
        />

        <div className="lp-steps-grid">
          {HOW_IT_WORKS_STEPS.map(({ number, icon: Icon, title, description, Visual }) => (
            <article className="lp-step-card" key={number}>
              <div className="lp-step-visual" aria-hidden="true">
                <div className="lp-step-visual-inner">
                  <Visual />
                </div>
              </div>
              <div className="lp-step-body">
                <div className="lp-step-card-head">
                  <div className="lp-step-num">{number}</div>
                  <div className="lp-step-icon" aria-hidden="true">
                    <Icon size={18} strokeWidth={2} aria-hidden="true" />
                  </div>
                </div>
                <h3 className="lp-step-title">{title}</h3>
                <p className="lp-step-desc">{description}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
