import { Check } from 'lucide-react';

const PAPER_ROWS = [
  'Câu 1. Parabol có bề lõm quay lên khi nào?',
  'Câu 2. Tính toạ độ đỉnh của (P): y = x² − 4x + 3',
  'Câu 3. Trục đối xứng của (P) là đường thẳng nào?',
  'Câu 4. Giá trị nhỏ nhất của hàm số trên là bao nhiêu?',
];

export default function GradedPaperMockup() {
  return (
    <div className="ez-paper-mock" aria-hidden="true">
      <div className="ez-paper-mock-stamp" style={{ border: '3px solid var(--ez-error)', borderRadius: '50%', color: 'var(--ez-error)', display: 'grid', fontWeight: 800, height: 72, placeItems: 'center', width: 72 }}>
        9/10
      </div>
      <p className="ez-paper-mock-title">Đề số 04 · Toán 10 · Hàm số bậc hai</p>
      <ul className="ez-paper-mock-rows">
        {PAPER_ROWS.map((row) => (
          <li key={row} className="ez-paper-mock-row">
            <Check size={16} color="var(--ez-error)" strokeWidth={3} />
            <span>{row}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
