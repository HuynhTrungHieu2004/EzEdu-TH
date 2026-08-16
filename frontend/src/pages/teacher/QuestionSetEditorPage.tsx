import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  FileText,
  GraduationCap,
  Rocket,
} from 'lucide-react';
import { questionApi } from '../../api/questionApi';
import type {
  QuestionItemUpdatePayload,
  QuestionSetQualityResponse,
  QuestionSetResponse,
  SubjectCatalogNode,
} from '../../api/questionApi';
import { buildEventIdempotencyKey, getLearningSession, trackLearningEvent } from '../../api/learningEventApi';
import QuestionCard from '../../components/QuestionCard';
import { getApiErrorDetail, getBlobErrorDetail, isUnauthorizedError } from '../../api/errors';
import { classesApi } from '../../api/classesApi';
import type { ClassSummary } from '../../types/classes';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Checkbox,
  Dialog,
  DialogFooter,
  ErrorState,
  FormField,
  Input,
  PageHeader,
  RadioCard,
  Select,
  Skeleton,
  Textarea,
  useToast,
} from '../../components/ui';
import '../question-set.css';

type WorkflowStatus = 'draft' | 'review_pending' | 'approved' | 'published';

/** Giải thích cảnh báo chất lượng bằng lời giáo viên hiểu được, không dùng thuật ngữ thống kê. */
const QUALITY_REASON_TEXT: Record<string, string> = {
  negative_discrimination:
    'Học sinh làm tốt cả bài lại sai câu này nhiều hơn học sinh yếu — nhiều khả năng đáp án đang bị sai hoặc câu hỏi gây hiểu nhầm.',
  too_easy: 'Gần như cả lớp đều trả lời đúng, câu này không giúp phân loại được năng lực học sinh.',
  cluster_outlier:
    'Cách học sinh trả lời câu này lệch hẳn so với mọi nhóm câu còn lại trong bộ đề — nên đọc lại nội dung câu hỏi.',
};

const STATUS_LABELS: Record<WorkflowStatus, string> = {
  draft: 'Bản nháp',
  review_pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  published: 'Đã xuất bản',
};

const BLOOM_LABELS: Record<string, { label: string; color: string }> = {
  remember: { label: 'Nhận biết', color: 'var(--ez-green-500)' },
  understand: { label: 'Thông hiểu', color: 'var(--ez-blue-500)' },
  apply: { label: 'Vận dụng', color: 'var(--ez-amber-500)' },
  analyze: { label: 'Vận dụng cao', color: 'var(--ez-red-500)' },
};

function normalizeTags(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Soạn & ban hành đề — dành riêng cho giáo viên.
 *
 * Tách từ `QuestionSetDetailPage` cũ, nơi một component phục vụ cả việc soạn
 * đề của giáo viên lẫn việc làm bài của học sinh, phân biệt bằng state
 * `currentRole` lấy phía client.
 * Xem docs/ui-redesign/01-audit-report.md §6.1 (một component hai vai trò).
 *
 * Khác biệt có chủ đích so với bản gộp: khối "Từ khoá trọng tâm (TF-IDF)" và
 * "Phân bố Bloom" — thuật ngữ kỹ thuật — giờ chỉ hiện ở đây, không còn lộ ra
 * trang làm bài của học sinh.
 */
export default function QuestionSetEditorPage() {
  const { questionSetId } = useParams<{ questionSetId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [questionSet, setQuestionSet] = useState<QuestionSetResponse | null>(null);
  const [quality, setQuality] = useState<QuestionSetQualityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [downloadingFormat, setDownloadingFormat] = useState<'docx' | 'pdf' | null>(null);

  const [studyMode, setStudyMode] = useState(false);
  const [forceReveal, setForceReveal] = useState(false);
  const [previewSelections, setPreviewSelections] = useState<Record<number, string>>({});

  const [editIndex, setEditIndex] = useState(0);
  const [editDraft, setEditDraft] = useState<QuestionItemUpdatePayload & { tagsText: string }>({
    question: '',
    correct_answer: '',
    explanation: '',
    tagsText: '',
  });
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [workflowBusy, setWorkflowBusy] = useState<WorkflowStatus | null>(null);

  const [publishingSet, setPublishingSet] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishAudience, setPublishAudience] = useState<'all' | 'classes'>('all');
  const [subjectOptions, setSubjectOptions] = useState<SubjectCatalogNode[]>([]);
  const [publishSubjectId, setPublishSubjectId] = useState('');
  const [publishChapterId, setPublishChapterId] = useState('');
  const [myClasses, setMyClasses] = useState<ClassSummary[]>([]);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);

  const questionSessionRef = useRef<string | null>(null);
  const explanationViewedRef = useRef<Set<string>>(new Set());

  // Phân tích chất lượng chỉ có nghĩa khi đã có học sinh làm bài. Lỗi ở đây
  // không được chặn màn hình biên tập — đây là thông tin bổ trợ.
  useEffect(() => {
    if (!questionSetId) return;
    let cancelled = false;
    questionApi
      .getQuality(questionSetId)
      .then((data) => {
        if (!cancelled) setQuality(data);
      })
      .catch(() => {
        if (!cancelled) setQuality(null);
      });
    return () => {
      cancelled = true;
    };
  }, [questionSetId]);

  useEffect(() => {
    if (!questionSet?.id) return;
    const session = getLearningSession('question_set', questionSet.id);
    questionSessionRef.current = session.sessionId;
    explanationViewedRef.current = new Set();
  }, [questionSet]);

  const recordExplanationViewed = useCallback(
    (questionIndex: number) => {
      if (!questionSet) return;
      const sessionId = questionSessionRef.current;
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
    [questionSet],
  );

  useEffect(() => {
    if (!questionSetId) return;
    let cancelled = false;
    // `loading` đã khởi tạo là true nên không cần setState đồng bộ ở đây;
    // effect chỉ setState trong callback của promise (đúng khuyến nghị React).
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
        setError('Không tải được chi tiết bộ câu hỏi. Bộ câu hỏi có thể đã bị xoá hoặc không thuộc quyền sở hữu của bạn.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [questionSetId, navigate]);

  useEffect(() => {
    const selected = questionSet?.questions[editIndex];
    if (!selected) return;
    void Promise.resolve().then(() => {
      setEditDraft({
        question: selected.question,
        correct_answer: selected.correct_answer,
        explanation: selected.explanation,
        difficulty: selected.difficulty,
        question_type: selected.question_type,
        bloom_level: selected.bloom_level || undefined,
        tagsText: (selected.tags || []).join(', '),
      });
    });
  }, [questionSet, editIndex]);

  async function handleExport(format: 'docx' | 'pdf') {
    if (!questionSet) return;
    setActionError(null);
    setDownloadingFormat(format);
    try {
      if (format === 'docx') await questionApi.downloadDocx(questionSet.id);
      else await questionApi.downloadPdf(questionSet.id);
    } catch (err: unknown) {
      if (isUnauthorizedError(err)) {
        localStorage.removeItem('access_token');
        navigate('/login');
        return;
      }
      const detail = await getBlobErrorDetail(err);
      setActionError(detail ?? getApiErrorDetail(err) ?? 'Xuất file thất bại. Hãy thử lại sau.');
    } finally {
      setDownloadingFormat(null);
    }
  }

  async function handleSaveQuestion() {
    if (!questionSet) return;
    setSavingQuestion(true);
    setActionError(null);
    try {
      const updated = await questionApi.updateQuestionItem(questionSet.id, editIndex, {
        question: editDraft.question,
        correct_answer: editDraft.correct_answer,
        explanation: editDraft.explanation,
        difficulty: editDraft.difficulty,
        question_type: editDraft.question_type,
        bloom_level: editDraft.bloom_level,
        tags: normalizeTags(editDraft.tagsText),
      });
      setQuestionSet(updated);
      toast({ title: 'Đã lưu câu hỏi', tone: 'success' });
    } catch (err: unknown) {
      setActionError(getApiErrorDetail(err) ?? 'Không lưu được câu hỏi. Hãy kiểm tra nội dung và thử lại.');
    } finally {
      setSavingQuestion(false);
    }
  }

  async function handleWorkflow(nextStatus: WorkflowStatus) {
    if (!questionSet) return;
    setWorkflowBusy(nextStatus);
    setActionError(null);
    try {
      const updated = await questionApi.updateQuestionWorkflow(questionSet.id, editIndex, nextStatus);
      setQuestionSet(updated);
    } catch (err: unknown) {
      setActionError(getApiErrorDetail(err) ?? 'Không cập nhật được trạng thái câu hỏi.');
    } finally {
      setWorkflowBusy(null);
    }
  }

  function openPublishModal() {
    if (!questionSet) return;
    setPublishAudience('all');
    setSelectedClassIds([]);
    setShowPublishModal(true);
    classesApi
      .list()
      .then((data) => setMyClasses(data.items))
      .catch(() => setMyClasses([]));
  }

  function toggleSelectedClass(classId: string) {
    setSelectedClassIds((prev) => (prev.includes(classId) ? prev.filter((id) => id !== classId) : [...prev, classId]));
  }

  useEffect(() => {
    if (!showPublishModal || subjectOptions.length > 0) return;
    const controller = new AbortController();
    // Lỗi ở đây không chặn việc công bố: gắn môn là tuỳ chọn, và chặn giáo viên
    // ban hành đề chỉ vì không tải được danh sách môn là đánh đổi tồi.
    questionApi
      .listSubjectOptions(controller.signal)
      .then(setSubjectOptions)
      .catch(() => {});
    return () => controller.abort();
  }, [showPublishModal, subjectOptions.length]);

  async function confirmPublish() {
    if (!questionSet) return;
    if (publishAudience === 'classes' && selectedClassIds.length === 0) {
      setActionError('Vui lòng chọn ít nhất một lớp để giao đề.');
      return;
    }
    setPublishingSet(true);
    setActionError(null);
    try {
      const updated = await questionApi.publishQuestionSet(questionSet.id, {
        audience_type: publishAudience,
        target_class_ids: publishAudience === 'classes' ? selectedClassIds : [],
        // Chuỗi rỗng thành null: backend phân biệt "không gắn" với "gắn id rỗng",
        // và gửi chuỗi rỗng lên sẽ trượt validate.
        subject_id: publishSubjectId || null,
        chapter_id: publishChapterId || null,
      });
      setQuestionSet(updated);
      setShowPublishModal(false);
      toast({ title: 'Đã ban hành đề thi', tone: 'success' });
    } catch (err: unknown) {
      setActionError(getApiErrorDetail(err) ?? 'Không ban hành được đề thi.');
    } finally {
      setPublishingSet(false);
    }
  }

  if (loading) {
    return (
      <div className="ez-stack">
        <Skeleton height="2rem" width="40%" />
        <Skeleton height="8rem" />
        <Skeleton height="20rem" />
      </div>
    );
  }

  if (error || !questionSet) {
    return (
      <ErrorState
        title="Không tìm thấy bộ câu hỏi"
        description={error ?? undefined}
        actions={<Button onClick={() => navigate('/question-history')}>Về ngân hàng câu hỏi</Button>}
      />
    );
  }

  const selected = questionSet.questions[editIndex];
  const currentStatus = (selected?.status || 'draft') as WorkflowStatus;
  const counts = questionSet.workflow_counts || {};
  const fullyPublished = questionSet.published_question_count === questionSet.question_count;
  const bloomTotal = questionSet.bloom_distribution
    ? Object.values(questionSet.bloom_distribution).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <>
      <PageHeader
        backTo="/question-history"
        backLabel="Quay lại ngân hàng câu hỏi"
        eyebrow="Soạn & ban hành"
        title={questionSet.document_name}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate(`/documents/${questionSet.document_id}`)}>
              <FileText size={16} aria-hidden="true" style={{ marginRight: 6 }} />
              Học liệu gốc
            </Button>
            <Button
              variant="outline"
              loading={downloadingFormat === 'docx'}
              disabled={downloadingFormat !== null}
              onClick={() => handleExport('docx')}
            >
              <Download size={16} aria-hidden="true" style={{ marginRight: 6 }} />
              Tải DOCX
            </Button>
            <Button
              variant="outline"
              loading={downloadingFormat === 'pdf'}
              disabled={downloadingFormat !== null}
              onClick={() => handleExport('pdf')}
            >
              <Download size={16} aria-hidden="true" style={{ marginRight: 6 }} />
              Tải PDF
            </Button>
            <Button
              disabled={fullyPublished || publishingSet}
              loading={publishingSet}
              onClick={openPublishModal}
              leadingIcon={fullyPublished ? <CheckCircle2 size={16} aria-hidden="true" /> : <Rocket size={16} aria-hidden="true" />}
            >
              {fullyPublished ? 'Đã ban hành cho học sinh' : 'Duyệt & ban hành'}
            </Button>
          </>
        }
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

      {quality && quality.status !== 'insufficient_attempts' && quality.flagged.length > 0 && (
        <Card style={{ marginBottom: 'var(--ez-space-6)' }}>
          <CardHeader>
            <div>
              <CardTitle as="h2">
                <AlertTriangle size={16} aria-hidden="true" style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
                Câu hỏi nên rà soát lại
              </CardTitle>
              <p className="qs-quality-sub">
                Dựa trên {quality.attempt_count} lượt làm bài thật.
                {quality.clustering
                  ? ` Phân cụm K-Means thành ${quality.clustering.selected_k} nhóm (silhouette ${quality.clustering.silhouette_score.toFixed(2)}).`
                  : ''}
              </p>
            </div>
          </CardHeader>
          <CardBody>
            <ul className="qs-quality-list">
              {quality.flagged.map((item) => (
                <li key={item.question_index} className="qs-quality-item">
                  <div className="qs-quality-head">
                    <strong>Câu {item.question_index + 1}</strong>
                    <span className="qs-quality-metrics">
                      Tỉ lệ đúng {item.p_value === null ? '—' : `${Math.round(item.p_value * 100)}%`}
                      {' · '}
                      Độ phân biệt {item.discrimination === null ? '—' : item.discrimination.toFixed(2)}
                    </span>
                  </div>
                  <ul className="qs-quality-reasons">
                    {item.reasons.map((reason) => (
                      <li key={reason}>{QUALITY_REASON_TEXT[reason] ?? reason}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {(questionSet.keywords?.length || bloomTotal > 0) && (
        <div className="ez-grid ez-grid-2" style={{ marginBottom: 'var(--ez-space-6)' }}>
          {questionSet.keywords && questionSet.keywords.length > 0 && (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle as="h2">
                    <BarChart3 size={16} aria-hidden="true" style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
                    Từ khoá trọng tâm
                  </CardTitle>
                </div>
              </CardHeader>
              <CardBody>
                <div className="qs-keyword-list">
                  {questionSet.keywords.slice(0, 12).map((kw, idx) => {
                    const maxScore = questionSet.keywords?.[0]?.score || 1;
                    return (
                      <span key={idx} className="qs-keyword-chip" data-strong={kw.score >= maxScore * 0.7}>
                        {kw.keyword}
                      </span>
                    );
                  })}
                </div>
              </CardBody>
            </Card>
          )}

          {bloomTotal > 0 && questionSet.bloom_distribution && (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle as="h2">
                    <GraduationCap size={16} aria-hidden="true" style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
                    Phân bố cấp độ Bloom
                  </CardTitle>
                </div>
              </CardHeader>
              <CardBody>
                <div className="qs-bloom-bar">
                  {Object.entries(questionSet.bloom_distribution).map(([level, cnt]) => {
                    const cfg = BLOOM_LABELS[level];
                    if (!cfg || cnt === 0) return null;
                    const pct = (cnt / bloomTotal) * 100;
                    return (
                      <div
                        key={level}
                        className="qs-bloom-segment"
                        title={`${cfg.label}: ${cnt} câu`}
                        style={{ width: `${pct}%`, backgroundColor: cfg.color }}
                      >
                        {pct >= 20 ? cfg.label : cnt}
                      </div>
                    );
                  })}
                </div>
                <div className="qs-bloom-legend">
                  {Object.entries(questionSet.bloom_distribution).map(([level, cnt]) => {
                    const cfg = BLOOM_LABELS[level];
                    if (!cfg || cnt === 0) return null;
                    return (
                      <span key={level} className="qs-bloom-legend-item">
                        <span className="qs-bloom-dot" style={{ backgroundColor: cfg.color }} />
                        {cfg.label}: <strong>{cnt}</strong>
                      </span>
                    );
                  })}
                </div>
              </CardBody>
            </Card>
          )}
        </div>
      )}

      {selected && (
        <Card style={{ marginBottom: 'var(--ez-space-6)' }}>
          <CardHeader>
            <div>
              <CardTitle as="h2">Duyệt câu hỏi trước khi ban hành</CardTitle>
              <p className="ez-card-desc">
                Nháp: {counts.draft || 0} · Chờ duyệt: {counts.review_pending || 0} · Đã duyệt: {counts.approved || 0} · Đã ban hành:{' '}
                {counts.published || 0}
              </p>
            </div>
            <Badge variant="primary">{STATUS_LABELS[currentStatus]}</Badge>
          </CardHeader>
          <CardBody>
            <div className="ez-stack">
              <div className="qs-editor-grid">
                <FormField label="Chọn câu">
                  <Select value={editIndex} onChange={(event) => setEditIndex(Number(event.target.value))}>
                    {questionSet.questions.map((_, idx) => (
                      <option key={idx} value={idx}>
                        Câu {idx + 1}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Tags">
                  <Input
                    value={editDraft.tagsText}
                    onChange={(event) => setEditDraft((prev) => ({ ...prev, tagsText: event.target.value }))}
                    placeholder="vd: sql, join, chuẩn hoá"
                  />
                </FormField>
              </div>

              <FormField label="Nội dung câu hỏi">
                <Textarea
                  value={editDraft.question || ''}
                  onChange={(event) => setEditDraft((prev) => ({ ...prev, question: event.target.value }))}
                  rows={3}
                />
              </FormField>

              <div className="qs-editor-grid">
                <FormField label="Đáp án đúng">
                  <Input
                    value={editDraft.correct_answer || ''}
                    onChange={(event) => setEditDraft((prev) => ({ ...prev, correct_answer: event.target.value }))}
                  />
                </FormField>
                <FormField label="Mức độ Bloom">
                  <Select
                    value={editDraft.bloom_level || 'understand'}
                    onChange={(event) => setEditDraft((prev) => ({ ...prev, bloom_level: event.target.value }))}
                  >
                    <option value="remember">Nhận biết</option>
                    <option value="understand">Thông hiểu</option>
                    <option value="apply">Vận dụng</option>
                    <option value="analyze">Vận dụng cao</option>
                  </Select>
                </FormField>
              </div>

              <FormField label="Giải thích">
                <Textarea
                  value={editDraft.explanation || ''}
                  onChange={(event) => setEditDraft((prev) => ({ ...prev, explanation: event.target.value }))}
                  rows={3}
                />
              </FormField>

              <div className="qs-editor-actions">
                <Button size="sm" loading={savingQuestion} onClick={handleSaveQuestion}>
                  Lưu sửa / tag
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={workflowBusy !== null || currentStatus !== 'draft'}
                  loading={workflowBusy === 'review_pending'}
                  onClick={() => handleWorkflow('review_pending')}
                >
                  Gửi duyệt
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={workflowBusy !== null || currentStatus !== 'review_pending'}
                  loading={workflowBusy === 'approved'}
                  onClick={() => handleWorkflow('approved')}
                >
                  Duyệt
                </Button>
                <Button
                  size="sm"
                  disabled={workflowBusy !== null || currentStatus !== 'approved'}
                  loading={workflowBusy === 'published'}
                  onClick={() => handleWorkflow('published')}
                >
                  Xuất bản
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={workflowBusy !== null || currentStatus === 'draft'}
                  loading={workflowBusy === 'draft'}
                  onClick={() => handleWorkflow('draft')}
                >
                  Đưa về nháp
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      <Card style={{ marginBottom: 'var(--ez-space-6)' }}>
        <CardBody>
          <div className="qs-study-toggle">
            <span className="ez-row" style={{ fontWeight: 'var(--ez-weight-semibold)' }}>
              Chế độ xem trước (ẩn đáp án)
            </span>
            <Button
              size="sm"
              variant={studyMode ? 'primary' : 'outline'}
              aria-pressed={studyMode}
              onClick={() =>
                setStudyMode((prev) => {
                  const next = !prev;
                  if (!next) setForceReveal(false);
                  return next;
                })
              }
            >
              {studyMode ? 'Đang bật' : 'Đang tắt'}
            </Button>
            {studyMode && (
              <>
                <Button size="sm" variant="ghost" leadingIcon={<Eye size={14} aria-hidden="true" />} onClick={() => setForceReveal(true)}>
                  Hiện tất cả
                </Button>
                <Button size="sm" variant="ghost" leadingIcon={<EyeOff size={14} aria-hidden="true" />} onClick={() => setForceReveal(false)}>
                  Ẩn tất cả
                </Button>
              </>
            )}
          </div>
          {studyMode && (
            <p className="ez-card-desc" style={{ marginTop: 'var(--ez-space-3)' }}>
              Xem trước những gì học sinh sẽ thấy. Đáp án bị ẩn cho tới khi bạn bấm "Hiện đáp án" ở từng câu hoặc "Hiện tất cả" ở trên.
            </p>
          )}
        </CardBody>
      </Card>

      <div className="qs-questions-list">
        {questionSet.questions.map((q, qIdx) => (
          <QuestionCard
            key={qIdx}
            question={q}
            index={qIdx + 1}
            studyMode={studyMode}
            forceReveal={forceReveal}
            savedAnswer={previewSelections[qIdx]}
            onAnswerChange={(idx, answer) => setPreviewSelections((prev) => ({ ...prev, [idx]: answer }))}
            onExplanationViewed={recordExplanationViewed}
            examMode={false}
          />
        ))}
      </div>

      <Dialog
        open={showPublishModal}
        onClose={() => !publishingSet && setShowPublishModal(false)}
        title="Ban hành đề thi"
        description={`Chọn đối tượng học sinh sẽ nhìn thấy ${questionSet.question_count} câu hỏi này.`}
        footer={
          <DialogFooter>
            <Button variant="outline" disabled={publishingSet} onClick={() => setShowPublishModal(false)}>
              Huỷ
            </Button>
            <Button loading={publishingSet} onClick={confirmPublish}>
              Xác nhận ban hành
            </Button>
          </DialogFooter>
        }
      >
        <div className="ez-stack" style={{ marginBottom: 'var(--ez-space-5)' }}>
          {/* Gắn môn là TUỲ CHỌN. Ép buộc sẽ chặn giáo viên công bố nhanh một bộ
              luyện tập, và học liệu chưa gắn vẫn tới được học sinh qua nhóm
              "Chưa phân môn" trong trang Học theo môn. */}
          <FormField label="Môn học (không bắt buộc)">
            <Select
              value={publishSubjectId}
              onChange={(event) => {
                setPublishSubjectId(event.target.value);
                // Đổi môn phải xoá chương: chương của môn cũ không thuộc môn mới
                // nên backend sẽ từ chối, và giáo viên không hiểu vì sao.
                setPublishChapterId('');
              }}
            >
              <option value="">— Chưa phân môn —</option>
              {subjectOptions.map((mon) => (
                <option key={mon.id} value={mon.id}>{mon.name}</option>
              ))}
            </Select>
          </FormField>

          {publishSubjectId && (
            <FormField label="Chương (không bắt buộc)">
              <Select value={publishChapterId} onChange={(event) => setPublishChapterId(event.target.value)}>
                <option value="">— Cả môn —</option>
                {(subjectOptions.find((m) => m.id === publishSubjectId)?.chapters ?? []).map((chuong) => (
                  <option key={chuong.id} value={chuong.id}>{chuong.name}</option>
                ))}
              </Select>
            </FormField>
          )}
        </div>

        <div className="qs-audience-list">
          <RadioCard
            name="publish-audience"
            title="Tất cả học sinh"
            description="Mặc định, như hiện tại"
            checked={publishAudience === 'all'}
            onChange={() => setPublishAudience('all')}
          />
          <RadioCard
            name="publish-audience"
            title="Chỉ giao cho lớp cụ thể"
            checked={publishAudience === 'classes'}
            onChange={() => setPublishAudience('classes')}
          />

          {publishAudience === 'classes' && (
            <div className="qs-class-checklist">
              {myClasses.length === 0 ? (
                <p className="ez-card-desc">
                  Bạn chưa có lớp học nào.{' '}
                  <button
                    type="button"
                    className="ez-btn-link"
                    onClick={() => navigate('/classes')}
                  >
                    Tạo lớp học ngay
                  </button>
                  .
                </p>
              ) : (
                myClasses.map((cls) => (
                  <Checkbox
                    key={cls.id}
                    label={`${cls.name} (${cls.student_count} học sinh)`}
                    checked={selectedClassIds.includes(cls.id)}
                    onChange={() => toggleSelectedClass(cls.id)}
                  />
                ))
              )}
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
}
