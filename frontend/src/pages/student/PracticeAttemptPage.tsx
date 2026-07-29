import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { questionApi } from '../../api/questionApi';
import type { QuestionAttemptResponse, QuestionSetResponse } from '../../api/questionApi';
import { buildEventIdempotencyKey, getLearningSession, trackLearningEvent } from '../../api/learningEventApi';
import QuestionCard from '../../components/QuestionCard';
import { getApiErrorDetail, isUnauthorizedError } from '../../api/errors';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  ErrorState,
  PageHeader,
  Skeleton,
} from '../../components/ui';
import '../question-set.css';

/**
 * Làm bài — dành riêng cho học sinh.
 *
 * Tách từ `QuestionSetDetailPage` cũ (một component phục vụ cả soạn đề của
 * giáo viên lẫn làm bài của học sinh). Trang này không còn hiện khối "Từ khoá
 * trọng tâm (TF-IDF)" và "Phân bố Bloom" — thuật ngữ kỹ thuật không thuộc về
 * trải nghiệm làm bài của học sinh — những khối đó giờ chỉ còn ở trang soạn
 * đề của giáo viên.
 * Xem docs/ui-redesign/01-audit-report.md §6.1 và §6.3 (lỗi M2).
 */
export default function PracticeAttemptPage() {
  const { questionSetId } = useParams<{ questionSetId: string }>();
  const navigate = useNavigate();

  const [questionSet, setQuestionSet] = useState<QuestionSetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [attemptAnswers, setAttemptAnswers] = useState<Record<number, string>>({});
  const [attemptSubmitting, setAttemptSubmitting] = useState(false);
  const [attemptResult, setAttemptResult] = useState<QuestionAttemptResponse | null>(null);

  const questionSessionRef = useRef<string | null>(null);
  const pageStartedAtRef = useRef(0);
  const questionStartedAtRef = useRef<Record<number, number>>({});
  const answerChangeCountRef = useRef<Record<number, number>>({});
  const startedQuestionsRef = useRef<Set<number>>(new Set());
  const explanationViewedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!questionSet?.id) return;
    const session = getLearningSession('question_set', questionSet.id);
    questionSessionRef.current = session.sessionId;
    pageStartedAtRef.current = Date.now();
    questionStartedAtRef.current = {};
    answerChangeCountRef.current = {};
    startedQuestionsRef.current = new Set();
    explanationViewedRef.current = new Set();
  }, [questionSet]);

  const getQuestionSessionId = useCallback(() => {
    if (!questionSet?.id) return null;
    if (!questionSessionRef.current) {
      questionSessionRef.current = getLearningSession('question_set', questionSet.id).sessionId;
    }
    return questionSessionRef.current;
  }, [questionSet]);

  const recordQuestionStarted = useCallback(
    (questionIndex: number) => {
      if (!questionSet) return;
      const sessionId = getQuestionSessionId();
      if (!sessionId || startedQuestionsRef.current.has(questionIndex)) return;

      startedQuestionsRef.current.add(questionIndex);
      questionStartedAtRef.current[questionIndex] = Date.now();
      const itemId = `${questionSet.id}:${questionIndex}`;
      trackLearningEvent({
        event_type: 'question_started',
        item_id: itemId,
        document_id: questionSet.document_id,
        session_id: sessionId,
        idempotency_key: buildEventIdempotencyKey([sessionId, itemId, 'question_started']),
        metadata: { question_set_id: questionSet.id, question_index: questionIndex },
      });
    },
    [getQuestionSessionId, questionSet],
  );

  const recordExplanationViewed = useCallback(
    (questionIndex: number) => {
      if (!questionSet) return;
      const sessionId = getQuestionSessionId();
      if (!sessionId) return;
      const itemId = `${questionSet.id}:${questionIndex}`;
      const key = buildEventIdempotencyKey([sessionId, itemId, 'explanation_viewed']);
      if (explanationViewedRef.current.has(key)) return;

      explanationViewedRef.current.add(key);
      trackLearningEvent({
        event_type: 'explanation_viewed',
        item_id: itemId,
        document_id: questionSet.document_id,
        session_id: sessionId,
        idempotency_key: key,
        metadata: { question_set_id: questionSet.id, question_index: questionIndex },
      });
    },
    [getQuestionSessionId, questionSet],
  );

  useEffect(() => {
    if (!questionSetId) return;
    let cancelled = false;
    // `loading` đã khởi tạo là true nên không cần setState đồng bộ ở đây.
    questionApi
      .get(questionSetId)
      .then((response) => {
        if (cancelled) return;
        setQuestionSet(response);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (isUnauthorizedError(err)) {
          localStorage.removeItem('access_token');
          navigate('/login');
          return;
        }
        setError('Không tải được bài luyện tập. Bài có thể đã bị gỡ hoặc không dành cho bạn.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [questionSetId, navigate]);

  function handleAnswerChange(questionIndex: number, answer: string) {
    recordQuestionStarted(questionIndex);
    answerChangeCountRef.current[questionIndex] = (answerChangeCountRef.current[questionIndex] || 0) + 1;
    setAttemptAnswers((prev) => ({ ...prev, [questionIndex]: answer }));
  }

  async function handleSubmitAttempt() {
    if (!questionSet) return;
    const submittedAt = Date.now();
    setAttemptSubmitting(true);
    setActionError(null);
    try {
      Object.keys(attemptAnswers).forEach((questionIndex) => recordQuestionStarted(Number(questionIndex)));

      const result = await questionApi.submitAttempt(
        questionSet.id,
        Object.entries(attemptAnswers).map(([questionIndex, answer]) => ({
          question_index: Number(questionIndex),
          answer,
        })),
      );
      setAttemptResult(result);

      const sessionId = getQuestionSessionId();
      if (sessionId) {
        result.answers.forEach((answerResult) => {
          const itemId = `${questionSet.id}:${answerResult.question_index}`;
          const startedAt = questionStartedAtRef.current[answerResult.question_index] || pageStartedAtRef.current;
          trackLearningEvent({
            event_type: 'question_answered',
            item_id: itemId,
            document_id: result.document_id,
            session_id: sessionId,
            idempotency_key: buildEventIdempotencyKey([sessionId, itemId, result.id, 'question_answered']),
            is_correct: answerResult.is_correct,
            score: answerResult.is_correct ? 1 : 0,
            response_time_ms: Math.max(0, submittedAt - startedAt),
            attempt_number: 1,
            hint_count: 0,
            answer_change_count: answerChangeCountRef.current[answerResult.question_index] || 0,
            completed: true,
            metadata: {
              attempt_id: result.id,
              question_set_id: questionSet.id,
              question_index: answerResult.question_index,
            },
          });
        });
      }
    } catch (err: unknown) {
      setActionError(getApiErrorDetail(err) ?? 'Không lưu được kết quả làm bài.');
    } finally {
      setAttemptSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="ez-stack">
        <Skeleton height="2rem" width="40%" />
        <Skeleton height="6rem" />
        <Skeleton height="20rem" />
      </div>
    );
  }

  if (error || !questionSet) {
    return (
      <ErrorState
        title="Không tìm thấy bài luyện tập"
        description={error ?? undefined}
        actions={<Button onClick={() => navigate('/published-questions')}>Về bài luyện tập</Button>}
      />
    );
  }

  return (
    <>
      <PageHeader
        backTo="/published-questions"
        backLabel="Về bài luyện tập"
        eyebrow="Làm bài"
        title={questionSet.document_name}
      />

      {actionError && (
        <Alert tone="error" style={{ marginBottom: 'var(--ez-space-6)' }}>
          {actionError}
        </Alert>
      )}

      <Card style={{ marginBottom: 'var(--ez-space-6)' }}>
        <CardBody>
          <div className="qs-meta-grid">
            <div className="qs-meta-badge">
              <strong>Độ khó:</strong>
              {questionSet.difficulty === 'easy' ? 'Dễ' : questionSet.difficulty === 'medium' ? 'Trung bình' : 'Khó'}
            </div>
            <div className="qs-meta-badge">
              <strong>Dạng câu hỏi:</strong>
              {questionSet.question_type === 'multiple_choice'
                ? 'Trắc nghiệm khách quan'
                : questionSet.question_type === 'true_false'
                  ? 'Đúng/Sai'
                  : 'Tự luận ngắn'}
            </div>
            <div className="qs-meta-badge">
              <strong>Tổng số câu hỏi:</strong>
              {questionSet.question_count} câu
            </div>
          </div>
        </CardBody>
      </Card>

      <Card style={{ marginBottom: 'var(--ez-space-6)' }}>
        <CardHeader>
          <div>
            <CardTitle as="h2">Nộp bài và lưu điểm</CardTitle>
            <p className="ez-card-desc">
              Hệ thống sẽ chấm theo đáp án của bộ câu hỏi và lưu lịch sử làm bài cho tài khoản của bạn.
            </p>
          </div>
        </CardHeader>
        <CardBody>
          <Button loading={attemptSubmitting} onClick={handleSubmitAttempt}>
            Nộp bài và lưu điểm
          </Button>
          {attemptResult && (
            <div className="qs-result-box" style={{ marginTop: 'var(--ez-space-4)' }}>
              Kết quả gần nhất: <strong>{attemptResult.score}/{attemptResult.max_score}</strong> câu đúng ({attemptResult.percent}%)
            </div>
          )}
        </CardBody>
      </Card>

      <div className="qs-questions-list">
        {questionSet.questions.map((q, qIdx) => (
          <QuestionCard
            key={qIdx}
            question={q}
            index={qIdx + 1}
            savedAnswer={attemptAnswers[qIdx]}
            onAnswerChange={handleAnswerChange}
            onExplanationViewed={recordExplanationViewed}
            examMode
            submittedResult={attemptResult?.answers.find((answer) => answer.question_index === qIdx)}
          />
        ))}
      </div>
    </>
  );
}
