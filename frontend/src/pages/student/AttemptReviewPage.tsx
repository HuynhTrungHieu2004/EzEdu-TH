import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { examBankApi, type Attempt } from '../../api/examBankApi';
import { questionApi, type QuestionAttemptResponse } from '../../api/questionApi';
import { getApiErrorDetail } from '../../api/errors';
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, ErrorState, PageHeader, SkeletonText } from '../../components/ui';

export default function AttemptReviewPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const practiceMode = params.get('loai') === 'practice';
  const questionSetId = params.get('bo') ?? '';
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [practice, setPractice] = useState<QuestionAttemptResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!attemptId) return;
    setLoading(true);
    setError('');
    try {
      if (!practiceMode) {
        setAttempt(await examBankApi.getAttempt(attemptId));
      } else if (!questionSetId) {
        setError('Thiếu thông tin bộ câu hỏi nên không mở được bài luyện tập này.');
      } else {
        const item = (await questionApi.listMyAttempts(questionSetId)).find((row) => row.id === attemptId);
        if (item) setPractice(item);
        else setError('Không tìm thấy lượt làm này.');
      }
    } catch (err) {
      setError(getApiErrorDetail(err) ?? 'Không tải được bài làm.');
    } finally {
      setLoading(false);
    }
  }, [attemptId, practiceMode, questionSetId]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  if (loading) return <SkeletonText lines={10} />;
  if (error) return <ErrorState title="Không xem lại được bài làm" description={error} actions={<Button onClick={() => navigate('/learning-history')}>Về lịch sử học tập</Button>} />;

  if (attempt) {
    return <>
      <PageHeader eyebrow={`Mã đề ${attempt.exam_code}`} title="Xem lại bài làm" actions={<Button variant="ghost" onClick={() => navigate('/learning-history')}>Lịch sử học tập</Button>} />
      <Card style={{ marginBottom: 'var(--ez-space-6)' }}><CardBody style={{ display: 'flex', gap: 'var(--ez-space-4)', alignItems: 'center', flexWrap: 'wrap' }}>
        <Badge variant={attempt.status === 'graded' ? 'success' : 'warning'}>{attempt.status === 'graded' ? 'Đã chấm xong' : 'Đang chấm'}</Badge>
        <strong>{attempt.total_score} / {attempt.max_score} điểm</strong>
      </CardBody></Card>
      <Card><CardHeader><CardTitle as="h2">Chi tiết từng câu</CardTitle></CardHeader><CardBody className="ez-stack">
        {attempt.results.length === 0 ? <p className="text-muted">Bài làm chưa có chi tiết chấm điểm.</p> : attempt.results.map((result, index) => (
          <div key={result.question_id} className="dash-row"><span className="dash-row-main"><span className="dash-row-title">Câu {index + 1}</span><span className="dash-row-meta"><span>{result.final_score} / {result.points_possible} điểm</span>{result.ai_feedback && <span>{result.ai_feedback}</span>}</span></span></div>
        ))}
      </CardBody></Card>
    </>;
  }

  if (practice) {
    return <>
      <PageHeader eyebrow="Bài luyện tập" title="Xem lại bài làm" actions={<Button variant="ghost" onClick={() => navigate('/learning-history')}>Lịch sử học tập</Button>} />
      <Card><CardBody><strong>{Math.round(practice.percent)}% · {practice.score} / {practice.max_score} điểm</strong></CardBody></Card>
    </>;
  }

  return <ErrorState title="Không tìm thấy bài làm" />;
}
