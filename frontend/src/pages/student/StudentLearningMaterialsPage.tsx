import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { FileText, RefreshCw } from 'lucide-react';
import { documentApi } from '../../api/documentApi';
import { getApiErrorDetail } from '../../api/errors';
import { studentReviewApi } from '../../api/studentReviewApi';
import type {
  ClassificationInput,
  ReviewDifficulty,
  StudentReview,
  TaxonomyOption,
} from '../../api/studentReviewApi';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Checkbox,
  FormField,
  Input,
  PageHeader,
  ProgressBar,
  ProgressSteps,
  Select,
} from '../../components/ui';
import type { ProgressStep } from '../../components/ui';
import {
  filterTaxonomyOptions,
  reconcileTaxonomySelection,
  retryLabelForFailedStep,
  shouldPollReview,
  validateLearningMaterialFile,
} from './studentLearningMaterialsWorkflow';

type ProcessingPhase = 'idle' | 'uploading' | 'extracting' | 'indexing' | 'creating_review';

const POLL_INTERVAL_MS = 2000;
const EMPTY_CLASSIFICATION: ClassificationInput = {
  subjectId: '',
  grade: 0,
  curriculumVersion: '',
  chapterId: '',
  topicIds: [],
};

const PROCESSING_TEXT: Record<Exclude<ProcessingPhase, 'idle'>, string> = {
  uploading: 'Đang tải học liệu lên hệ thống…',
  extracting: 'Đang trích xuất nội dung…',
  indexing: 'Đang lập chỉ mục học liệu…',
  creating_review: 'Đang khởi tạo bộ ôn tập…',
};

function safeApiError(error: unknown, fallback: string): string {
  return getApiErrorDetail(error) ?? fallback;
}

function uniqueGrades(options: TaxonomyOption[], fallback?: number): number[] {
  const values = options.flatMap((option) => option.grade === undefined ? [] : [option.grade]);
  if (fallback) values.push(fallback);
  return [...new Set(values)].sort((a, b) => a - b);
}

function uniqueCurriculumVersions(options: TaxonomyOption[], fallback?: string): string[] {
  const values = options.flatMap((option) => option.curriculumVersion ? [option.curriculumVersion] : []);
  if (fallback) values.push(fallback);
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'vi'));
}

export default function StudentLearningMaterialsPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const errorFocusRef = useRef<HTMLDivElement>(null);
  const clientRequestIdRef = useRef<string | null>(null);
  const workflowRunRef = useRef(0);
  const workflowPendingRef = useRef(false);
  const confirmationPendingRef = useRef(false);
  const generationPendingRef = useRef(false);
  const retryPendingRef = useRef(false);

  const [file, setFile] = useState<File | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [phase, setPhase] = useState<ProcessingPhase>('idle');
  const [uploadPercent, setUploadPercent] = useState(0);
  const [review, setReview] = useState<StudentReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollRestart, setPollRestart] = useState(0);
  const [taxonomyRestart, setTaxonomyRestart] = useState(0);
  const [taxonomy, setTaxonomy] = useState<TaxonomyOption[]>([]);
  const [classification, setClassification] = useState<ClassificationInput>(EMPTY_CLASSIFICATION);
  const [confirming, setConfirming] = useState(false);
  const [title, setTitle] = useState('');
  const [questionCount, setQuestionCount] = useState(10);
  const [difficulty, setDifficulty] = useState<ReviewDifficulty>('medium');
  const [generating, setGenerating] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const reviewId = review?.id;
  const reviewStatus = review?.status;
  const isProcessing = phase !== 'idle';

  useEffect(() => () => {
    workflowRunRef.current += 1;
  }, []);

  useEffect(() => {
    if (error || reviewStatus === 'failed') errorFocusRef.current?.focus();
  }, [error, reviewStatus]);

  useEffect(() => {
    if (!reviewId || !reviewStatus || !shouldPollReview(reviewStatus)) return;

    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      if (!active) return;
      setError(null);
      try {
        const next = await studentReviewApi.get(reviewId);
        if (!active) return;
        setReview(next);
        if (next.status === 'ready_to_generate') {
          setTitle((current) => current || next.title);
        }
        if (shouldPollReview(next.status)) {
          timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
        }
      } catch (pollError: unknown) {
        if (active) {
          setError(safeApiError(pollError, 'Không thể cập nhật trạng thái bộ ôn tập.'));
          timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
        }
      }
    };

    timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [pollRestart, reviewId, reviewStatus]);

  const classificationForConfirmation = reviewStatus === 'needs_confirmation'
    ? review?.classification
    : undefined;

  useEffect(() => {
    if (!reviewId || !classificationForConfirmation) return;

    let active = true;
    void studentReviewApi.taxonomyOptions().then((options) => {
      if (!active) return;
      if (options.length === 0) {
        setError('Danh mục phân loại hiện đang trống.');
        return;
      }
      setTaxonomy(options);
      setClassification(reconcileTaxonomySelection(options, {
        subjectId: classificationForConfirmation.subjectId,
        grade: classificationForConfirmation.grade,
        curriculumVersion: classificationForConfirmation.curriculumVersion,
        chapterId: classificationForConfirmation.chapterId,
        topicIds: [...classificationForConfirmation.topicIds],
      }));
    }).catch((taxonomyError: unknown) => {
      if (active) {
        setError(safeApiError(taxonomyError, 'Không thể tải danh mục phân loại.'));
      }
    });

    return () => {
      active = false;
    };
  }, [classificationForConfirmation, reviewId, taxonomyRestart]);

  function reset() {
    workflowRunRef.current += 1;
    workflowPendingRef.current = false;
    confirmationPendingRef.current = false;
    generationPendingRef.current = false;
    retryPendingRef.current = false;
    clientRequestIdRef.current = null;
    setFile(null);
    setDocumentId(null);
    setPhase('idle');
    setUploadPercent(0);
    setReview(null);
    setError(null);
    setTaxonomy([]);
    setClassification(EMPTY_CLASSIFICATION);
    setConfirming(false);
    setTitle('');
    setQuestionCount(10);
    setDifficulty('medium');
    setGenerating(false);
    setRetrying(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function processFile(selected: File, existingDocumentId: string | null = null) {
    if (workflowPendingRef.current) return;
    workflowPendingRef.current = true;
    const runId = ++workflowRunRef.current;
    const isCurrent = () => workflowRunRef.current === runId;
    setError(null);

    try {
      let nextDocumentId = existingDocumentId;
      if (!nextDocumentId) {
        setPhase('uploading');
        setUploadPercent(0);
        const uploaded = await documentApi.upload(selected, (percent) => {
          if (isCurrent()) setUploadPercent(percent);
        });
        if (!isCurrent()) return;
        nextDocumentId = uploaded.document_id;
        setDocumentId(nextDocumentId);
      }

      setPhase('extracting');
      try {
        await documentApi.extract(nextDocumentId);
      } catch (extractError: unknown) {
        const detail = getApiErrorDetail(extractError)?.toLowerCase();
        if (!detail?.includes('already been extracted')) throw extractError;
      }
      if (!isCurrent()) return;

      setPhase('indexing');
      try {
        await documentApi.index(nextDocumentId);
      } catch (indexError: unknown) {
        const detail = getApiErrorDetail(indexError)?.toLowerCase();
        if (!detail?.includes('already indexed')) throw indexError;
      }
      if (!isCurrent()) return;

      setPhase('creating_review');
      const clientRequestId = clientRequestIdRef.current ?? crypto.randomUUID();
      clientRequestIdRef.current = clientRequestId;
      const created = await studentReviewApi.create({
        documentId: nextDocumentId,
        clientRequestId,
      });
      if (!isCurrent()) return;
      setReview(created);
      setTitle(created.title);
    } catch (workflowError: unknown) {
      if (isCurrent()) {
        setError(safeApiError(workflowError, 'Không thể xử lý học liệu. Vui lòng thử lại.'));
      }
    } finally {
      if (isCurrent()) setPhase('idle');
      workflowPendingRef.current = false;
    }
  }

  function selectFile(selected: File) {
    const validationError = validateLearningMaterialFile(selected);
    if (validationError) {
      setError(validationError);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setFile(selected);
    setDocumentId(null);
    setReview(null);
    clientRequestIdRef.current = crypto.randomUUID();
    void processFile(selected);
  }

  function updateClassification(next: ClassificationInput) {
    setClassification(reconcileTaxonomySelection(taxonomy, next));
  }

  async function confirmClassification(event: FormEvent) {
    event.preventDefault();
    if (!review || confirmationPendingRef.current) return;
    if (!classification.subjectId || !classification.grade
      || !classification.curriculumVersion || !classification.chapterId) {
      setError('Vui lòng chọn đủ môn học, khối lớp, chương trình và chương.');
      return;
    }

    confirmationPendingRef.current = true;
    setConfirming(true);
    setError(null);
    try {
      const confirmed = await studentReviewApi.confirmClassification(review.id, classification);
      setReview(confirmed);
      setTitle((current) => current || confirmed.title);
    } catch (confirmationError: unknown) {
      setError(safeApiError(confirmationError, 'Không thể xác nhận phân loại.'));
    } finally {
      confirmationPendingRef.current = false;
      setConfirming(false);
    }
  }

  async function generateReview(event: FormEvent) {
    event.preventDefault();
    if (!review || generationPendingRef.current) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle || trimmedTitle.length > 120) {
      setError('Tiêu đề phải có từ 1 đến 120 ký tự.');
      return;
    }
    if (!Number.isInteger(questionCount) || questionCount < 3 || questionCount > 50) {
      setError('Số câu hỏi phải từ 3 đến 50.');
      return;
    }

    generationPendingRef.current = true;
    setGenerating(true);
    setError(null);
    try {
      setReview(await studentReviewApi.generate(review.id, {
        title: trimmedTitle,
        questionCount,
        difficulty,
        questionType: 'multiple_choice',
      }));
      setTitle(trimmedTitle);
    } catch (generationError: unknown) {
      setError(safeApiError(generationError, 'Không thể bắt đầu tạo bộ đề.'));
    } finally {
      generationPendingRef.current = false;
      setGenerating(false);
    }
  }

  async function retryFailedReview() {
    if (!review || !review.failedStep || retryPendingRef.current) return;
    retryPendingRef.current = true;
    setRetrying(true);
    setError(null);
    try {
      setReview(await studentReviewApi.retry(review.id));
    } catch (retryError: unknown) {
      setError(safeApiError(retryError, 'Không thể thử lại bước bị lỗi.'));
    } finally {
      retryPendingRef.current = false;
      setRetrying(false);
    }
  }

  const aiClassification = review?.classification;
  const failedRetryLabel = retryLabelForFailedStep(review?.failedStep);
  const taxonomyLoading = reviewStatus === 'needs_confirmation' && taxonomy.length === 0 && !error;
  const grades = uniqueGrades(taxonomy, aiClassification?.grade);
  const curriculumVersions = uniqueCurriculumVersions(
    taxonomy,
    aiClassification?.curriculumVersion,
  );
  const subjects = filterTaxonomyOptions(taxonomy, 'subject', {
    grade: classification.grade || undefined,
    curriculumVersion: classification.curriculumVersion || undefined,
  });
  const chapters = filterTaxonomyOptions(taxonomy, 'chapter', {
    parentId: classification.subjectId,
    grade: classification.grade || undefined,
    curriculumVersion: classification.curriculumVersion || undefined,
  });
  const topics = filterTaxonomyOptions(taxonomy, 'topic', {
    parentId: classification.chapterId,
    grade: classification.grade || undefined,
    curriculumVersion: classification.curriculumVersion || undefined,
  });

  const uploadStepStatus: ProgressStep['status'] = review
    ? 'done'
    : error && file ? 'error' : isProcessing ? 'active' : 'pending';
  const classificationStepStatus: ProgressStep['status'] = reviewStatus === 'classifying'
    || reviewStatus === 'needs_confirmation'
    ? 'active'
    : reviewStatus === 'ready_to_generate' || reviewStatus === 'generating' || reviewStatus === 'ready'
      ? 'done'
      : reviewStatus === 'failed' ? 'error' : 'pending';
  const generationStepStatus: ProgressStep['status'] = reviewStatus === 'ready_to_generate'
    || reviewStatus === 'generating'
    ? 'active'
    : reviewStatus === 'ready' ? 'done' : reviewStatus === 'failed' ? 'error' : 'pending';
  const progressSteps: ProgressStep[] = [
    { id: 'upload', label: 'Tải lên và xử lý', status: uploadStepStatus },
    { id: 'classification', label: 'Xác nhận phân loại', status: classificationStepStatus },
    { id: 'generation', label: 'Cấu hình và tạo bộ đề', status: generationStepStatus },
  ];
  const liveStatus = isProcessing
    ? PROCESSING_TEXT[phase]
    : reviewStatus === 'classifying'
      ? 'AI đang phân loại học liệu…'
      : reviewStatus === 'generating'
        ? 'AI đang tạo bộ câu hỏi ôn tập…'
        : reviewStatus === 'needs_confirmation'
          ? 'Cần xác nhận phân loại trước khi tiếp tục.'
          : reviewStatus === 'ready_to_generate'
            ? 'Phân loại đã xác nhận. Hãy cấu hình bộ đề.'
            : reviewStatus === 'ready'
              ? 'Bộ đề đã sẵn sàng.'
              : 'Chọn học liệu để bắt đầu.';

  return (
    <>
      <PageHeader
        eyebrow="Học liệu số"
        title="Tạo bộ ôn tập từ học liệu"
        description="Tải tài liệu, xác nhận phân loại và tạo bộ câu hỏi trắc nghiệm."
      />

      <Card style={{ marginBottom: 'var(--ez-space-6)' }}>
        <CardBody className="ez-stack">
          <ProgressSteps steps={progressSteps} />
          <div
            role="status"
            aria-live="polite"
            aria-busy={(isProcessing || shouldPollReview(reviewStatus ?? 'failed')) || undefined}
          >
            {liveStatus}
          </div>
          {phase === 'uploading' ? (
            <ProgressBar
              value={uploadPercent}
              label="Tiến độ tải học liệu"
              valueText={`${uploadPercent}%`}
              showHeader
            />
          ) : null}
        </CardBody>
      </Card>

      {error && reviewStatus !== 'failed' ? (
        <div ref={errorFocusRef} tabIndex={-1} style={{ marginBottom: 'var(--ez-space-6)' }}>
          <Alert tone="error">{error}</Alert>
          <div className="ez-row ez-row-wrap" style={{ marginTop: 'var(--ez-space-3)' }}>
            {!review && file ? (
              <>
                <Button
                  variant="outline"
                  leadingIcon={<RefreshCw size={16} aria-hidden="true" />}
                  onClick={() => void processFile(file, documentId)}
                >
                  Thử lại xử lý
                </Button>
                <Button variant="ghost" onClick={reset}>Chọn học liệu khác</Button>
              </>
            ) : null}
            {review && shouldPollReview(review.status) ? (
              <Button variant="outline" onClick={() => {
                setError(null);
                setPollRestart((value) => value + 1);
              }}>
                Kiểm tra lại
              </Button>
            ) : null}
            {reviewStatus === 'needs_confirmation' && !taxonomyLoading && taxonomy.length === 0 ? (
              <Button variant="outline" onClick={() => {
                setError(null);
                setTaxonomyRestart((value) => value + 1);
              }}>
                Tải lại danh mục
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {!file && !review ? (
        <Card>
          <CardHeader><CardTitle as="h2">Học liệu</CardTitle></CardHeader>
          <CardBody>
            <FormField
              label="Tải học liệu"
              required
              hint="PDF, DOCX hoặc PPTX; dung lượng tối đa 20MB."
            >
              <input
                ref={fileInputRef}
                className="ez-input"
                type="file"
                accept=".pdf,.docx,.pptx"
                onChange={(event) => {
                  const selected = event.currentTarget.files?.[0];
                  if (selected) selectFile(selected);
                }}
              />
            </FormField>
          </CardBody>
        </Card>
      ) : null}

      {file && !review ? (
        <Card>
          <CardHeader><CardTitle as="h2">Học liệu đang xử lý</CardTitle></CardHeader>
          <CardBody className="ez-row">
            <FileText size={20} aria-hidden="true" />
            <div>
              <strong>{file.name}</strong>
              <div className="ez-card-desc">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {reviewStatus === 'needs_confirmation' ? (
        <Card>
          <CardHeader><CardTitle as="h2">Xác nhận phân loại</CardTitle></CardHeader>
          <CardBody>
            {taxonomyLoading ? (
              <div role="status" aria-live="polite" aria-busy="true">Đang tải danh mục…</div>
            ) : taxonomy.length ? (
              <form className="ez-stack ez-stack-lg" onSubmit={(event) => void confirmClassification(event)}>
                <div className="ez-grid ez-grid-2">
                  <FormField label="Khối lớp" required>
                    <Select
                      value={classification.grade || ''}
                      disabled={confirming}
                      onChange={(event) => updateClassification({
                        ...classification,
                        grade: Number(event.target.value),
                      })}
                      placeholder="Chọn khối lớp"
                      options={grades.map((grade) => ({ value: String(grade), label: `Lớp ${grade}` }))}
                    />
                  </FormField>
                  <FormField label="Chương trình" required>
                    <Select
                      value={classification.curriculumVersion}
                      disabled={confirming}
                      onChange={(event) => updateClassification({
                        ...classification,
                        curriculumVersion: event.target.value,
                      })}
                      placeholder="Chọn chương trình"
                      options={curriculumVersions.map((version) => ({ value: version, label: version }))}
                    />
                  </FormField>
                  <FormField label="Môn học" required>
                    <Select
                      value={classification.subjectId}
                      disabled={confirming}
                      onChange={(event) => updateClassification({
                        ...classification,
                        subjectId: event.target.value,
                      })}
                      placeholder="Chọn môn học"
                      options={subjects.map((option) => ({ value: option.id, label: option.name }))}
                    />
                  </FormField>
                  <FormField label="Chương" required>
                    <Select
                      value={classification.chapterId}
                      disabled={confirming || !classification.subjectId}
                      onChange={(event) => updateClassification({
                        ...classification,
                        chapterId: event.target.value,
                      })}
                      placeholder="Chọn chương"
                      options={chapters.map((option) => ({ value: option.id, label: option.name }))}
                    />
                  </FormField>
                </div>

                <fieldset className="ez-stack ez-stack-sm" disabled={confirming || !classification.chapterId}>
                  <legend className="ez-label">Chủ đề</legend>
                  {topics.length ? topics.map((topic) => (
                    <Checkbox
                      key={topic.id}
                      label={topic.name}
                      checked={classification.topicIds.includes(topic.id)}
                      onChange={(event) => setClassification((current) => ({
                        ...current,
                        topicIds: event.target.checked
                          ? [...current.topicIds, topic.id]
                          : current.topicIds.filter((id) => id !== topic.id),
                      }))}
                    />
                  )) : <span className="ez-card-desc">Chưa có chủ đề trong chương này.</span>}
                </fieldset>

                <Button type="submit" loading={confirming} disabled={confirming || taxonomyLoading}>
                  Xác nhận phân loại
                </Button>
              </form>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {reviewStatus === 'ready_to_generate' ? (
        <Card>
          <CardHeader><CardTitle as="h2">Cấu hình bộ ôn tập</CardTitle></CardHeader>
          <CardBody>
            <form className="ez-stack ez-stack-lg" onSubmit={(event) => void generateReview(event)}>
              <FormField label="Tiêu đề" required>
                <Input
                  value={title}
                  maxLength={120}
                  required
                  disabled={generating}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </FormField>
              <div className="ez-grid ez-grid-2">
                <FormField label="Số câu hỏi" required hint="Từ 3 đến 50 câu.">
                  <Input
                    type="number"
                    min={3}
                    max={50}
                    step={1}
                    value={questionCount}
                    required
                    disabled={generating}
                    onChange={(event) => setQuestionCount(Number(event.target.value))}
                  />
                </FormField>
                <FormField label="Độ khó" required>
                  <Select
                    value={difficulty}
                    disabled={generating}
                    onChange={(event) => setDifficulty(event.target.value as ReviewDifficulty)}
                    options={[
                      { value: 'easy', label: 'Dễ' },
                      { value: 'medium', label: 'Trung bình' },
                      { value: 'hard', label: 'Khó' },
                    ]}
                  />
                </FormField>
              </div>
              <p><strong>Loại câu hỏi:</strong> Trắc nghiệm nhiều lựa chọn</p>
              <Button type="submit" loading={generating} disabled={generating}>
                Tạo bộ đề ôn tập
              </Button>
            </form>
          </CardBody>
        </Card>
      ) : null}

      {reviewStatus === 'generating' || reviewStatus === 'classifying' ? (
        <Card>
          <CardBody>
            <p>{liveStatus}</p>
            <p className="ez-card-desc">Trang sẽ tự cập nhật khi xử lý xong.</p>
          </CardBody>
        </Card>
      ) : null}

      {reviewStatus === 'ready' && review ? (
        <Card>
          <CardHeader><CardTitle as="h2">Bộ đề đã sẵn sàng</CardTitle></CardHeader>
          <CardBody className="ez-stack">
            {review.warning ? <Alert tone="warning">{review.warning}</Alert> : null}
            <div className="ez-row ez-row-wrap">
              <Link className="ez-btn ez-btn-outline" to={`/student/reviews/${review.id}`}>
                Xem chi tiết
              </Link>
              <Link className="ez-btn ez-btn-primary" to={`/student/reviews/${review.id}/attempt`}>
                Bắt đầu ôn tập
              </Link>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {reviewStatus === 'failed' && review ? (
        <Card>
          <CardHeader><CardTitle as="h2">Không thể tạo bộ ôn tập</CardTitle></CardHeader>
          <CardBody className="ez-stack">
            <div ref={errorFocusRef} tabIndex={-1}>
              <Alert tone="error">
                {error || review.errorMessage || review.warning || 'Không thể hoàn tất bộ ôn tập.'}
              </Alert>
            </div>
            <div className="ez-row ez-row-wrap">
              {failedRetryLabel ? (
                <Button
                  variant="outline"
                  loading={retrying}
                  disabled={retrying}
                  onClick={() => void retryFailedReview()}
                >
                  {failedRetryLabel}
                </Button>
              ) : null}
              <Button variant="ghost" disabled={retrying} onClick={reset}>Bắt đầu lại</Button>
            </div>
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}
