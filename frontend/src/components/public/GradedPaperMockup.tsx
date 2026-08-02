import { RedCheckmark, GradeStamp } from '../ui';

const PAPER_ROWS = [
  'Câu 1. Parabol có bề lõm quay lên khi nào?',
  'Câu 2. Tính toạ độ đỉnh của (P): y = x² − 4x + 3',
  'Câu 3. Trục đối xứng của (P) là đường thẳng nào?',
  'Câu 4. Giá trị nhỏ nhất của hàm số trên là bao nhiêu?',
];

/**
 * Mock "phiếu chấm bài" cho hero trang chủ — minh hoạ trực tiếp trải nghiệm
 * chấm điểm bằng AI, dùng RedCheckmark + GradeStamp thật (không phải ảnh
 * tĩnh), nghiêng nhẹ 3° theo đúng spec redesign.
 */
export default function GradedPaperMockup() {
  return (
    <div className="ez-paper-mock" aria-hidden="true">
      <GradeStamp value="9/10" label="Điểm" size="lg" className="ez-paper-mock-stamp" />
      <p className="ez-paper-mock-title">Đề số 04 · Toán 10 · Hàm số bậc hai</p>
      <ul className="ez-paper-mock-rows">
        {PAPER_ROWS.map((row) => (
          <li key={row} className="ez-paper-mock-row">
            <RedCheckmark size={16} />
            <span>{row}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
