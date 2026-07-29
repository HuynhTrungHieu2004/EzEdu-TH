import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { examBankApi } from '../../api/examBankApi';
import type { Attempt, ExamPreviewQuestionItem } from '../../api/examBankApi';
import { getApiErrorDetail } from '../../api/errors';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Dialog,
  DialogFooter,
  ErrorState,
  PageHeader,
  ProgressBar,
  Radio,
  SkeletonText,
  Textarea,
} from '../../components/ui';
import '../question-set.css';

const AUTOSAVE_INTERVAL_MS = 10_000;
const POLL_GRADING_MS = 5_000;

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Làm bài thi có giới hạn thời gian — đồng hồ đếm ngược tính từ `due_at` do
 * SERVER quyết định (không tin đồng hồ máy học sinh): mỗi lần server trả về
 * `server_now`, tính lại độ lệch (`clockOffsetMs`) rồi dùng đồng hồ máy cộng
 * độ lệch để đếm mượt giữa các lần gọi API — không phải polling đếm ngược
 * qua server liên tục.
 */
export default function ExamAttemptPage() {
  const { examId } = useParams<{ examId: string }>();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<ExamPreviewQuestionItem[]>([]);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [remainingMs, setRemainingMs] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);

  const clockOffsetRef = useRef(0); // server_now - Date.now(), cập nhật mỗi lần server trả về
  const dueAtRef = useRef(0);
  const attemptRef = useRef<Attempt | null>(null);
  const answersRef = useRef<Record<string, string>>({});
  const submittingRef = useRef(false);

  const syncClock = useCallback((a: Attempt | { due_at: string; server_now: string }) => {
    clockOffsetRef.current = new Date(a.server_now).getTime() - Date.now();
    dueAtRef.current = new Date(a.due_at).getTime();
  }, []);

  async function load() {
    if (!examId) return;
    setError(null);
    try {
      const started = await examBankApi.startAttempt(examId);
      syncClock(started);

      if (started.status === 'in_progress') {
        const preview = await examBankApi.getExamQuestions(examId);
        setQuestions(preview.questions);
        const full = await examBankApi.getAttempt(started.id);
        syncClock(full);
        setAttempt(full);
        attemptRef.current = full;
        setAnswers(full.answers);
        answersRef.current = full.answers;
      } else {
        const full = await examBankApi.getAttempt(started.id);
        setAttempt(full);
        attemptRef.current = full;
      }
    } catch (err) {
      setError(getApiErrorDetail(err) ?? 'Không tải được đề thi.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  const doSubmit = useCallback(async () => {
    const current = attemptRef.current;
    if (!current || submittingRef.current || current.status !== 'in_progress') return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const result = await examBankApi.submitAttempt(current.id, current.version, answersRef.current);
      syncClock(result);
      setAttempt(result);
      attemptRef.current = result;
    } catch (err) {
      setSaveError(getApiErrorDetail(err) ?? 'Nộp bài thất bại — thử lại.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [syncClock]);

  // Nộp thủ công là hành động không thể hoàn tác — cần xác nhận. Tự nộp khi
  // hết giờ (§ "Đếm ngược") KHÔNG qua xác nhận vì đó không phải lựa chọn của
  // học sinh.
  function requestSubmit() {
    setConfirmSubmitOpen(true);
  }
  async function confirmSubmit() {
    setConfirmSubmitOpen(false);
    await doSubmit();
  }

  // Đếm ngược mỗi giây — Lớp tự nộp #1: tự gọi submit khi về 0.
  useEffect(() => {
    if (!attempt || attempt.status !== 'in_progress') return;
    const tick = () => {
      const remaining = dueAtRef.current - (Date.now() + clockOffsetRef.current);
      setRemainingMs(remaining);
      if (remaining <= 0) {
        void doSubmit();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [attempt, doSubmit]);

  // Tự lưu định kỳ.
  useEffect(() => {
    if (!attempt || attempt.status !== 'in_progress') return;
    const id = setInterval(async () => {
      const current = attemptRef.current;
      if (!current || current.status !== 'in_progress') return;
      try {
        const saved = await examBankApi.autosaveAttempt(current.id, current.version, answersRef.current);
        syncClock(saved);
        setAttempt(saved);
        attemptRef.current = saved;
        if (saved.status !== 'in_progress') {
          setSaveError('Đã hết giờ — bài được tự động nộp.');
        }
      } catch (err) {
        setSaveError(getApiErrorDetail(err) ?? 'Tự động lưu thất bại.');
      }
    }, AUTOSAVE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [attempt, syncClock]);

  // Sau khi nộp, nếu còn câu tự luận chờ AI chấm — hỏi lại định kỳ tới khi "graded".
  useEffect(() => {
    if (!attempt || attempt.status !== 'submitted') return;
    const id = setInterval(async () => {
      const result = await examBankApi.getAttempt(attempt.id);
      setAttempt(result);
      attemptRef.current = result;
    }, POLL_GRADING_MS);
    return () => clearInterval(id);
  }, [attempt]);

  function setAnswer(questionId: string, value: string) {
    const next = { ...answersRef.current, [questionId]: value };
    answersRef.current = next;
    setAnswers(next);
  }

  const maxScore = useMemo(() => questions.reduce((sum, q) => sum + q.points, 0), [questions]);

  if (loading) {
    return (
      <div className="ez-stack">
        <SkeletonText lines={2} />
        <SkeletonText lines={10} />
      </div>
    );
  }

  if (error || !attempt) {
    return <ErrorState title="Không tải được đề thi" description={error ?? undefined} actions={<Button onClick={() => void load()}>Thử lại</Button>} />;
  }

  if (attempt.status !== 'in_progress') {
    return (
      <>
        <PageHeader eyebrow={`Mã đề ${attempt.exam_code}`} title="Kết quả bài làm" />
        <Card style={{ marginBottom: 'var(--ez-space-6)' }}>
          <CardBody style={{ display: 'flex', gap: 'var(--ez-space-6)', alignItems: 'center', flexWrap: 'wrap' }}>
            <Badge variant={attempt.status === 'graded' ? 'success' : 'warning'}>
              {attempt.status === 'graded' ? 'Đã chấm xong' : 'Đang chấm câu tự luận…'}
            </Badge>
            <strong>
              {attempt.total_score} / {attempt.max_score} điểm
            </strong>
            {attempt.auto_submitted && <span>Bài đã được tự động nộp khi hết giờ.</span>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle as="h2">Chi tiết từng câu</CardTitle>
            </div>
          </CardHeader>
          <CardBody className="ez-stack">
            {attempt.results.map((r, idx) => (
              <div key={r.question_id} className="dash-row" style={{ alignItems: 'flex-start' }}>
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
                          {r.ai_feedback && <span>{r.ai_feedback}</span>}
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
          </CardBody>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={`Mã đề ${attempt.exam_code}`}
        title="Đang làm bài"
        description={`${questions.length} câu · ${maxScore} điểm`}
        actions={
          <Badge variant={remainingMs < 60_000 ? 'error' : 'primary'} style={{ fontSize: '1.1rem', padding: 'var(--ez-space-2) var(--ez-space-4)' }}>
            {formatRemaining(remainingMs)}
          </Badge>
        }
      />

      {saveError && (
        <Alert tone="warning" style={{ marginBottom: 'var(--ez-space-4)' }}>
          {saveError}
        </Alert>
      )}

      <div className="ez-stack">
        {questions.map((q, idx) => (
          <Card key={q.question_id}>
            <CardHeader>
              <div>
                <CardTitle as="h2">
                  Câu {idx + 1} ({q.points} điểm)
                </CardTitle>
              </div>
            </CardHeader>
            <CardBody className="ez-stack">
              <p>{q.content}</p>
              {q.question_type === 'multiple_choice' && q.options && (
                <div className="ez-stack" style={{ gap: 'var(--ez-space-2)' }}>
                  {Object.entries(q.options).map(([key, text]) => (
                    <Radio
                      key={key}
                      name={q.question_id}
                      label={`${key}. ${text}`}
                      checked={answers[q.question_id] === key}
                      onChange={() => setAnswer(q.question_id, key)}
                    />
                  ))}
                </div>
              )}
              {q.question_type === 'true_false' && (
                <div className="ez-stack" style={{ gap: 'var(--ez-space-2)' }}>
                  <Radio
                    name={q.question_id}
                    label="Đúng"
                    checked={answers[q.question_id] === 'true'}
                    onChange={() => setAnswer(q.question_id, 'true')}
                  />
                  <Radio
                    name={q.question_id}
                    label="Sai"
                    checked={answers[q.question_id] === 'false'}
                    onChange={() => setAnswer(q.question_id, 'false')}
                  />
                </div>
              )}
              {q.question_type === 'short_answer' && (
                <Textarea
                  rows={3}
                  value={answers[q.question_id] ?? ''}
                  onChange={(e) => setAnswer(q.question_id, e.target.value)}
                  placeholder="Nhập câu trả lời…"
                />
              )}
            </CardBody>
          </Card>
        ))}
      </div>

      <div style={{ margin: 'var(--ez-space-6) 0' }}>
        <ProgressBar
          value={Object.keys(answers).length}
          max={questions.length}
          showHeader
          label="Đã trả lời"
          valueText={`${Object.keys(answers).length}/${questions.length}`}
        />
      </div>

      <Button loading={submitting} onClick={requestSubmit}>
        Nộp bài
      </Button>

      <Dialog
        open={confirmSubmitOpen}
        onClose={() => setConfirmSubmitOpen(false)}
        title="Nộp bài thi?"
        description={`Bạn đã trả lời ${Object.keys(answers).length}/${questions.length} câu. Sau khi nộp, bạn không thể sửa lại câu trả lời.`}
        footer={
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmSubmitOpen(false)}>
              Tiếp tục làm bài
            </Button>
            <Button loading={submitting} onClick={() => void confirmSubmit()}>
              Nộp bài
            </Button>
          </DialogFooter>
        }
      />
    </>
  );
}
