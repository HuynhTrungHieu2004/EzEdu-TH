import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { documentApi } from '../api/documentApi';
import { questionApi } from '../api/questionApi';
import type { QuestionItem, ValidationStats, KeywordItem } from '../api/questionApi';
import client from '../api/client';
import { getApiErrorDetail } from '../api/errors';

// ─── Types ───────────────────────────────────────────────────────────────
type ProcessingStep = 'idle' | 'uploading' | 'extracting' | 'transcribing' | 'indexing' | 'ready' | 'error';

interface StepInfo {
  label: string;
  icon: string;
}

const DOC_STEPS: Record<string, StepInfo> = {
  uploading: { label: 'Đang tải lên hệ thống...', icon: 'UP' },
  extracting: { label: 'Trích xuất nội dung văn bản...', icon: 'TXT' },
  indexing: { label: 'Lập chỉ mục Vector DB...', icon: 'IDX' },
  ready: { label: 'Sẵn sàng sinh câu hỏi!', icon: 'OK' },
  error: { label: 'Đã xảy ra lỗi', icon: '!' },
};

const VIDEO_STEPS: Record<string, StepInfo> = {
  uploading: { label: 'Đang tải video lên...', icon: 'UP' },
  transcribing: { label: 'AI đang phân tích video...', icon: 'VID' },
  indexing: { label: 'Lập chỉ mục Vector DB...', icon: 'IDX' },
  ready: { label: 'Sẵn sàng sinh câu hỏi!', icon: 'OK' },
  error: { label: 'Đã xảy ra lỗi', icon: '!' },
};

const COUNTS = [3, 5, 10, 15, 20];

const DIFFICULTIES = [
  { value: 'easy', label: 'Dễ', icon: 'D1', desc: 'Nhận biết & ghi nhớ' },
  { value: 'medium', label: 'Trung bình', icon: 'D2', desc: 'Hiểu & vận dụng' },
  { value: 'hard', label: 'Khó', icon: 'D3', desc: 'Phân tích & đánh giá' },
];

const BLOOM_LEVELS = [
  { value: 'remember', label: 'Nhận biết', icon: 'B1', desc: 'Ghi nhớ, liệt kê, nhận diện' },
  { value: 'understand', label: 'Thông hiểu', icon: 'B2', desc: 'Giải thích, so sánh, tóm tắt' },
  { value: 'apply', label: 'Vận dụng', icon: 'B3', desc: 'Áp dụng vào tình huống thực tế' },
  { value: 'analyze', label: 'Vận dụng cao', icon: 'B4', desc: 'Phân tích, đánh giá, sáng tạo' },
];

const QUESTION_TYPES = [
  { value: 'multiple_choice', label: 'Trắc nghiệm', icon: 'A-D', desc: '4 lựa chọn A-B-C-D' },
  { value: 'true_false', label: 'Đúng / Sai', icon: 'Đ/S', desc: 'Đúng hoặc Sai' },
  { value: 'short_answer', label: 'Tự luận ngắn', icon: 'TL', desc: 'Điền khuyết / tự luận' },
];

const DOCUMENT_EXTENSIONS = ['pdf', 'docx', 'pptx'];
const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm', 'mkv'];
const ACCEPTED_EXTENSIONS = [...DOCUMENT_EXTENSIONS, ...VIDEO_EXTENSIONS];
const MAX_DOCUMENT_SIZE = 20 * 1024 * 1024; // 20MB
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB
const POLL_INTERVAL_MS = 3000;

// ─── Component ───────────────────────────────────────────────────────────
const QuickGeneratePage: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const successPanelRef = useRef<HTMLDivElement | null>(null);

  // Upload state
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [step, setStep] = useState<ProcessingStep>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isVideo, setIsVideo] = useState(false);
  const [transcribeProgress, setTranscribeProgress] = useState('');
  const [uploadPercent, setUploadPercent] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Config state
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState('medium');
  const [bloomLevel, setBloomLevel] = useState('understand');
  const [questionType, setQuestionType] = useState('multiple_choice');

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [generatingProgress, setGeneratingProgress] = useState('');
  const [generatedResult, setGeneratedResult] = useState<{ id: string; question_count: number; document_name: string; questions: QuestionItem[]; validation_stats?: ValidationStats | null; keywords?: KeywordItem[] | null; bloom_distribution?: Record<string, number> | null } | null>(null);

  // ── Validation ──
  const validateFile = (f: File): string | null => {
    const ext = f.name.split('.').pop()?.toLowerCase() || '';
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      return `Chỉ hỗ trợ: ${DOCUMENT_EXTENSIONS.map(e => '.' + e).join(', ')}, ${VIDEO_EXTENSIONS.map(e => '.' + e).join(', ')}`;
    }
    const isVid = VIDEO_EXTENSIONS.includes(ext);
    if (isVid && f.size > MAX_VIDEO_SIZE) {
      return 'Dung lượng video vượt quá 100MB';
    }
    if (!isVid && f.size > MAX_DOCUMENT_SIZE) {
      return 'Dung lượng tài liệu vượt quá 20MB';
    }
    return null;
  };

  // ── File Selection ──
  const handleFileSelected = useCallback((f: File) => {
    const err = validateFile(f);
    if (err) {
      setErrorMsg(err);
      return;
    }
    const ext = f.name.split('.').pop()?.toLowerCase() || '';
    const isVid = VIDEO_EXTENSIONS.includes(ext);
    setFile(f);
    setFileName(f.name);
    setIsVideo(isVid);
    setErrorMsg(null);
    setStep('idle');
    setDocumentId(null);
    setTranscribeProgress('');
    setUploadPercent(0);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) handleFileSelected(droppedFile);
  }, [handleFileSelected]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragOver(false), []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFileSelected(f);
  }, [handleFileSelected]);

  // ── Cleanup polling on unmount ──
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  // ── Poll transcription status ──
  const pollTranscriptionStatus = useCallback(async function pollStatus(docId: string) {
    try {
      const res = await client.get(`/documents/${docId}`);
      const doc = res.data;
      const docStatus = doc.status;

      if (docStatus === 'transcribed' || docStatus === 'indexed') {
        // Transcription done, proceed to indexing
        setTranscribeProgress('');
        setStep('indexing');
        try {
          await documentApi.index(docId);
        } catch (err: unknown) {
          const detail = getApiErrorDetail(err);
          if (!detail?.includes('already indexed')) {
            setErrorMsg(detail ?? 'Lập chỉ mục thất bại.');
            setStep('error');
            return;
          }
        }
        setStep('ready');
      } else if (docStatus === 'failed') {
        setErrorMsg(doc.error_message || 'Phân tích video thất bại.');
        setStep('error');
      } else {
        // Still transcribing, continue polling
        setTranscribeProgress('AI đang phân tích nội dung video...');
        pollTimerRef.current = setTimeout(() => {
          void pollStatus(docId);
        }, POLL_INTERVAL_MS);
      }
    } catch {
      setErrorMsg('Không thể kiểm tra trạng thái xử lý video.');
      setStep('error');
    }
  }, []);

  // ── Auto-Process Pipeline ──
  const processDocument = useCallback(async () => {
    if (!file) return;

    setErrorMsg(null);
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const fileIsVideo = VIDEO_EXTENSIONS.includes(ext);

    // Step 1: Upload
    setStep('uploading');
    setUploadPercent(0);
    let docId: string;
    try {
      const uploadRes = await documentApi.upload(file, (percent) => {
        setUploadPercent(percent);
      });
      docId = uploadRes.document_id;
      setDocumentId(docId);
    } catch (err: unknown) {
      const detail = getApiErrorDetail(err);
      setErrorMsg(detail ?? 'Tải tài liệu lên thất bại.');
      setStep('error');
      return;
    }

    if (fileIsVideo) {
      // ── Video Pipeline: Upload → Transcribe (async) → Index → Ready ──
      setStep('transcribing');
      setTranscribeProgress('Đang gửi video cho AI phân tích...');
      try {
        await documentApi.transcribe(docId);
      } catch (err: unknown) {
        const detail = getApiErrorDetail(err);
        setErrorMsg(detail ?? 'Không thể bắt đầu phân tích video.');
        setStep('error');
        return;
      }
      // Start polling for transcription completion
      pollTimerRef.current = setTimeout(() => pollTranscriptionStatus(docId), POLL_INTERVAL_MS);
    } else {
      // ── Document Pipeline: Upload → Extract → Index → Ready ──
      setStep('extracting');
      try {
        await documentApi.extract(docId);
      } catch (err: unknown) {
        const detail = getApiErrorDetail(err);
        if (!detail?.includes('already been extracted')) {
          setErrorMsg(detail ?? 'Trích xuất nội dung thất bại.');
          setStep('error');
          return;
        }
      }

      setStep('indexing');
      try {
        await documentApi.index(docId);
      } catch (err: unknown) {
        const detail = getApiErrorDetail(err);
        if (!detail?.includes('already indexed')) {
          setErrorMsg(detail ?? 'Lập chỉ mục thất bại.');
          setStep('error');
          return;
        }
      }

      setStep('ready');
    }
  }, [file, pollTranscriptionStatus]);

  // Auto-trigger processing when file selected
  useEffect(() => {
    if (file && step === 'idle') {
      const timeoutId = window.setTimeout(() => {
        void processDocument();
      }, 0);
      return () => window.clearTimeout(timeoutId);
    }
  }, [file, step, processDocument]);

  useEffect(() => {
    if (!generatedResult) return;
    const timeoutId = window.setTimeout(() => {
      successPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
    return () => window.clearTimeout(timeoutId);
  }, [generatedResult]);

  // ── Generate Questions ──
  const handleGenerate = async () => {
    if (!documentId || generating) return;

    setGenerating(true);
    setGeneratingProgress('AI đang đọc tài liệu và tạo câu hỏi...');
    setErrorMsg(null);

    try {
      const result = await questionApi.generate(documentId, count, difficulty, questionType, bloomLevel);
      setGeneratedResult({
        id: result.id,
        question_count: result.question_count ?? count,
        document_name: fileName || 'Tài liệu',
        questions: result.questions ?? [],
        validation_stats: result.validation_stats,
        keywords: result.keywords,
        bloom_distribution: result.bloom_distribution,
      });
    } catch (err: unknown) {
      const detail = getApiErrorDetail(err);
      setErrorMsg(detail ?? 'Sinh câu hỏi thất bại. Vui lòng thử lại.');
    } finally {
      setGenerating(false);
      setGeneratingProgress('');
    }
  };

  // ── Delete Document ──
  const handleDeleteDocument = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => {
        setConfirmDelete(false);
      }, 5000);
      return;
    }

    setDeleting(true);
    setErrorMsg(null);
    try {
      if (documentId) {
        await documentApi.delete(documentId);
      }
      handleReset();
    } catch (err: unknown) {
      const detail = getApiErrorDetail(err);
      setErrorMsg(detail ?? 'Xóa tài liệu thất bại.');
      setConfirmDelete(false);
      setDeleting(false);
    }
  };

  // ── Reset ──
  const handleReset = () => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    setFile(null);
    setFileName(null);
    setIsVideo(false);
    setStep('idle');
    setDocumentId(null);
    setErrorMsg(null);
    setTranscribeProgress('');
    setUploadPercent(0);
    setConfirmDelete(false);
    setDeleting(false);
    setGeneratedResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Upload New (keep config, reset upload) ──
  const handleUploadNew = () => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    setFile(null);
    setFileName(null);
    setIsVideo(false);
    setStep('idle');
    setDocumentId(null);
    setErrorMsg(null);
    setTranscribeProgress('');
    setUploadPercent(0);
    setConfirmDelete(false);
    setDeleting(false);
    setGeneratedResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Progress Indicator ──
  const STEPS = isVideo ? VIDEO_STEPS : DOC_STEPS;
  const stepOrder: ProcessingStep[] = isVideo
    ? ['uploading', 'transcribing', 'indexing', 'ready']
    : ['uploading', 'extracting', 'indexing', 'ready'];
  const currentStepIdx = stepOrder.indexOf(step);
  const generateButtonContent = generating ? (
    <span style={s.generateBtnInner}>
      <span style={s.btnSpinner} />
      {generatingProgress}
    </span>
  ) : (
    <span style={s.generateBtnInner}>
      Sinh {count} câu hỏi
    </span>
  );

  return (
    <div style={s.pageContainer}>
      <div style={s.pageInner}>
        {/* Hero Header */}
        <div style={s.heroSection}>
          <div style={s.heroBadge} translate="no">AI</div>
          <h1 style={s.heroTitle}>Sinh Đề Nhanh bằng AI</h1>
          <p style={s.heroSubtitle}>
            Kéo thả tài liệu, chọn cấu hình — AI sẽ tự động tạo bộ câu hỏi đánh giá năng lực cho bạn
          </p>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div style={s.errorAlert}>
            <span style={s.alertMark}>!</span> {errorMsg}
          </div>
        )}

        {/* ═══ SECTION 1: Upload Zone ═══ */}
        <div style={s.sectionCard}>
          <div style={s.sectionHeader}>
            <span style={s.sectionNumber}>1</span>
            <div>
              <h2 style={s.sectionTitle}>Tải lên tài liệu</h2>
              <p style={s.sectionDesc}>Kéo thả file PDF, DOCX, PPTX hoặc video MP4, MOV, WEBM, MKV</p>
            </div>
          </div>

          {!file ? (
            <div
              style={{
                ...s.dropZone,
                borderColor: dragOver ? 'var(--accent)' : 'rgba(18, 184, 166, 0.36)',
                background: dragOver
                  ? 'linear-gradient(135deg, rgba(18, 184, 166, 0.14), rgba(52, 120, 246, 0.12))'
                  : 'linear-gradient(135deg, rgba(255, 255, 255, 0.84), rgba(244, 251, 255, 0.74))',
                transform: dragOver ? 'scale(1.01)' : 'scale(1)',
              }}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.pptx,.mp4,.mov,.webm,.mkv"
                onChange={handleInputChange}
                style={s.hiddenInput}
                id="quick-generate-file-input"
              />
              <div style={s.dropIcon} aria-hidden="true">↑</div>
              <p style={s.dropTitle}>Nhấp hoặc kéo thả tài liệu / video vào đây</p>
              <p style={s.dropHint}>Tài liệu: PDF, DOCX, PPTX (tối đa 20MB)</p>
              <p style={s.dropHint}>Video: MP4, MOV, WEBM, MKV (tối đa 100MB)</p>
            </div>
          ) : (
            <div style={s.fileInfo}>
              <div style={s.fileInfoLeft}>
                <span style={s.fileIcon}>{isVideo ? 'VID' : 'DOC'}</span>
                <div>
                  <p style={s.fileNameText}>{fileName}</p>
                  <p style={s.fileSizeText}>{(file.size / 1024 / 1024).toFixed(2)} MB{isVideo ? ' • Video' : ' • Tài liệu'}</p>
                </div>
              </div>
              <div style={s.fileInfoActions}>
                {deleting ? (
                  <div style={s.deletingContainer}>
                    <span className="deleting-spinner" />
                    <span>Đang xóa...</span>
                  </div>
                ) : confirmDelete ? (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={handleDeleteDocument}
                      className="btn-confirm-delete"
                      id="btn-confirm-delete"
                    >
                      Xác nhận xóa
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="btn-cancel-delete"
                      id="btn-cancel-delete"
                    >
                      Hủy
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {step === 'ready' && (
                      <button onClick={handleReset} className="btn-change-doc" id="btn-change-doc">
                        Đổi tài liệu
                      </button>
                    )}
                    <button
                      onClick={handleDeleteDocument}
                      className="btn-delete-premium"
                      id="btn-delete-doc"
                      title="Xóa tài liệu này khỏi hệ thống"
                    >
                      Xóa tài liệu
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Processing Progress */}
          {file && step !== 'idle' && step !== 'error' && (
            <div style={s.progressContainer}>
              <div style={s.progressTrack}>
                {stepOrder.map((stp, idx) => {
                  const isDone = idx < currentStepIdx;
                  const isCurrent = idx === currentStepIdx;
                  const info = STEPS[stp];
                  return (
                    <div key={stp} style={s.progressStep}>
                      <div
                        style={{
                          ...s.progressDot,
                          backgroundColor: isDone
                            ? '#22c55e'
                            : isCurrent
                            ? 'var(--accent)'
                            : 'var(--border)',
                          color: isDone || isCurrent ? '#fff' : 'var(--text)',
                          boxShadow: isCurrent ? '0 0 0 4px var(--accent-bg)' : 'none',
                          animation: isCurrent && stp !== 'ready' ? 'pulse 1.5s ease-in-out infinite' : 'none',
                        }}
                      >
                        {isDone ? '✓' : info.icon}
                      </div>
                      <span
                        style={{
                          ...s.progressLabel,
                          color: isDone || isCurrent ? 'var(--text-h)' : 'var(--text)',
                          fontWeight: isCurrent ? '600' : '400',
                        }}
                      >
                        {isCurrent && stp === 'uploading' && uploadPercent > 0
                          ? `${info.label.replace('...', '')} ${uploadPercent}%`
                          : info.label.replace('...', '')}
                      </span>
                      {idx < stepOrder.length - 1 && (
                        <div
                          style={{
                            ...s.progressLine,
                            backgroundColor: isDone ? '#22c55e' : 'var(--border)',
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              {/* Transcription sub-status text */}
              {step === 'transcribing' && transcribeProgress && (
                <p style={s.transcribeStatus}>{transcribeProgress}</p>
              )}
            </div>
          )}
        </div>

        {/* ═══ SECTION 2: Configuration (show after ready) ═══ */}
        {step === 'ready' && (
          <div style={{ ...s.sectionCard, animation: 'fadeSlideUp 0.5s ease' }}>
            <div style={s.sectionHeaderWithAction}>
              <div style={{ ...s.sectionHeader, marginBottom: 0 }}>
                <span style={s.sectionNumber}>2</span>
                <div>
                  <h2 style={s.sectionTitle}>Cấu hình bộ câu hỏi</h2>
                  <p style={s.sectionDesc}>Tùy chỉnh số lượng, độ khó và mức vận dụng cho bộ đề</p>
                </div>
              </div>
              <button
                onClick={handleGenerate}
                disabled={generating}
                style={{
                  ...s.generateBtnCompact,
                  opacity: generating ? 0.7 : 1,
                  cursor: generating ? 'not-allowed' : 'pointer',
                }}
                id="btn-generate-questions-config"
              >
                {generateButtonContent}
              </button>
            </div>

            {/* Question Count */}
            <div style={s.configBlock}>
              <h3 style={s.configLabel}>Số lượng câu hỏi</h3>
              <div style={s.chipRow}>
                {COUNTS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCount(c)}
                    style={{
                      ...s.chip,
                      ...(count === c ? s.chipActive : {}),
                    }}
                  >
                    {c} câu
                  </button>
                ))}
              </div>
            </div>

            {/* Difficulty */}
            <div style={s.configBlock}>
              <h3 style={s.configLabel}>Mức độ khó</h3>
              <div style={s.cardRow}>
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d.value}
                    onClick={() => setDifficulty(d.value)}
                    style={{
                      ...s.optionCard,
                      ...(difficulty === d.value ? s.optionCardActive : {}),
                    }}
                  >
                    <span style={s.optionIcon}>{d.icon}</span>
                    <strong style={s.optionLabel}>{d.label}</strong>
                    <span style={s.optionDesc}>{d.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Bloom Level */}
            <div style={s.configBlock}>
              <h3 style={s.configLabel}>Mức vận dụng (Bloom's Taxonomy)</h3>
              <div style={s.cardRow}>
                {BLOOM_LEVELS.map((b) => (
                  <button
                    key={b.value}
                    onClick={() => setBloomLevel(b.value)}
                    style={{
                      ...s.optionCard,
                      ...(bloomLevel === b.value ? s.optionCardActive : {}),
                    }}
                  >
                    <span style={s.optionIcon}>{b.icon}</span>
                    <strong style={s.optionLabel}>{b.label}</strong>
                    <span style={s.optionDesc}>{b.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Question Type */}
            <div style={s.configBlock}>
              <h3 style={s.configLabel}>Dạng câu hỏi</h3>
              <div style={s.cardRow}>
                {QUESTION_TYPES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setQuestionType(t.value)}
                    style={{
                      ...s.optionCard,
                      ...(questionType === t.value ? s.optionCardActive : {}),
                    }}
                  >
                    <span style={s.optionIcon}>{t.icon}</span>
                    <strong style={s.optionLabel}>{t.label}</strong>
                    <span style={s.optionDesc}>{t.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ SECTION 3: Generate Button ═══ */}
        {step === 'ready' && (
          <div style={{ ...s.generateSection, animation: 'fadeSlideUp 0.6s ease' }}>
            <button
              onClick={handleGenerate}
              disabled={generating}
              style={{
                ...s.generateBtn,
                opacity: generating ? 0.7 : 1,
                cursor: generating ? 'not-allowed' : 'pointer',
              }}
              id="btn-generate-questions"
            >
              {generateButtonContent}
            </button>
            <p style={s.generateHint}>
              AI sẽ phân tích nội dung {isVideo ? 'video' : 'tài liệu'} và tạo {count} câu hỏi. Quá trình mất khoảng {isVideo ? '20-60' : '10-20'} giây.
            </p>
          </div>
        )}

        {step === 'ready' && !generatedResult && (
          <div style={s.stickyGenerateBar}>
            <div style={s.stickyGenerateInner}>
              <div>
                <strong style={s.stickyGenerateTitle}>Đã sẵn sàng tạo bộ câu hỏi</strong>
                <p style={s.stickyGenerateText}>
                  {count} câu • {DIFFICULTIES.find((item) => item.value === difficulty)?.label} • {QUESTION_TYPES.find((item) => item.value === questionType)?.label}
                </p>
              </div>
              <button
                onClick={handleGenerate}
                disabled={generating}
                style={{
                  ...s.generateBtnSticky,
                  opacity: generating ? 0.7 : 1,
                  cursor: generating ? 'not-allowed' : 'pointer',
                }}
                id="btn-generate-questions-sticky"
              >
                {generateButtonContent}
              </button>
            </div>
          </div>
        )}

        {/* ═══ SECTION 4: Success Panel (after generation) ═══ */}
        {generatedResult && (
          <div ref={successPanelRef} style={{ ...s.sectionCard, animation: 'fadeSlideUp 0.5s ease', border: '1.5px solid #22c55e40' }}>
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={s.successMark}>OK</div>
              <h2 style={{ ...s.sectionTitle, color: '#22c55e', marginBottom: '8px' }}>
                Sinh câu hỏi thành công!
              </h2>
              <p style={{ ...s.sectionDesc, marginBottom: '14px' }}>
                Đã tạo <strong>{generatedResult.question_count}</strong> câu hỏi từ <strong>{generatedResult.document_name}</strong>
              </p>

              <div style={s.successActions}>
                <button
                  onClick={() => navigate(`/question-sets/${generatedResult.id}`)}
                  className="btn-view-result"
                  id="btn-view-result-primary"
                >
                  Xem ngay bộ câu hỏi
                </button>
                <button
                  onClick={handleUploadNew}
                  className="btn-upload-new"
                  id="btn-upload-new-primary"
                >
                  Tạo bộ khác
                </button>
              </div>

              {generatedResult.questions.length > 0 && (
                <div style={s.successPreview}>
                  <h3 style={s.successPreviewTitle}>Xem nhanh câu hỏi vừa tạo</h3>
                  <div style={s.successQuestionList}>
                    {generatedResult.questions.slice(0, 3).map((item, index) => {
                      const answerText = item.options?.[item.correct_answer]
                        ? `${item.correct_answer}. ${item.options[item.correct_answer]}`
                        : item.correct_answer;
                      const bloomLabels: Record<string, { label: string; color: string }> = {
                        remember: { label: 'Nhận biết', color: '#22c55e' },
                        understand: { label: 'Thông hiểu', color: '#3b82f6' },
                        apply: { label: 'Vận dụng', color: '#f59e0b' },
                        analyze: { label: 'Vận dụng cao', color: '#ef4444' },
                      };
                      const bloom = item.bloom_level ? bloomLabels[item.bloom_level] : null;
                      return (
                        <article key={`${item.question}-${index}`} style={s.successQuestionCard}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <span style={s.successQuestionKicker}>Câu {index + 1}</span>
                            {bloom && (
                              <span style={{
                                fontSize: '10px',
                                padding: '2px 8px',
                                borderRadius: '10px',
                                background: `${bloom.color}18`,
                                color: bloom.color,
                                fontWeight: 600,
                                border: `1px solid ${bloom.color}30`,
                              }}>{bloom.label}</span>
                            )}
                          </div>
                          <p style={s.successQuestionText}>{item.question}</p>
                          <p style={s.successAnswer}>Đáp án: {answerText}</p>
                        </article>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Cross-Validation Stats */}
              {generatedResult.validation_stats?.cross_validated && (
                <div style={{
                  display: 'flex',
                  gap: '16px',
                  justifyContent: 'center',
                  flexWrap: 'wrap',
                  marginBottom: '20px',
                  padding: '16px',
                  borderRadius: '12px',
                  background: 'rgba(99, 102, 241, 0.06)',
                  border: '1px solid rgba(99, 102, 241, 0.15)',
                }}>
                  <div style={{ textAlign: 'center', fontSize: '13px' }}>
	                    <div style={{ fontSize: '11px', color: 'var(--text)', marginBottom: '4px' }}>Kiểm tra chéo bởi</div>
                    <strong style={{ color: '#6366f1' }}>Gemini AI</strong>
                  </div>
                  <div style={{ width: '1px', background: 'rgba(99, 102, 241, 0.2)' }} />
                  <div style={{ textAlign: 'center', fontSize: '13px' }}>
	                    <div style={{ fontSize: '11px', color: 'var(--text)', marginBottom: '4px' }}>Chính xác</div>
                    <strong style={{ color: '#22c55e' }}>{generatedResult.validation_stats.valid_count - generatedResult.validation_stats.fixed_count} câu</strong>
                  </div>
                  {generatedResult.validation_stats.fixed_count > 0 && (
                    <>
                      <div style={{ width: '1px', background: 'rgba(99, 102, 241, 0.2)' }} />
                      <div style={{ textAlign: 'center', fontSize: '13px' }}>
	                        <div style={{ fontSize: '11px', color: 'var(--text)', marginBottom: '4px' }}>Đã sửa</div>
                        <strong style={{ color: '#f59e0b' }}>{generatedResult.validation_stats.fixed_count} câu</strong>
                      </div>
                    </>
                  )}
                  {generatedResult.validation_stats.invalid_count > 0 && (
                    <>
                      <div style={{ width: '1px', background: 'rgba(99, 102, 241, 0.2)' }} />
                      <div style={{ textAlign: 'center', fontSize: '13px' }}>
	                        <div style={{ fontSize: '11px', color: 'var(--text)', marginBottom: '4px' }}>Loại bỏ</div>
                        <strong style={{ color: '#ef4444' }}>{generatedResult.validation_stats.invalid_count} câu</strong>
                      </div>
                    </>
                  )}
                  {generatedResult.validation_stats.replaced_count > 0 && (
                    <>
                      <div style={{ width: '1px', background: 'rgba(99, 102, 241, 0.2)' }} />
                      <div style={{ textAlign: 'center', fontSize: '13px' }}>
	                        <div style={{ fontSize: '11px', color: 'var(--text)', marginBottom: '4px' }}>Thay thế</div>
                        <strong style={{ color: '#3b82f6' }}>{generatedResult.validation_stats.replaced_count} câu</strong>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* TF-IDF Keywords */}
              {generatedResult.keywords && generatedResult.keywords.length > 0 && (
                <div style={{
                  padding: '16px',
                  borderRadius: '12px',
                  background: 'rgba(16, 185, 129, 0.06)',
                  border: '1px solid rgba(16, 185, 129, 0.15)',
                  marginBottom: '16px',
                }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#10b981', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>📊</span> Từ khóa trọng tâm (TF-IDF)
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {generatedResult.keywords.slice(0, 12).map((kw, idx) => {
                      const maxScore = generatedResult.keywords![0]?.score || 1;
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

              {/* Bloom's Taxonomy Distribution */}
              {generatedResult.bloom_distribution && Object.keys(generatedResult.bloom_distribution).length > 0 && (() => {
                const bloomConfig: Record<string, { label: string; color: string; icon: string }> = {
                  remember: { label: 'Nhận biết', color: '#22c55e', icon: 'B1' },
                  understand: { label: 'Thông hiểu', color: '#3b82f6', icon: 'B2' },
                  apply: { label: 'Vận dụng', color: '#f59e0b', icon: 'B3' },
                  analyze: { label: 'Vận dụng cao', color: '#ef4444', icon: 'B4' },
                };
                const totalBloom = Object.values(generatedResult.bloom_distribution!).reduce((a, b) => a + b, 0);
                return (
                  <div style={{
                    padding: '16px',
                    borderRadius: '12px',
                    background: 'rgba(139, 92, 246, 0.06)',
                    border: '1px solid rgba(139, 92, 246, 0.15)',
                    marginBottom: '20px',
                  }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#8b5cf6', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>🎓</span> Phân bố cấp độ Bloom
                    </div>
                    {/* Stacked bar */}
                    <div style={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', height: '24px', marginBottom: '10px' }}>
                      {Object.entries(generatedResult.bloom_distribution!).map(([level, cnt]) => {
                        const config = bloomConfig[level];
                        if (!config || cnt === 0) return null;
                        const pct = (cnt / totalBloom) * 100;
                        return (
                          <div key={level} title={`${config.label}: ${cnt} câu (${pct.toFixed(0)}%)`} style={{
                            width: `${pct}%`,
                            background: config.color,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            fontSize: '11px',
                            fontWeight: 600,
                            minWidth: pct > 8 ? undefined : '20px',
                          }}>
                            {pct >= 15 ? `${config.label} (${cnt})` : cnt}
                          </div>
                        );
                      })}
                    </div>
                    {/* Legend */}
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      {Object.entries(generatedResult.bloom_distribution!).map(([level, cnt]) => {
                        const config = bloomConfig[level];
                        if (!config || cnt === 0) return null;
                        return (
                          <div key={level} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: config.color, display: 'inline-block' }} />
                            <span style={{ color: 'var(--text)' }}>{config.label}: <strong>{cnt}</strong></span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '18px' }}>
                <button
                  onClick={() => navigate(`/question-sets/${generatedResult.id}`)}
                  className="btn-view-result"
                  id="btn-view-result"
                >
	                  Xem bộ câu hỏi
                </button>
                <button
                  onClick={handleUploadNew}
                  className="btn-upload-new"
                  id="btn-upload-new"
                >
	                  Tải lên tài liệu mới
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Keyframe styles */}
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.15); }
        }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .btn-delete-premium {
          padding: 8px 16px;
          font-size: 13px;
          font-weight: 600;
          color: #ef4444;
          background-color: rgba(239, 68, 68, 0.08);
          border: 1.5px solid rgba(239, 68, 68, 0.2);
          border-radius: 8px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          backdrop-filter: blur(4px);
        }
        .btn-delete-premium:hover {
          background-color: rgba(239, 68, 68, 0.16);
          border-color: rgba(239, 68, 68, 0.45);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(239, 68, 68, 0.15);
        }
        .btn-delete-premium:active {
          transform: translateY(0);
        }
        .btn-confirm-delete {
          padding: 8px 16px;
          font-size: 13px;
          font-weight: 700;
          color: #fff;
          background-color: #dc2626;
          border: 1.5px solid #dc2626;
          border-radius: 8px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          transition: all 0.2s ease;
          box-shadow: 0 4px 12px rgba(220, 38, 38, 0.25);
        }
        .btn-confirm-delete:hover {
          background-color: #b91c1c;
          border-color: #b91c1c;
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(220, 38, 38, 0.35);
        }
        .btn-cancel-delete {
          padding: 8px 16px;
          font-size: 13px;
          font-weight: 500;
          color: var(--text);
          background-color: transparent;
          border: 1.5px solid var(--border);
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .btn-cancel-delete:hover {
          background-color: var(--border);
          color: var(--text-h);
        }
        .btn-change-doc {
          padding: 8px 16px;
          font-size: 13px;
          font-weight: 500;
          color: var(--text);
          background-color: transparent;
          border: 1.5px solid var(--border);
          border-radius: 8px;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.2s ease;
        }
        .btn-change-doc:hover {
          background-color: var(--border);
          color: var(--text-h);
        }
        .deleting-spinner {
          display: inline-block;
          width: 16px;
          height: 16px;
          border: 2px solid rgba(239, 68, 68, 0.2);
          border-top-color: #ef4444;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        .btn-view-result {
          padding: 12px 24px;
          font-size: 14px;
          font-weight: 700;
          color: #fff;
          background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
          border: none;
          border-radius: 10px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 4px 14px rgba(34, 197, 94, 0.3);
        }
        .btn-view-result:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(34, 197, 94, 0.4);
        }
        .btn-view-result:active {
          transform: translateY(0);
        }
        .btn-upload-new {
          padding: 12px 24px;
          font-size: 14px;
          font-weight: 700;
          color: #fff;
          background: linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%);
          border: none;
          border-radius: 10px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 4px 14px rgba(15, 118, 110, 0.24);
        }
        .btn-upload-new:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(15, 118, 110, 0.3);
        }
        .btn-upload-new:active {
          transform: translateY(0);
        }
      `}</style>
    </div>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  pageContainer: {
    width: '100%',
    minHeight: '100%',
    display: 'flex',
    justifyContent: 'center',
    padding: 'clamp(28px, 4vw, 48px) 24px 80px',
    boxSizing: 'border-box',
  },
  pageInner: {
    width: '100%',
    maxWidth: '920px',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },

  // Hero
  heroSection: {
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  },
  heroBadge: {
    width: '56px',
    height: '56px',
    borderRadius: '18px',
    background: 'linear-gradient(135deg, #8b7cf8, #c084fc, #f74a8a)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontSize: '18px',
    fontWeight: '900',
    boxShadow: '0 10px 28px rgba(139, 124, 248, 0.3)',
  },
  heroTitle: {
    fontSize: '30px',
    fontWeight: '800',
    color: 'var(--text-h)',
    margin: '8px 0 0 0',
    letterSpacing: '-0.02em',
  },
  heroSubtitle: {
    fontSize: '15px',
    color: 'var(--text)',
    margin: 0,
    maxWidth: '500px',
    lineHeight: '1.6',
  },

  // Error
  errorAlert: {
    padding: '14px 18px',
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    color: '#ef4444',
    borderRadius: '14px',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  alertMark: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '22px',
    height: '22px',
    borderRadius: '999px',
    color: '#fff',
    backgroundColor: '#ef4444',
    fontSize: '13px',
    fontWeight: '800',
    flexShrink: 0,
  },

  // Section Card
  sectionCard: {
    padding: '28px',
    borderRadius: '22px',
    border: '1px solid rgba(139, 124, 248, 0.10)',
    background: 'rgba(255, 255, 255, 0.65)',
    backdropFilter: 'blur(20px) saturate(1.3)',
    boxShadow: '0 8px 32px rgba(139, 124, 248, 0.08), 0 1px 4px rgba(0,0,0,0.04)',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '14px',
    marginBottom: '22px',
  },
  sectionHeaderWithAction: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '14px',
    flexWrap: 'wrap',
    marginBottom: '22px',
  },
  sectionNumber: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    borderRadius: '12px',
    background: 'linear-gradient(135deg, #8b7cf8, #c084fc)',
    color: '#fff',
    fontSize: '15px',
    fontWeight: '700',
    flexShrink: 0,
    boxShadow: '0 4px 14px rgba(139, 124, 248, 0.25)',
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: 'var(--text-h)',
    margin: '0 0 4px 0',
  },
  sectionDesc: {
    fontSize: '14px',
    color: 'var(--text)',
    margin: 0,
  },

  // Drop Zone
  dropZone: {
    border: '2px dashed rgba(139, 124, 248, 0.30)',
    borderRadius: '22px',
    padding: '44px 24px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
  },
  hiddenInput: {
    display: 'none',
  },
  dropIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '56px',
    height: '56px',
    borderRadius: '18px',
    color: '#fff',
    background: 'linear-gradient(135deg, #8b7cf8, #c084fc)',
    fontSize: '32px',
    fontWeight: '800',
    lineHeight: 1,
    marginBottom: '4px',
    boxShadow: '0 10px 28px rgba(139, 124, 248, 0.3)',
  },
  dropTitle: {
    fontSize: '16px',
    fontWeight: '700',
    color: 'var(--text-h)',
    margin: 0,
  },
  dropHint: {
    fontSize: '13px',
    color: 'var(--muted)',
    margin: 0,
  },

  // File Info
  fileInfo: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 18px',
    borderRadius: '14px',
    backgroundColor: 'rgba(139, 124, 248, 0.06)',
    border: '1px solid rgba(139, 124, 248, 0.14)',
  },
  fileInfoActions: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  deletingContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: '#ef4444',
    fontWeight: '600',
    fontSize: '13px',
  },
  fileInfoLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
  },
  fileIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '46px',
    height: '40px',
    padding: '0 10px',
    borderRadius: '13px',
    color: '#fff',
    background: 'linear-gradient(135deg, #8b7cf8, #c084fc)',
    fontSize: '12px',
    fontWeight: '800',
    boxShadow: '0 4px 12px rgba(139, 124, 248, 0.2)',
  },
  fileNameText: {
    fontSize: '15px',
    fontWeight: '700',
    color: 'var(--text-h)',
    margin: 0,
    wordBreak: 'break-all',
  },
  fileSizeText: {
    fontSize: '13px',
    color: 'var(--muted)',
    margin: '2px 0 0 0',
  },
  changeFileBtn: {
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text)',
    backgroundColor: 'rgba(255,255,255,0.6)',
    border: '1px solid rgba(139, 124, 248, 0.14)',
    borderRadius: '10px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'all 0.2s ease',
    backdropFilter: 'blur(8px)',
  },

  // Progress
  progressContainer: {
    marginTop: '20px',
    padding: '18px',
    borderRadius: '14px',
    backgroundColor: 'rgba(139, 124, 248, 0.04)',
    border: '1px solid rgba(139, 124, 248, 0.10)',
  },
  progressTrack: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    position: 'relative',
  },
  progressStep: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    flex: 1,
    position: 'relative',
    gap: '8px',
  },
  progressDot: {
    width: '34px',
    height: '34px',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10px',
    fontWeight: '800',
    transition: 'all 0.4s ease',
    zIndex: 1,
  },
  progressLabel: {
    fontSize: '11px',
    textAlign: 'center',
    transition: 'all 0.3s ease',
    maxWidth: '100px',
    lineHeight: '1.3',
  },
  progressLine: {
    position: 'absolute',
    top: '17px',
    left: '60%',
    right: '-40%',
    height: '3px',
    borderRadius: '2px',
    transition: 'background-color 0.4s ease',
    zIndex: 0,
  },

  // Config
  configBlock: {
    marginBottom: '22px',
  },
  configLabel: {
    fontSize: '15px',
    fontWeight: '700',
    color: 'var(--text-h)',
    margin: '0 0 12px 0',
  },

  // Chips
  chipRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  chip: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--text)',
    backgroundColor: 'rgba(139, 124, 248, 0.04)',
    border: '1.5px solid rgba(139, 124, 248, 0.14)',
    borderRadius: '999px',
    cursor: 'pointer',
    transition: 'all 0.25s ease',
    outline: 'none',
  },
  chipActive: {
    color: '#fff',
    backgroundColor: '#8b7cf8',
    borderColor: '#8b7cf8',
    boxShadow: '0 6px 18px rgba(139, 124, 248, 0.3)',
  },

  // Option Cards
  cardRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '10px',
  },
  optionCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
    padding: '16px 12px',
    borderRadius: '16px',
    border: '1.5px solid rgba(139, 124, 248, 0.10)',
    backgroundColor: 'rgba(139, 124, 248, 0.03)',
    cursor: 'pointer',
    transition: 'all 0.25s ease',
    textAlign: 'center',
    outline: 'none',
  },
  optionCardActive: {
    borderColor: '#8b7cf8',
    backgroundColor: 'rgba(139, 124, 248, 0.08)',
    boxShadow: '0 6px 20px rgba(139, 124, 248, 0.15)',
    transform: 'translateY(-2px)',
  },
  optionIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '40px',
    height: '32px',
    padding: '0 10px',
    borderRadius: '999px',
    backgroundColor: 'rgba(139, 124, 248, 0.10)',
    color: '#7c5ce7',
    fontSize: '12px',
    fontWeight: '800',
  },
  optionLabel: {
    fontSize: '14px',
    color: 'var(--text-h)',
    fontWeight: '600',
  },
  optionDesc: {
    fontSize: '11px',
    color: 'var(--muted)',
    lineHeight: '1.3',
  },

  // Generate
  generateSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
  },
  generateBtn: {
    width: '100%',
    maxWidth: '460px',
    padding: '16px 32px',
    fontSize: '17px',
    fontWeight: '700',
    color: '#fff',
    background: 'linear-gradient(135deg, #8b7cf8, #c084fc, #f74a8a)',
    border: 'none',
    borderRadius: '16px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    boxShadow: '0 10px 28px rgba(139, 124, 248, 0.3)',
  },
  generateBtnCompact: {
    minWidth: '200px',
    padding: '12px 20px',
    fontSize: '14px',
    fontWeight: '700',
    color: '#fff',
    background: 'linear-gradient(135deg, #8b7cf8, #c084fc, #f74a8a)',
    border: 'none',
    borderRadius: '14px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    boxShadow: '0 8px 24px rgba(139, 124, 248, 0.25)',
  },
  stickyGenerateBar: {
    position: 'sticky',
    bottom: '18px',
    zIndex: 12,
    marginTop: '-8px',
    pointerEvents: 'none',
  },
  stickyGenerateInner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '14px',
    flexWrap: 'wrap',
    padding: '14px 18px',
    border: '1px solid rgba(139, 124, 248, 0.15)',
    borderRadius: '18px',
    background: 'rgba(255, 255, 255, 0.8)',
    boxShadow: '0 16px 40px rgba(139, 124, 248, 0.12)',
    backdropFilter: 'blur(20px)',
    pointerEvents: 'auto',
  },
  stickyGenerateTitle: {
    display: 'block',
    color: 'var(--text-h)',
    fontSize: '14px',
    fontWeight: '800',
  },
  stickyGenerateText: {
    margin: '2px 0 0',
    color: 'var(--muted)',
    fontSize: '12px',
    lineHeight: '1.4',
  },
  generateBtnSticky: {
    minWidth: '180px',
    padding: '12px 18px',
    fontSize: '14px',
    fontWeight: '700',
    color: '#fff',
    background: 'linear-gradient(135deg, #8b7cf8, #c084fc, #f74a8a)',
    border: 'none',
    borderRadius: '14px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    boxShadow: '0 8px 24px rgba(139, 124, 248, 0.25)',
  },
  generateBtnInner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
  },
  btnSpinner: {
    display: 'inline-block',
    width: '18px',
    height: '18px',
    border: '2.5px solid rgba(255,255,255,0.3)',
    borderTopColor: '#fff',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  generateHint: {
    fontSize: '13px',
    color: 'var(--muted)',
    textAlign: 'center',
    margin: 0,
  },
  transcribeStatus: {
    marginTop: '12px',
    fontSize: '13px',
    color: '#8b7cf8',
    textAlign: 'center',
    fontWeight: '600',
    animation: 'pulse 2s ease-in-out infinite',
  },
  successMark: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '56px',
    height: '56px',
    marginBottom: '12px',
    borderRadius: '18px',
    color: '#fff',
    background: 'linear-gradient(135deg, #10b981, #34d399)',
    fontSize: '18px',
    fontWeight: '800',
    boxShadow: '0 10px 28px rgba(16, 185, 129, 0.25)',
  },
  successActions: {
    display: 'flex',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: '12px',
    marginBottom: '18px',
  },
  successPreview: {
    width: 'min(100%, 720px)',
    margin: '0 auto 18px',
    textAlign: 'left',
  },
  successPreviewTitle: {
    margin: '0 0 10px',
    color: 'var(--text-h)',
    fontSize: '15px',
    fontWeight: '800',
    textAlign: 'left',
  },
  successQuestionList: {
    display: 'grid',
    gap: '10px',
  },
  successQuestionCard: {
    padding: '14px 16px',
    borderRadius: '16px',
    border: '1px solid rgba(139, 124, 248, 0.12)',
    background: 'rgba(255, 255, 255, 0.6)',
    backdropFilter: 'blur(12px)',
    boxShadow: '0 4px 16px rgba(139, 124, 248, 0.06)',
  },
  successQuestionKicker: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '50px',
    height: '24px',
    padding: '0 10px',
    borderRadius: '999px',
    color: '#7c5ce7',
    backgroundColor: 'rgba(139, 124, 248, 0.10)',
    fontSize: '12px',
    fontWeight: '800',
  },
  successQuestionText: {
    margin: '8px 0 6px',
    color: 'var(--text-h)',
    fontSize: '14px',
    fontWeight: '700',
    lineHeight: '1.55',
  },
  successAnswer: {
    margin: 0,
    color: 'var(--muted)',
    fontSize: '13px',
    lineHeight: '1.5',
  },
};

export default QuickGeneratePage;

