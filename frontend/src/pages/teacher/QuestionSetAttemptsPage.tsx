import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { questionApi, type TeacherQuestionAttempt } from '../../api/questionApi';
import { getApiErrorDetail } from '../../api/errors';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  PageHeader,
  SkeletonText,
} from '../../components/ui';

export default function QuestionSetAttemptsPage() {
  const { setId } = useParams<{ setId: string }>();
  const [items, setItems] = useState<TeacherQuestionAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!setId) {
      setError('Không tìm thấy bộ đề.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      setItems(await questionApi.listAttemptsForTeacher(setId));
    } catch (err) {
      setError(getApiErrorDetail(err) ?? 'Không tải được danh sách bài làm.');
    } finally {
      setLoading(false);
    }
  }, [setId]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  if (loading) return <SkeletonText lines={8} />;
  if (error) return <ErrorState title="Không tải được bài làm" description={error} actions={<Button onClick={() => void load()}>Thử lại</Button>} />;

  return (
    <div className="ez-stack">
      <PageHeader
        backTo={setId ? `/question-sets/${setId}` : '/question-history'}
        backLabel="Quay lại đề thi"
        eyebrow="Chấm bài"
        title="Bài làm của học sinh"
        description={`${items.length} bài đã nộp, mới nhất hiển thị trước.`}
      />
      {items.length === 0 ? (
        <EmptyState title="Chưa có học sinh nộp bài" />
      ) : items.map((attempt) => (
        <Card key={attempt.id}>
          <CardHeader>
            <div>
              <CardTitle as="h2">{attempt.student_name || attempt.student_email || 'Học sinh'}</CardTitle>
              {attempt.student_email && <div>{attempt.student_email}</div>}
              <div>{new Date(attempt.created_at).toLocaleString('vi-VN')}</div>
            </div>
            <div>
              <Badge variant={attempt.percent >= 50 ? 'success' : 'warning'}>{attempt.percent}%</Badge>{' '}
              <strong>{attempt.score} / {attempt.max_score} điểm</strong>
            </div>
          </CardHeader>
          <CardBody className="ez-stack">
            {attempt.answers.map((answer) => (
              <div key={answer.question_index} className="dash-row">
                <span className="dash-row-main">
                  <strong>Câu {answer.question_index + 1}</strong>
                  <span>Học sinh trả lời: {answer.answer || '(bỏ trống)'}</span>
                  <span>Đáp án đúng: {answer.correct_answer}</span>
                </span>
                <Badge variant={answer.is_correct ? 'success' : 'error'}>
                  {answer.is_correct ? 'Đúng' : 'Sai'}
                </Badge>
              </div>
            ))}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
