import { useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useMotion } from '../../motion';

gsap.registerPlugin(ScrollTrigger);

const STAGES = [
  { id: 'hoc-lieu', label: 'Học liệu', desc: 'PDF, DOCX, PPTX hoặc video bài giảng bạn đang dùng.' },
  { id: 'trich-xuat', label: 'Trích xuất', desc: 'Đọc nội dung, tách thành đoạn có ngữ cảnh và trích dẫn.' },
  { id: 'kmeans', label: 'K-Means', desc: 'Gom đoạn theo chủ đề để biết học liệu đang phủ những phần nào.' },
  { id: 'ngan-hang', label: 'Ngân hàng', desc: 'Câu hỏi kèm đáp án, lời giải và nguồn, gắn chủ đề và độ khó.' },
  { id: 'cp-sat', label: 'CP-SAT', desc: 'Chọn tổ hợp câu thoả ma trận đề: số câu, độ khó, phân bố chủ đề.' },
  { id: 'bo-de', label: 'Bộ đề', desc: 'Đề hoàn chỉnh để giao cho lớp hoặc cho học sinh tự ôn.' },
] as const;

/**
 * Dây chuyền dữ liệu trên trang chủ (spec §7.2).
 *
 * Từ desktop trở lên, khối được ghim lại và một "gói dữ liệu" chạy dọc dây
 * chuyền theo tiến độ cuộn, mỗi công đoạn sáng lên khi gói đi qua — giải thích
 * đúng thứ tự xử lý thật của hệ thống thay vì chỉ liệt kê.
 *
 * Dưới 1024px hoặc khi người dùng yêu cầu giảm chuyển động: không ghim, không
 * scrub, mọi công đoạn hiển thị sẵn dưới dạng danh sách có thứ tự.
 */
export function DataPipeline() {
  const rootRef = useRef<HTMLDivElement>(null);
  const { reducedMotion } = useMotion();
  const [activeIndex, setActiveIndex] = useState(0);

  useGSAP(() => {
    const root = rootRef.current;
    if (!root || reducedMotion) return;

    const mm = gsap.matchMedia();
    mm.add('(min-width: 1024px)', () => {
      const token = root.querySelector<HTMLElement>('[data-pipeline-token]');
      if (!token) return;

      const timeline = gsap.timeline({
        scrollTrigger: {
          trigger: root,
          start: 'top top+=80',
          end: `+=${STAGES.length * 240}`,
          pin: true,
          scrub: 0.4,
          onUpdate: (self) => {
            const index = Math.min(
              STAGES.length - 1,
              Math.floor(self.progress * STAGES.length),
            );
            setActiveIndex(index);
          },
        },
      });

      // Gói dữ liệu chạy từ công đoạn đầu tới công đoạn cuối theo tiến độ cuộn.
      timeline.fromTo(
        token,
        { xPercent: 0 },
        { xPercent: (STAGES.length - 1) * 100, ease: 'none' },
      );
    });

    return () => mm.revert();
  }, { scope: rootRef, dependencies: [reducedMotion], revertOnUpdate: true });

  return (
    <section className="ezp-section ezp-section-alt" aria-labelledby="pipeline-title" id="duong-di-du-lieu">
      <div className="ezp-container" ref={rootRef} data-pipeline>
        <div className="ezp-head">
          <span className="ezp-eyebrow">Đường đi của dữ liệu</span>
          <h2 className="ezp-title" id="pipeline-title">
            Học liệu của bạn đi qua sáu công đoạn
          </h2>
        </div>

        <div className="ezp-pipeline-track" aria-hidden="true">
          <span className="ezp-pipeline-line" />
          <span className="ezp-pipeline-token" data-pipeline-token />
        </div>

        <ol className="ezp-pipeline-stages">
          {STAGES.map((stage, index) => (
            <li
              key={stage.id}
              className="ezp-pipeline-stage"
              data-stage={stage.id}
              data-active={!reducedMotion && index <= activeIndex ? 'true' : 'false'}
            >
              <span className="ezp-pipeline-stage-num" aria-hidden="true">{index + 1}</span>
              <h3 className="ezp-pipeline-stage-title">{stage.label}</h3>
              <p className="ezp-pipeline-stage-desc">{stage.desc}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
