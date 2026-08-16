import type { ReactNode } from 'react';

import type { Attempt } from '../../api/examBankApi';
import { Badge, Card, CardBody, CardHeader, CardTitle } from '../ui';
import { AnimatedCounter, Confetti, StaggerGroup } from '../../motion';

/** Từ mốc này coi là thành tích đáng ăn mừng (spec §7.4 "confetti tiết chế"). */
const CELEBRATE_PERCENT = 80;

interface Props {
  attempt: Attempt;
  /**
   * Vừa nộp xong hay đang xem lại bài cũ.
   *
   * Confetti và số điểm chạy dần chỉ hợp lúc vừa nộp. Mở lại bài tuần trước mà
   * pháo giấy nổ và số nhảy từ 0 lên thì lạc lõng, và mỗi lần mở lại nổ một lần
   * thì thành phiền. Xem lại: hiện thẳng kết quả.
   */
  vuaNop?: boolean;
  /** Nút đặt cạnh tiêu đề phần chi tiết — ví dụ "Làm lại". */
  hanhDong?: ReactNode;
}

/**
 * Bảng kết quả một lượt làm bài: điểm tổng, trạng thái chấm, chi tiết từng câu
 * kèm nhận xét AI.
 *
 * Dùng chung cho trang vừa-nộp-xong và trang xem-lại. Để hai bản riêng thì lần
 * sửa đầu tiên là chúng lệch nhau, mà đây lại đúng là chỗ mang mấy quy tắc tinh
 * tế: khi nào được hiện điểm, khi nào nhận xét AI đã sẵn sàng.
 */
export function AttemptResults({ attempt, vuaNop = false, hanhDong }: Props) {
  const percent = attempt.max_score > 0
    ? Math.round((attempt.total_score / attempt.max_score) * 100)
    : 0;
  const graded = attempt.status === 'graded';
  const correctCount = attempt.results.filter((r) => r.is_correct === true).length;
  const gradedCount = attempt.results.filter(
    (r) => r.question_type !== 'short_answer' || r.ai_score !== null || r.teacher_score !== null,
  ).length;

  return (
    <>
      <Card className="ez-result-summary" style={{ marginBottom: 'var(--ez-space-6)' }}>
        <CardBody>
          <div className="ez-result-summary-grid">
            <div className="ez-result-score">
              {/* Còn câu chờ AI chấm thì điểm hiện tại chưa phải điểm thật:
                  hiện "0%" lúc này khiến bài làm đúng trông như bị 0. */}
              <span className="ez-result-score-value">
                {!graded ? (
                  '—'
                ) : vuaNop ? (
                  <AnimatedCounter value={percent} formatter={(value) => `${value}%`} />
                ) : (
                  `${percent}%`
                )}
              </span>
              <span className="ez-result-score-meta">
                {graded ? (
                  <>
                    {attempt.total_score} / {attempt.max_score} điểm
                    {attempt.results.length > 0 ? ` · ${correctCount}/${attempt.results.length} câu đúng` : ''}
                  </>
                ) : (
                  `Đã chấm ${gradedCount}/${attempt.results.length} câu`
                )}
              </span>
            </div>
            <div className="ez-result-status">
              <Badge variant={graded ? 'success' : 'warning'}>
                {graded ? 'Đã chấm xong' : 'Đang chấm câu tự luận…'}
              </Badge>
              {attempt.auto_submitted && <span>Bài đã được tự động nộp khi hết giờ.</span>}
            </div>
          </div>
          {/* Chỉ ăn mừng khi vừa nộp, đã chấm xong và đạt ngưỡng. */}
          <Confetti active={vuaNop && graded && percent >= CELEBRATE_PERCENT} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle as="h2">Chi tiết từng câu</CardTitle>
          </div>
          {hanhDong}
        </CardHeader>
        <CardBody>
          <StaggerGroup className="ez-stack">
            {attempt.results.map((r, idx) => (
              <div
                key={r.question_id}
                className="dash-row"
                style={{ alignItems: 'flex-start' }}
                data-motion-item
                data-result-row
              >
                <span className="dash-row-main">
                  <span className="dash-row-title">Câu {idx + 1}</span>
                  <span className="dash-row-meta">
                    {r.question_type === 'short_answer' ? (
                      r.ai_score === null ? (
                        <span>Đang chấm…</span>
                      ) : (
                        <>
                          <span>
                            {r.final_score} / {r.points_possible} điểm
                          </span>
                          {r.ai_confidence !== null && <span>Độ tin cậy AI: {Math.round(r.ai_confidence * 100)}%</span>}
                          {r.teacher_score !== null && <Badge variant="info">Giáo viên đã chấm lại</Badge>}
                          {r.ai_feedback && <span data-ai-feedback>{r.ai_feedback}</span>}
                        </>
                      )
                    ) : (
                      <Badge variant={r.is_correct ? 'success' : 'error'}>
                        {r.is_correct ? 'Đúng' : 'Sai'} · {r.final_score}/{r.points_possible} điểm
                      </Badge>
                    )}
                  </span>
                </span>
              </div>
            ))}
          </StaggerGroup>
        </CardBody>
      </Card>
    </>
  );
}
