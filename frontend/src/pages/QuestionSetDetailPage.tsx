import React, { useCallback, useRef, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { authApi } from '../api/authApi';
import { questionApi } from '../api/questionApi';
import type { QuestionAttemptResponse, QuestionItemUpdatePayload, QuestionSetResponse } from '../api/questionApi';
import { buildEventIdempotencyKey, getLearningSession, trackLearningEvent } from '../api/learningEventApi';
import QuestionCard from '../components/QuestionCard';
import { getApiErrorDetail, getBlobErrorDetail, isUnauthorizedError } from '../api/errors';
import type { UserResponse } from '../types/auth';
import { classesApi } from '../api/classesApi';
import type { ClassSummary } from '../types/classes';

type WorkflowStatus = 'draft' | 'review_pending' | 'approved' | 'published';

const STATUS_LABELS: Record<WorkflowStatus, string> = {
  draft: 'Bản nháp',
  review_pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  published: 'Đã xuất bản',
};

const normalizeTags = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

const QuestionSetDetailPage: React.FC = () => {
  const { questionSetId } = useParams<{ questionSetId: string }>();
  const [questionSet, setQuestionSet] = useState<QuestionSetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [downloadingFormat, setDownloadingFormat] = useState<'docx' | 'pdf' | null>(null);
  const [studyMode, setStudyMode] = useState(false);
  const [forceReveal, setForceReveal] = useState(false);
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
  const [myClasses, setMyClasses] = useState<ClassSummary[]>([]);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [attemptAnswers, setAttemptAnswers] = useState<Record<number, string>>({});
  const [attemptSubmitting, setAttemptSubmitting] = useState(false);
  const [attemptResult, setAttemptResult] = useState<QuestionAttemptResponse | null>(null);
  const [currentRole, setCurrentRole] = useState<NonNullable<UserResponse['role']>>('student');
  const questionSessionRef = useRef<string | null>(null);
  const pageStartedAtRef = useRef(0);
  const questionStartedAtRef = useRef<Record<number, number>>({});
  const answerChangeCountRef = useRef<Record<number, number>>({});
  const startedQuestionsRef = useRef<Set<number>>(new Set());
  const explanationViewedRef = useRef<Set<string>>(new Set());

  const navigate = useNavigate();
  const canManageQuestions = ['lecturer', 'admin', 'super_admin', 'user'].includes(currentRole);
  const canTakeExam = currentRole === 'student';

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

  const recordQuestionStarted = useCallback((questionIndex: number) => {
    if (!questionSet || !canTakeExam) return;
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
      metadata: {
        question_set_id: questionSet.id,
        question_index: questionIndex,
      },
    });
  }, [canTakeExam, getQuestionSessionId, questionSet]);

  const recordExplanationViewed = useCallback((questionIndex: number) => {
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
      metadata: {
        question_set_id: questionSet.id,
        question_index: questionIndex,
      },
    });
  }, [getQuestionSessionId, questionSet]);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      navigate('/login');
      return;
    }

    const fetchData = async () => {
      if (!questionSetId) return;
      setLoading(true);
      try {
        const [me, response] = await Promise.all([
          authApi.getMe(),
          questionApi.get(questionSetId),
        ]);
        setCurrentRole(me.role || 'student');
        setQuestionSet(response);
        setActionError(null);
      } catch (err: unknown) {
        if (isUnauthorizedError(err)) {
          localStorage.removeItem('access_token');
          navigate('/login');
        } else {
          setError('Không tải được chi tiết bộ câu hỏi. Bộ câu hỏi có thể đã bị xóa hoặc không thuộc quyền sở hữu của bạn.');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
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

  const handleExport = async (format: 'docx' | 'pdf') => {
    if (!questionSet) {
      return;
    }

    setActionError(null);
    setDownloadingFormat(format);

    try {
      if (format === 'docx') {
        await questionApi.downloadDocx(questionSet.id);
      } else {
        await questionApi.downloadPdf(questionSet.id);
      }
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
  };

  const handleSaveQuestion = async () => {
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
    } catch (err: unknown) {
      setActionError(getApiErrorDetail(err) ?? 'Không lưu được câu hỏi. Hãy kiểm tra nội dung và thử lại.');
    } finally {
      setSavingQuestion(false);
    }
  };

  const handleWorkflow = async (nextStatus: WorkflowStatus) => {
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
  };

  const openPublishModal = () => {
    if (!questionSet) return;
    setPublishAudience('all');
    setSelectedClassIds([]);
    setShowPublishModal(true);
    classesApi.list()
      .then((data) => setMyClasses(data.items))
      .catch(() => setMyClasses([]));
  };

  const toggleSelectedClass = (classId: string) => {
    setSelectedClassIds((prev) =>
      prev.includes(classId) ? prev.filter((id) => id !== classId) : [...prev, classId]
    );
  };

  const confirmPublish = async () => {
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
      });
      setQuestionSet(updated);
      setShowPublishModal(false);
    } catch (err: unknown) {
      setActionError(getApiErrorDetail(err) ?? 'Không ban hành được đề thi.');
    } finally {
      setPublishingSet(false);
    }
  };

  const handleAnswerChange = (questionIndex: number, answer: string) => {
    recordQuestionStarted(questionIndex);
    answerChangeCountRef.current[questionIndex] = (answerChangeCountRef.current[questionIndex] || 0) + 1;
    setAttemptAnswers((prev) => ({ ...prev, [questionIndex]: answer }));
  };

  const handleSubmitAttempt = async () => {
    if (!questionSet) return;
    const submittedAt = Date.now();
    setAttemptSubmitting(true);
    setActionError(null);
    try {
      Object.keys(attemptAnswers).forEach((questionIndex) => {
        recordQuestionStarted(Number(questionIndex));
      });
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
            idempotency_key: buildEventIdempotencyKey([
              sessionId,
              itemId,
              result.id,
              'question_answered',
            ]),
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
  };

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p style={{ marginTop: '16px', color: 'var(--text)' }}>Đang tải bộ đề câu hỏi...</p>
      </div>
    );
  }

  if (error && !questionSet) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.errorAlert}>{error}</div>
        <button onClick={() => navigate('/documents')} style={styles.backButton}>
          Quay lại Danh sách tài liệu
        </button>
      </div>
    );
  }

  return (
    <div style={styles.container}>

      {/* Main Content */}
      <main style={styles.mainContent}>
        {/* Navigation / Actions Bar */}
        {questionSet && (
          <div style={styles.actionBar}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => navigate(canTakeExam ? '/published-questions' : '/question-history')} style={styles.backButton}>
                ← {canTakeExam ? 'Bắt đầu bài thi' : 'Quản lý lịch sử'}
              </button>
              {canManageQuestions && (
                <button onClick={() => navigate(`/documents/${questionSet.document_id}`)} style={styles.backButton}>
                  📄 Học liệu gốc
                </button>
              )}
            </div>

            {canManageQuestions && (
              <div style={styles.exportButtons}>
                <button
                  type="button"
                  onClick={openPublishModal}
                  disabled={publishingSet || questionSet.published_question_count === questionSet.question_count}
                  style={{ ...styles.exportButton, background: 'linear-gradient(135deg, #16a34a, #22c55e)', border: 'none' }}
                >
                  {publishingSet
                    ? 'Đang ban hành...'
                    : questionSet.published_question_count === questionSet.question_count
                      ? '✅ Đã ban hành cho học sinh'
                      : '🚀 Duyệt & ban hành toàn bộ'}
                </button>
                <button
                  type="button"
                  onClick={() => handleExport('docx')}
                  disabled={downloadingFormat !== null}
                  style={{ ...styles.exportButton, background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)', border: 'none' }}
                >
                  {downloadingFormat === 'docx' ? 'Đang tạo DOCX...' : '📥 Tải DOCX'}
                </button>

                <button
                  type="button"
                  onClick={() => handleExport('pdf')}
                  disabled={downloadingFormat !== null}
                  style={{ ...styles.exportButton, background: 'linear-gradient(135deg, #f74a8a, #ff6b9d)', border: 'none' }}
                >
                  {downloadingFormat === 'pdf' ? 'Đang tạo PDF...' : '📥 Tải PDF'}
                </button>
              </div>
            )}
          </div>
        )}

        {actionError && <div style={styles.errorAlert}>{actionError}</div>}

        {showPublishModal && questionSet && (
          <div
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
            }}
            onClick={() => !publishingSet && setShowPublishModal(false)}
          >
            <div
              style={{
                background: 'var(--surface, #fff)', borderRadius: 16, padding: 24,
                width: '100%', maxWidth: 480, maxHeight: '80vh', overflowY: 'auto',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ marginTop: 0 }}>Ban hành đề thi</h3>
              <p style={{ color: 'var(--text-muted, #666)' }}>
                Chọn đối tượng học sinh sẽ nhìn thấy {questionSet.question_count} câu hỏi này.
              </p>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="publish-audience"
                  checked={publishAudience === 'all'}
                  onChange={() => setPublishAudience('all')}
                />
                Tất cả học sinh (mặc định, như hiện tại)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="publish-audience"
                  checked={publishAudience === 'classes'}
                  onChange={() => setPublishAudience('classes')}
                />
                Chỉ giao cho lớp cụ thể
              </label>

              {publishAudience === 'classes' && (
                <div style={{ marginBottom: 12, paddingLeft: 4 }}>
                  {myClasses.length === 0 ? (
                    <p style={{ fontSize: 14, color: 'var(--text-muted, #666)' }}>
                      Bạn chưa có lớp học nào.{' '}
                      <button type="button" onClick={() => navigate('/classes')} style={{ padding: 0, background: 'none', border: 'none', color: '#2563eb', textDecoration: 'underline', cursor: 'pointer' }}>
                        Tạo lớp học ngay
                      </button>.
                    </p>
                  ) : (
                    myClasses.map((cls) => (
                      <label key={cls.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={selectedClassIds.includes(cls.id)}
                          onChange={() => toggleSelectedClass(cls.id)}
                        />
                        {cls.name} ({cls.student_count} học sinh)
                      </label>
                    ))
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                <button type="button" onClick={() => setShowPublishModal(false)} disabled={publishingSet} style={styles.backButton}>
                  Huỷ
                </button>
                <button
                  type="button"
                  onClick={confirmPublish}
                  disabled={publishingSet}
                  style={{ ...styles.exportButton, background: 'linear-gradient(135deg, #16a34a, #22c55e)', border: 'none' }}
                >
                  {publishingSet ? 'Đang ban hành...' : 'Xác nhận ban hành'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Metadata Header */}
        {questionSet && (
          <div style={styles.metaCard}>
            <h2 style={styles.metaTitle}>Bộ đề đánh giá năng lực của tài liệu</h2>
            <p style={styles.documentName}>📄 {questionSet.document_name}</p>
            
            <div style={styles.metaGrid}>
              <div style={styles.metaBadge}>
                <strong>Độ khó:</strong>{' '}
                {questionSet.difficulty === 'easy' ? 'Dễ' : questionSet.difficulty === 'medium' ? 'Trung bình' : 'Khó'}
              </div>
              <div style={styles.metaBadge}>
                <strong>Dạng câu hỏi:</strong>{' '}
                {questionSet.question_type === 'multiple_choice'
                  ? 'Trắc nghiệm khách quan'
                  : questionSet.question_type === 'true_false'
                  ? 'Đúng/Sai'
                  : 'Tự luận ngắn'}
              </div>
              <div style={styles.metaBadge}>
                <strong>Tổng số câu hỏi:</strong> {questionSet.question_count} câu
              </div>
            </div>
          </div>
        )}

        {questionSet && canManageQuestions && questionSet.questions.length > 0 && (() => {
          const selected = questionSet.questions[editIndex];
          const currentStatus = (selected.status || 'draft') as WorkflowStatus;
          const counts = questionSet.workflow_counts || {};
          return (
            <section style={styles.workflowCard}>
              <div style={styles.workflowHeader}>
                <div>
                  <h3 style={styles.workflowTitle}>Duyệt câu hỏi trước khi ban hành</h3>
                  <p style={styles.workflowSubtitle}>
                    Chỉnh sửa từng câu bên dưới hoặc dùng nút “Duyệt &amp; ban hành toàn bộ” phía trên. Nháp: {counts.draft || 0} • Chờ duyệt: {counts.review_pending || 0} • Đã duyệt: {counts.approved || 0} • Đã ban hành: {counts.published || 0}
                  </p>
                </div>
                <span style={styles.statusPill}>{STATUS_LABELS[currentStatus]}</span>
              </div>

              <div style={styles.editorGrid}>
                <label style={styles.editorLabel}>
                  Chọn câu
                  <select
                    value={editIndex}
                    onChange={(e) => setEditIndex(Number(e.target.value))}
                    style={styles.editorInput}
                  >
                    {questionSet.questions.map((_, idx) => (
                      <option key={idx} value={idx}>Câu {idx + 1}</option>
                    ))}
                  </select>
                </label>

                <label style={styles.editorLabel}>
                  Tags
                  <input
                    value={editDraft.tagsText}
                    onChange={(e) => setEditDraft((prev) => ({ ...prev, tagsText: e.target.value }))}
                    placeholder="vd: sql, join, chuẩn hóa"
                    style={styles.editorInput}
                  />
                </label>
              </div>

              <label style={styles.editorLabel}>
                Nội dung câu hỏi
                <textarea
                  value={editDraft.question || ''}
                  onChange={(e) => setEditDraft((prev) => ({ ...prev, question: e.target.value }))}
                  style={{ ...styles.editorInput, minHeight: '84px', resize: 'vertical' }}
                />
              </label>

              <div style={styles.editorGrid}>
                <label style={styles.editorLabel}>
                  Đáp án đúng
                  <input
                    value={editDraft.correct_answer || ''}
                    onChange={(e) => setEditDraft((prev) => ({ ...prev, correct_answer: e.target.value }))}
                    style={styles.editorInput}
                  />
                </label>

                <label style={styles.editorLabel}>
                  Bloom
                  <select
                    value={editDraft.bloom_level || 'understand'}
                    onChange={(e) => setEditDraft((prev) => ({ ...prev, bloom_level: e.target.value }))}
                    style={styles.editorInput}
                  >
                    <option value="remember">Nhận biết</option>
                    <option value="understand">Thông hiểu</option>
                    <option value="apply">Vận dụng</option>
                    <option value="analyze">Vận dụng cao</option>
                  </select>
                </label>
              </div>

              <label style={styles.editorLabel}>
                Giải thích
                <textarea
                  value={editDraft.explanation || ''}
                  onChange={(e) => setEditDraft((prev) => ({ ...prev, explanation: e.target.value }))}
                  style={{ ...styles.editorInput, minHeight: '96px', resize: 'vertical' }}
                />
              </label>

              <div style={styles.workflowActions}>
                <button type="button" onClick={handleSaveQuestion} disabled={savingQuestion} style={styles.controlSubBtn}>
                  {savingQuestion ? 'Đang lưu...' : 'Lưu sửa/tag'}
                </button>
                <button type="button" onClick={() => handleWorkflow('review_pending')} disabled={workflowBusy !== null || currentStatus !== 'draft'} style={styles.controlSubBtn}>
                  Gửi duyệt
                </button>
                <button type="button" onClick={() => handleWorkflow('approved')} disabled={workflowBusy !== null || currentStatus !== 'review_pending'} style={styles.controlSubBtn}>
                  Duyệt
                </button>
                <button type="button" onClick={() => handleWorkflow('published')} disabled={workflowBusy !== null || currentStatus !== 'approved'} style={styles.publishButton}>
                  Xuất bản
                </button>
                <button type="button" onClick={() => handleWorkflow('draft')} disabled={workflowBusy !== null || currentStatus === 'draft'} style={styles.controlSubBtn}>
                  Đưa về nháp
                </button>
              </div>
            </section>
          );
        })()}

        {/* TF-IDF Keywords + Bloom Distribution */}
        {questionSet && (
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', margin: '0 auto 20px', maxWidth: '900px', width: '100%', padding: '0 20px' }}>
            {/* TF-IDF Keywords */}
            {questionSet.keywords && questionSet.keywords.length > 0 && (
              <div style={{
                flex: '1 1 300px',
                padding: '16px',
                borderRadius: '12px',
                background: 'var(--card)',
                border: '1px solid rgba(16, 185, 129, 0.2)',
              }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#10b981', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>📊</span> Từ khóa trọng tâm (TF-IDF)
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {questionSet.keywords.slice(0, 12).map((kw, idx) => {
                    const maxScore = questionSet.keywords![0]?.score || 1;
                    const opacity = 0.4 + (kw.score / maxScore) * 0.6;
                    return (
                      <span key={idx} style={{
                        fontSize: '12px',
                        padding: '4px 10px',
                        borderRadius: '16px',
                        background: `rgba(16, 185, 129, ${opacity * 0.15})`,
                        color: '#10b981',
                        border: `1px solid rgba(16, 185, 129, ${opacity * 0.3})`,
                        fontWeight: kw.score >= maxScore * 0.7 ? 600 : 400,
                      }}>
                        {kw.keyword}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Bloom Distribution */}
            {questionSet.bloom_distribution && Object.keys(questionSet.bloom_distribution).length > 0 && (() => {
              const bloomConfig: Record<string, { label: string; color: string }> = {
                remember: { label: 'Nhận biết', color: '#22c55e' },
                understand: { label: 'Thông hiểu', color: '#3b82f6' },
                apply: { label: 'Vận dụng', color: '#f59e0b' },
                analyze: { label: 'Vận dụng cao', color: '#ef4444' },
              };
              const total = Object.values(questionSet.bloom_distribution!).reduce((a, b) => a + b, 0);
              return (
                <div style={{
                  flex: '1 1 300px',
                  padding: '16px',
                  borderRadius: '12px',
                  background: 'var(--card)',
                  border: '1px solid rgba(139, 92, 246, 0.2)',
                }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#8b5cf6', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>🎓</span> Phân bố cấp độ Bloom
                  </div>
                  <div style={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', height: '22px', marginBottom: '8px' }}>
                    {Object.entries(questionSet.bloom_distribution!).map(([level, cnt]) => {
                      const cfg = bloomConfig[level];
                      if (!cfg || cnt === 0) return null;
                      const pct = (cnt / total) * 100;
                      return (
                        <div key={level} title={`${cfg.label}: ${cnt} câu`} style={{
                          width: `${pct}%`,
                          background: cfg.color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                          fontSize: '10px',
                          fontWeight: 600,
                        }}>
                          {pct >= 20 ? `${cfg.label}` : cnt}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {Object.entries(questionSet.bloom_distribution!).map(([level, cnt]) => {
                      const cfg = bloomConfig[level];
                      if (!cfg || cnt === 0) return null;
                      return (
                        <div key={level} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: cfg.color, display: 'inline-block' }} />
                          <span style={{ color: 'var(--text)' }}>{cfg.label}: <strong>{cnt}</strong></span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Study Mode Controls */}
        {questionSet && canManageQuestions && (
          <div style={styles.studyControlsCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>🧠</span>
                <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-h)' }}>
                  Chế độ ôn tập (Ẩn đáp án)
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStudyMode(prev => {
                    const next = !prev;
                    if (!next) {
                      setForceReveal(false);
                    }
                    return next;
                  });
                }}
                style={{
                  ...styles.toggleBtn,
                  backgroundColor: studyMode ? '#22c55e' : 'var(--border)',
                  color: '#fff',
                }}
              >
                {studyMode ? 'ĐANG BẬT' : 'ĐANG TẮT'}
              </button>

              {studyMode && (
                <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                  <button
                    type="button"
                    onClick={() => setForceReveal(true)}
                    style={styles.controlSubBtn}
                  >
                    👁️ Hiện tất cả
                  </button>
                  <button
                    type="button"
                    onClick={() => setForceReveal(false)}
                    style={styles.controlSubBtn}
                  >
                    🙈 Ẩn tất cả
                  </button>
                </div>
              )}
            </div>
            {studyMode && (
              <p style={{ margin: '8px 0 0', fontSize: '13px', color: 'var(--muted)' }}>
                💡 Các đáp án trắc nghiệm và câu trả lời tự luận sẽ bị ẩn. Hãy suy nghĩ trước khi click "Hiện đáp án" ở từng câu hoặc click "Hiện tất cả" ở trên.
              </p>
            )}
          </div>
        )}

        {questionSet && canTakeExam && (
          <section style={styles.attemptCard}>
            <div>
              <h3 style={styles.workflowTitle}>Lưu kết quả làm bài</h3>
              <p style={styles.workflowSubtitle}>
                Hệ thống sẽ chấm theo đáp án của bộ câu hỏi và lưu lịch sử làm bài cho tài khoản hiện tại.
              </p>
            </div>
            <div style={styles.workflowActions}>
              <button
                type="button"
                onClick={handleSubmitAttempt}
                disabled={attemptSubmitting}
                style={styles.publishButton}
              >
                {attemptSubmitting ? 'Đang lưu kết quả...' : 'Nộp bài và lưu điểm'}
              </button>
            </div>
            {attemptResult && (
              <div style={styles.resultBox}>
                Kết quả gần nhất: <strong>{attemptResult.score}/{attemptResult.max_score}</strong> câu đúng ({attemptResult.percent}%)
              </div>
            )}
          </section>
        )}

        {/* Questions Render List */}
        {questionSet && (
          <div style={styles.questionsList}>
            {questionSet.questions.map((q, qIdx) => (
              <QuestionCard
                key={qIdx}
                question={q}
                index={qIdx + 1}
                studyMode={studyMode}
                forceReveal={forceReveal}
                savedAnswer={attemptAnswers[qIdx]}
                onAnswerChange={handleAnswerChange}
                onExplanationViewed={recordExplanationViewed}
                examMode={canTakeExam}
                submittedResult={attemptResult?.answers.find((answer) => answer.question_index === qIdx)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    minHeight: '100svh',
    backgroundColor: 'var(--bg)',
    width: '100%',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    justifyContent: 'center',
    alignItems: 'center',
    flexGrow: 1,
    backgroundColor: 'var(--bg)',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '4px solid var(--border)',
    borderTop: '4px solid var(--accent)',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 40px',
    borderBottom: '1px solid var(--border)',
    backgroundColor: 'var(--bg)',
    flexWrap: 'wrap' as const,
    gap: '16px',
    textAlign: 'left' as const,
  },
  logoGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  logoBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '40px',
    height: '40px',
    borderRadius: '10px',
    backgroundColor: 'var(--accent-bg)',
    color: 'var(--accent)',
    fontSize: '18px',
    fontWeight: 'bold',
    border: '1px solid var(--accent-border)',
  },
  headerTitle: {
    fontSize: '18px',
    fontWeight: '600',
    margin: 0,
    color: 'var(--text-h)',
    lineHeight: '1.2',
  },
  headerSubtitle: {
    fontSize: '13px',
    color: 'var(--text)',
    margin: 0,
  },
  userSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
  },
  userInfo: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-end',
  },
  userName: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--text-h)',
  },
  userEmail: {
    fontSize: '12px',
    color: 'var(--text)',
  },
  logoutButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: '500',
    color: 'var(--text)',
    backgroundColor: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  mainContent: {
    flexGrow: 1,
    padding: '40px',
    maxWidth: '860px',
    margin: '0 auto',
    width: '100%',
    boxSizing: 'border-box' as const,
    textAlign: 'left' as const,
  },
  actionBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '28px',
    flexWrap: 'wrap' as const,
    gap: '16px',
  },
  backButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: '500',
    color: 'var(--text)',
    backgroundColor: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  exportButtons: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap' as const,
  },
  exportButton: {
    padding: '10px 16px',
    fontSize: '13px',
    fontWeight: '600',
    color: '#fff',
    borderRadius: '6px',
    border: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  errorAlert: {
    padding: '12px 16px',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    color: '#ef4444',
    borderRadius: '8px',
    fontSize: '14px',
    marginBottom: '20px',
  },
  metaCard: {
    padding: '28px 24px',
    borderRadius: '12px',
    border: '1px solid var(--border)',
    backgroundColor: 'var(--bg)',
    boxShadow: 'var(--shadow)',
    marginBottom: '32px',
  },
  metaTitle: {
    fontSize: '15px',
    fontWeight: '600',
    color: 'var(--text)',
    margin: '0 0 6px 0',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  documentName: {
    fontSize: '22px',
    fontWeight: '600',
    color: 'var(--text-h)',
    margin: '0 0 16px 0',
  },
  metaGrid: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap' as const,
  },
  metaBadge: {
    fontSize: '13px',
    backgroundColor: 'var(--code-bg)',
    border: '1px solid var(--border)',
    color: 'var(--text-h)',
    padding: '6px 12px',
    borderRadius: '6px',
  },
  workflowCard: {
    padding: '20px',
    borderRadius: '12px',
    border: '1px solid var(--border)',
    backgroundColor: 'var(--bg)',
    boxShadow: 'var(--shadow)',
    marginBottom: '24px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '14px',
  },
  workflowHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
    flexWrap: 'wrap' as const,
  },
  workflowTitle: {
    fontSize: '16px',
    fontWeight: 700,
    color: 'var(--text-h)',
    margin: 0,
  },
  workflowSubtitle: {
    fontSize: '13px',
    color: 'var(--muted)',
    margin: '6px 0 0',
    lineHeight: 1.5,
  },
  statusPill: {
    fontSize: '12px',
    fontWeight: 700,
    color: 'var(--accent)',
    backgroundColor: 'var(--accent-bg)',
    border: '1px solid var(--accent-border)',
    borderRadius: '999px',
    padding: '5px 10px',
  },
  editorGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '12px',
  },
  editorLabel: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--text-h)',
  },
  editorInput: {
    width: '100%',
    boxSizing: 'border-box' as const,
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '9px 10px',
    backgroundColor: 'var(--card)',
    color: 'var(--text-h)',
    fontSize: '14px',
  },
  workflowActions: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap' as const,
    alignItems: 'center',
  },
  publishButton: {
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: 700,
    color: '#fff',
    backgroundColor: '#16a34a',
    border: '1px solid #16a34a',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  attemptCard: {
    padding: '16px 20px',
    borderRadius: '12px',
    border: '1px solid var(--border)',
    backgroundColor: 'var(--bg)',
    boxShadow: 'var(--shadow)',
    marginBottom: '24px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  resultBox: {
    padding: '10px 12px',
    borderRadius: '8px',
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
    border: '1px solid rgba(34, 197, 94, 0.25)',
    color: 'var(--text-h)',
    fontSize: '14px',
  },
  questionsList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '24px',
  },
  studyControlsCard: {
    padding: '16px 20px',
    borderRadius: '12px',
    border: '1px solid var(--border)',
    backgroundColor: 'var(--bg)',
    boxShadow: 'var(--shadow)',
    marginBottom: '24px',
  },
  toggleBtn: {
    padding: '6px 16px',
    fontSize: '13px',
    fontWeight: 700,
    borderRadius: '20px',
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  controlSubBtn: {
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--text-h)',
    backgroundColor: 'var(--code-bg)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    cursor: 'pointer',
  },
};

export default QuestionSetDetailPage;
