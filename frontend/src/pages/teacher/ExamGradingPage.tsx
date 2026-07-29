import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { examBankApi } from '../../api/examBankApi';
import type { Attempt } from '../../api/examBankApi';
import { getApiErrorDetail, getApiErrorStatus } from '../../api/errors';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  PermissionDeniedState,
  SkeletonText,
} from '../../components/ui';
import '../dashboard.css';

/**
 * Bảng chấm bài cho giáo viên — xem điểm AI chấm câu tự luận kèm độ tin cậy,
 * và ghi đè điểm khi cần (yêu cầu "AI chấm điểm kèm độ tin cậy + giáo viên
 * ghi đè" của giai đoạn 4).
 */
export default function ExamGradingPage() {
  const { examId } = useParams<{ examId: string }>();
  const [items, setItems] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadState, setLoadState] = useState<'ok' | 'not-found' | 'denied' | 'error'>('ok');
  const [error, setError] = useState<string | null>(null);
  const [overrideDrafts, setOverrideDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const validExamId = Boolean(examId && /^[a-f\d]{24}$/i.test(examId));

  const load = useCallback(async () => {
    if (!validExamId || !examId) {
      setLoading(false);
      setLoadState('not-found');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await examBankApi.listAttempts(examId);
      setItems(response.items);
      setLoadState('ok');
    } catch (err) {
      const status = getApiErrorStatus(err);
      setLoadState(status === 403 ? 'denied' : status === 404 ? 'not-found' : 'error');
      setError(getApiErrorDetail(err) ?? 'Không tải được danh sách bài làm.');
    } finally {
      setLoading(false);
    }
  }, [examId, validExamId]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  async function submitOverride(attempt: Attempt, questionId: string) {
    const key = `${attempt.id}:${questionId}`;
    const raw = overrideDrafts[key];
    const score = Number(raw);
    const result = attempt.results.find((item) => item.question_id === questionId);
    if (
      raw === undefined
      || raw.trim() === ''
      || Number.isNaN(score)
      || score < 0
      || !result
      || score > result.points_possible
    ) {
      setSaveError('Điểm ghi đè phải nằm trong phạm vi điểm của câu hỏi.');
      return;
    }

    setSavingKey(key);
    setSaveError(null);
    try {
      const updated = await examBankApi.overrideScore(attempt.id, attempt.version, questionId, score);
      setItems((current) => current.map((a) => (a.id === updated.id ? updated : a)));
      setOverrideDrafts((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    } catch (err) {
      setSaveError(getApiErrorDetail(err) ?? 'Ghi đè điểm thất bại.');
    } finally {
      setSavingKey(null);
    }
  }

  if (loading) {
    return (
      <div className="ez-stack">
        <SkeletonText lines={2} />
        <SkeletonText lines={8} />
      </div>
    );
  }

  if (loadState === 'denied') {
    return (
      <PermissionDeniedState
        title="Bạn không có quyền chấm đề thi này"
        description="Chỉ giáo viên sở hữu đề thi mới có thể xem và ghi đè điểm."
      />
    );
  }

  if (loadState === 'not-found') {
    return (
      <EmptyState
        title="Không tìm thấy đề thi"
        description="Đường dẫn thiếu mã đề hợp lệ hoặc đề thi không còn tồn tại."
        actions={<Button variant="outline" onClick={() => window.history.back()}>Quay lại</Button>}
      />
    );
  }

  if (loadState === 'error' || error) {
    return <ErrorState title="Không tải được bài làm" description={error ?? undefined} actions={<Button onClick={() => void load()}>Thử lại</Button>} />;
  }

  return (
    <>
      <PageHeader eyebrow="Chấm bài" title="Kết quả làm bài" description={`${items.length} học sinh đã bắt đầu làm bài.`} />

      {saveError && (
        <Alert tone="error" style={{ marginBottom: 'var(--ez-space-4)' }}>
          {saveError}
        </Alert>
      )}

      {items.length === 0 ? (
        <EmptyState compact title="Chưa có học sinh nào làm bài" />
      ) : (
        <div className="ez-stack">
          {items.map((attempt) => (
            <Card key={attempt.id}>
              <CardHeader>
                <div>
                  <CardTitle as="h2">
                    {attempt.student_name || attempt.student_email || 'Học sinh'}
                  </CardTitle>
                </div>
                <div style={{ display: 'flex', gap: 'var(--ez-space-2)', alignItems: 'center' }}>
                  <Badge variant={attempt.status === 'graded' ? 'success' : attempt.status === 'submitted' ? 'warning' : 'neutral'}>
                    {attempt.status === 'in_progress' ? 'Đang làm bài' : attempt.status === 'submitted' ? 'Chờ chấm tự luận' : 'Đã chấm xong'}
                  </Badge>
                  <strong>
                    {attempt.total_score} / {attempt.max_score} điểm
                  </strong>
                </div>
              </CardHeader>
              {attempt.results.length > 0 && (
                <CardBody className="ez-stack">
                  {attempt.results
                    .filter((r) => r.question_type === 'short_answer')
                    .map((r) => {
                      const key = `${attempt.id}:${r.question_id}`;
                      const rawScore = overrideDrafts[key] ?? '';
                      const parsedScore = Number(rawScore);
                      const validScore = rawScore.trim() !== ''
                        && !Number.isNaN(parsedScore)
                        && parsedScore >= 0
                        && parsedScore <= r.points_possible;
                      return (
                        <div key={key} className="dash-row" style={{ alignItems: 'flex-start' }}>
                          <span className="dash-row-main">
                            <span className="dash-row-title">{r.student_answer || '(không trả lời)'}</span>
                            <span className="dash-row-meta">
                              {r.ai_score === null ? (
                                <span>Chưa chấm</span>
                              ) : (
                                <>
                                  <span>
                                    AI chấm: {r.ai_score}/{r.points_possible} điểm
                                  </span>
                                  {r.ai_confidence !== null && <span>Độ tin cậy: {Math.round(r.ai_confidence * 100)}%</span>}
                                  {r.ai_feedback && <span>{r.ai_feedback}</span>}
                                </>
                              )}
                              {r.teacher_score !== null && <Badge variant="info">Đã ghi đè: {r.teacher_score} điểm</Badge>}
                            </span>
                          </span>
                          <div style={{ display: 'flex', gap: 'var(--ez-space-2)', alignItems: 'center' }}>
                            <Input
                              type="number"
                              min={0}
                              max={r.points_possible}
                              step={0.25}
                              style={{ width: '90px' }}
                              placeholder="Điểm"
                              aria-label={`Điểm ghi đè, tối đa ${r.points_possible}`}
                              invalid={rawScore !== '' && !validScore}
                              value={rawScore}
                              onChange={(e) => setOverrideDrafts((c) => ({ ...c, [key]: e.target.value }))}
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              loading={savingKey === key}
                              disabled={!validScore}
                              onClick={() => void submitOverride(attempt, r.question_id)}
                            >
                              Ghi đè
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                </CardBody>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
