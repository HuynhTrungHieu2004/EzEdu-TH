import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { examBankApi, type Attempt } from '../../api/examBankApi';
import { questionApi, type QuestionAttemptResponse } from '../../api/questionApi';
import { getApiErrorDetail } from '../../api/errors';
import { AttemptResults } from '../../components/student/AttemptResults';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  ErrorState,
  PageHeader,
  SkeletonText,
} from '../../components/ui';
import { StaggerGroup } from '../../motion';
import '../question-set.css';
import '../exam-attempt.css';

/**
 * Xem lại một lượt làm bài đã nộp — chỉ đọc.
 *
 * Trước trang này, lịch sử học tập trỏ thẳng vào đường LÀM LẠI. Với đề không
 * cho làm lại, học sinh bấm vào lịch sử của chính mình và nhận 403 "Đề thi này
 * không cho phép làm lại"; với đề cho làm lại thì mở ra một lượt mới tinh và
 * bài cũ biến mất. Nhận xét AI vì thế chỉ xem được đúng một lần, ngay sau khi
 * nộp.
 *
 * Trang này KHÔNG dùng lại `ExamAttemptPage`: trang đó gọi `startAttempt` (tạo
 * lượt mới) và chạy autosave ngầm. Mở bài cũ bằng nó là mời gọi ghi đè bài đã
 * nộp. Ở đây chỉ có một lệnh đọc `getAttempt`, không có đường ghi nào.
 */
export default function AttemptReviewPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  // `loai` cho biết đọc từ nguồn nào. Lấy từ query vì hai loại lượt làm nằm ở
  // hai collection khác nhau và id không đụng nhau nhưng cũng không nói lên
  // loại; đoán mò bằng cách thử lần lượt sẽ tạo một request 404 vô ích mỗi lần.
  const loai = params.get('loai') === 'practice' ? 'practice' : 'exam';
  const questionSetId = params.get('bo') ?? '';
  // Chỉ là gợi ý hiển thị. Ai sửa query để nút hiện ra vẫn bị backend chặn
  // bằng 403 ở `start_attempt` — nơi quyết định thật nằm ở đó, không ở đây.
  const choLamLai = params.get('lam_lai') === '1';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [practice, setPractice] = useState<QuestionAttemptResponse | null>(null);

  const load = useCallback(async () => {
    if (!attemptId) return;
    setLoading(true);
    setError(null);
    try {
      if (loai === 'exam') {
        setAttempt(await examBankApi.getAttempt(attemptId));
      } else {
        if (!questionSetId) {
          setError('Thiếu thông tin bộ câu hỏi nên không mở được bài luyện tập này.');
          return;
        }
        // Backend chỉ có endpoint liệt kê theo bộ câu hỏi, chưa có đường lấy
        // một lượt luyện tập theo id. Lọc ở phía này thay vì thêm endpoint mới:
        // danh sách giới hạn 20 lượt gần nhất nên không có chuyện tải nặng.
        const ds = await questionApi.listMyAttempts(questionSetId);
        const tim = ds.find((item) => item.id === attemptId);
        if (!tim) {
          setError('Không tìm thấy lượt làm này. Có thể nó đã quá 20 lượt gần nhất.');
          return;
        }
        setPractice(tim);
      }
    } catch (err: unknown) {
      setError(getApiErrorDetail(err) ?? 'Không tải được bài làm.');
    } finally {
      setLoading(false);
    }
  }, [attemptId, loai, questionSetId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <SkeletonText lines={10} />;

  if (error) {
    return (
      <ErrorState
        title="Không xem lại được bài làm"
        description={error}
        actions={<Button onClick={() => navigate('/learning-history')}>Về lịch sử học tập</Button>}
      />
    );
  }

  if (loai === 'exam' && attempt) {
    return (
      <>
        <PageHeader
          eyebrow={`Mã đề ${attempt.exam_code}`}
          title="Xem lại bài làm"
          actions={<Button variant="ghost" onClick={() => navigate('/learning-history')}>Lịch sử học tập</Button>}
        />
        {/* Không truyền `vuaNop`: đây là bài cũ, không nổ confetti và không cho
            số điểm chạy dần — mở lại lần thứ ba mà vẫn ăn mừng thì thành phiền. */}
        <AttemptResults
          attempt={attempt}
          hanhDong={
            choLamLai ? (
              <Button onClick={() => navigate(`/take-exam/${attempt.exam_id}`)}>Làm lại đề này</Button>
            ) : undefined
          }
        />
      </>
    );
  }

  if (practice) {
    const percent = Math.round(practice.percent);
    const dung = practice.answers.filter((a) => a.is_correct).length;

    return (
      <>
        <PageHeader
          eyebrow="Bài luyện tập"
          title="Xem lại bài làm"
          actions={<Button variant="ghost" onClick={() => navigate('/learning-history')}>Lịch sử học tập</Button>}
        />

        <Card className="ez-result-summary" style={{ marginBottom: 'var(--ez-space-6)' }}>
          <CardBody>
            <div className="ez-result-summary-grid">
              <div className="ez-result-score">
                <span className="ez-result-score-value">{percent}%</span>
                <span className="ez-result-score-meta">
                  {practice.score} / {practice.max_score} điểm · {dung}/{practice.answers.length} câu đúng
                </span>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Nói thẳng thay vì để chỗ trống. Học sinh vừa xem một đề thi có nhận
            xét AI rồi mở bài luyện tập thấy không có gì sẽ tưởng hệ thống hỏng. */}
        <Alert tone="info" className="ez-stack-item" >
          Bài luyện tập chỉ lưu đáp án đúng hoặc sai, không có nhận xét của AI. Nhận xét AI hiện ở
          bài thi có câu tự luận ngắn.
        </Alert>

        <Card style={{ marginTop: 'var(--ez-space-4)' }}>
          <CardHeader>
            <div>
              <CardTitle as="h2">Chi tiết từng câu</CardTitle>
            </div>
          </CardHeader>
          <CardBody>
            <StaggerGroup className="ez-stack">
              {practice.answers.map((a) => (
                <div
                  key={a.question_index}
                  className="dash-row"
                  style={{ alignItems: 'flex-start' }}
                  data-motion-item
                  data-result-row
                >
                  <span className="dash-row-main">
                    <span className="dash-row-title">Câu {a.question_index + 1}</span>
                    <span className="dash-row-meta">
                      <Badge variant={a.is_correct ? 'success' : 'error'}>
                        {a.is_correct ? 'Đúng' : 'Sai'}
                      </Badge>
                      <span>Bạn chọn: {a.answer || '(bỏ trống)'}</span>
                      {!a.is_correct && <span>Đáp án đúng: {a.correct_answer}</span>}
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

  return <ErrorState title="Không tìm thấy bài làm" />;
}
