import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Upload as UploadIcon, Video, X } from 'lucide-react';
import { documentApi } from '../api/documentApi';
import client from '../api/client';
import { getApiErrorDetail } from '../api/errors';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  PageHeader,
  ProgressBar,
  ProgressSteps,
} from '../components/ui';
import type { ProgressStep } from '../components/ui';
import './dashboard.css';
import './quick-generate.css';

type Phase = 'idle' | 'uploading' | 'extracting' | 'transcribing' | 'indexing' | 'ready' | 'error';

const DOCUMENT_EXTENSIONS = ['pdf', 'docx', 'pptx'];
const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm', 'mkv'];
const ACCEPTED_EXTENSIONS = [...DOCUMENT_EXTENSIONS, ...VIDEO_EXTENSIONS];
const MAX_DOCUMENT_SIZE = 20 * 1024 * 1024;
const MAX_VIDEO_SIZE = 100 * 1024 * 1024;
const POLL_INTERVAL_MS = 3000;

const DOC_STEPS: Array<{ id: Phase; label: string }> = [
  { id: 'uploading', label: 'Tải lên hệ thống' },
  { id: 'extracting', label: 'Trích xuất nội dung' },
  { id: 'indexing', label: 'Lập chỉ mục tìm kiếm' },
];

const VIDEO_STEPS: Array<{ id: Phase; label: string }> = [
  { id: 'uploading', label: 'Tải video lên' },
  { id: 'transcribing', label: 'AI phân tích video' },
  { id: 'indexing', label: 'Lập chỉ mục tìm kiếm' },
];

function validateFile(file: File): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (!ACCEPTED_EXTENSIONS.includes(ext)) {
    return `Chỉ hỗ trợ: ${DOCUMENT_EXTENSIONS.map((e) => '.' + e).join(', ')}, ${VIDEO_EXTENSIONS.map((e) => '.' + e).join(', ')}`;
  }
  const isVideo = VIDEO_EXTENSIONS.includes(ext);
  if (isVideo && file.size > MAX_VIDEO_SIZE) return 'Dung lượng video vượt quá 100MB.';
  if (!isVideo && file.size > MAX_DOCUMENT_SIZE) return 'Dung lượng tài liệu vượt quá 20MB.';
  return null;
}

/**
 * Tải học liệu mới rồi tự động xử lý xong xuôi (trích xuất/phân tích + lập chỉ
 * mục). Khi sẵn sàng, điều hướng thẳng sang bước cấu hình & sinh câu hỏi
 * (`QuestionGeneratePage`, dùng chung với luồng "học liệu đã có sẵn") — trang
 * này KHÔNG còn tự dựng lại phần cấu hình/kết quả của riêng nó.
 *
 * Trước đây trang này làm lại toàn bộ pipeline (tải lên → cấu hình → sinh →
 * hiện kết quả) trong một trang riêng, trùng lặp với luồng
 * `/documents → /documents/:id → /documents/:id/questions`. Xem
 * docs/ui-redesign/01-audit-report.md §6.3 (lỗi M1).
 */
export default function QuickGeneratePage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [isVideo, setIsVideo] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [transcribeNote, setTranscribeNote] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  function resetAll() {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    setFile(null);
    setPhase('idle');
    setDocumentId(null);
    setIsVideo(false);
    setUploadPercent(0);
    setTranscribeNote('');
    setErrorMsg(null);
    setDeleting(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const pollTranscription = useCallback(async function poll(docId: string) {
    try {
      const res = await client.get(`/documents/${docId}`);
      const status = res.data.status;

      if (status === 'transcribed' || status === 'indexed') {
        setTranscribeNote('');
        setPhase('indexing');
        try {
          await documentApi.index(docId);
        } catch (err: unknown) {
          const detail = getApiErrorDetail(err);
          if (!detail?.includes('already indexed')) {
            setErrorMsg(detail ?? 'Lập chỉ mục thất bại.');
            setPhase('error');
            return;
          }
        }
        setPhase('ready');
      } else if (status === 'failed') {
        setErrorMsg(res.data.error_message || 'Phân tích video thất bại.');
        setPhase('error');
      } else {
        setTranscribeNote('AI đang phân tích nội dung video...');
        pollTimerRef.current = setTimeout(() => void poll(docId), POLL_INTERVAL_MS);
      }
    } catch {
      setErrorMsg('Không thể kiểm tra trạng thái xử lý video.');
      setPhase('error');
    }
  }, []);

  const processFile = useCallback(async (selected: File, videoFlag: boolean) => {
    setErrorMsg(null);
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);

    setPhase('uploading');
    setUploadPercent(0);
    let docId: string;
    try {
      const res = await documentApi.upload(selected, (percent) => setUploadPercent(percent));
      docId = res.document_id;
      setDocumentId(docId);
    } catch (err: unknown) {
      setErrorMsg(getApiErrorDetail(err) ?? 'Tải tài liệu lên thất bại.');
      setPhase('error');
      return;
    }

    if (videoFlag) {
      setPhase('transcribing');
      setTranscribeNote('Đang gửi video cho AI phân tích...');
      try {
        await documentApi.transcribe(docId);
      } catch (err: unknown) {
        setErrorMsg(getApiErrorDetail(err) ?? 'Không thể bắt đầu phân tích video.');
        setPhase('error');
        return;
      }
      pollTimerRef.current = setTimeout(() => void pollTranscription(docId), POLL_INTERVAL_MS);
      return;
    }

    setPhase('extracting');
    try {
      await documentApi.extract(docId);
    } catch (err: unknown) {
      const detail = getApiErrorDetail(err);
      if (!detail?.includes('already been extracted')) {
        setErrorMsg(detail ?? 'Trích xuất nội dung thất bại.');
        setPhase('error');
        return;
      }
    }

    setPhase('indexing');
    try {
      await documentApi.index(docId);
    } catch (err: unknown) {
      const detail = getApiErrorDetail(err);
      if (!detail?.includes('already indexed')) {
        setErrorMsg(detail ?? 'Lập chỉ mục thất bại.');
        setPhase('error');
        return;
      }
    }

    setPhase('ready');
  }, [pollTranscription]);

  function handleFileSelected(selected: File) {
    const validationError = validateFile(selected);
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }
    const ext = selected.name.split('.').pop()?.toLowerCase() || '';
    const videoFlag = VIDEO_EXTENSIONS.includes(ext);
    setFile(selected);
    setIsVideo(videoFlag);
    setErrorMsg(null);
    void processFile(selected, videoFlag);
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    setDragOver(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) handleFileSelected(dropped);
  }

  async function handleDeleteDocument() {
    if (!documentId) return;
    setDeleting(true);
    try {
      await documentApi.delete(documentId);
      resetAll();
    } catch (err: unknown) {
      setErrorMsg(getApiErrorDetail(err) ?? 'Xoá tài liệu thất bại.');
    } finally {
      setDeleting(false);
    }
  }

  // Sẵn sàng: chuyển thẳng sang bước cấu hình & sinh câu hỏi dùng chung.
  useEffect(() => {
    if (phase === 'ready' && documentId) {
      navigate(`/documents/${documentId}/questions`, { replace: true });
    }
  }, [phase, documentId, navigate]);

  const stepDefs = isVideo ? VIDEO_STEPS : DOC_STEPS;
  const stepOrder = stepDefs.map((item) => item.id);
  const currentIndex = stepOrder.indexOf(phase);
  const progressSteps: ProgressStep[] = stepDefs.map((item, index) => ({
    id: item.id,
    label: item.label,
    description:
      item.id === 'uploading' && phase === 'uploading'
        ? `${uploadPercent}%`
        : item.id === 'transcribing' && phase === 'transcribing'
          ? transcribeNote
          : undefined,
    status:
      phase === 'error' && index === currentIndex
        ? 'error'
        : index < currentIndex
          ? 'done'
          : index === currentIndex
            ? 'active'
            : 'pending',
  }));

  return (
    <>
      <PageHeader
        eyebrow="Tạo đề mới"
        title="Tải học liệu và sinh câu hỏi"
        description="Kéo thả một tài liệu hoặc video bài giảng — hệ thống xử lý xong sẽ tự chuyển sang bước cấu hình câu hỏi."
      />

      {errorMsg && (
        <Alert tone="error" style={{ marginBottom: 'var(--ez-space-6)' }}>
          {errorMsg}
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle as="h2">Học liệu</CardTitle>
          </div>
        </CardHeader>
        <CardBody>
          {!file ? (
            <div
              className="qg-dropzone"
              data-drag-over={dragOver ? 'true' : undefined}
              onDrop={handleDrop}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') fileInputRef.current?.click();
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.pptx,.mp4,.mov,.webm,.mkv"
                onChange={(event) => {
                  const selected = event.target.files?.[0];
                  if (selected) handleFileSelected(selected);
                }}
                className="ez-sr-only"
                aria-label="Chọn tệp học liệu"
              />
              <UploadIcon size={28} aria-hidden="true" />
              <p className="qg-dropzone-title">Nhấp hoặc kéo thả tài liệu / video vào đây</p>
              <p className="ez-card-desc">Tài liệu: PDF, DOCX, PPTX (tối đa 20MB)</p>
              <p className="ez-card-desc">Video: MP4, MOV, WEBM, MKV (tối đa 100MB)</p>
            </div>
          ) : (
            <>
              <div className="qg-file-row">
                <span className="dash-row-icon" aria-hidden="true">
                  {isVideo ? <Video size={18} /> : <FileText size={18} />}
                </span>
                <span className="dash-row-main">
                  <span className="dash-row-title">{file.name}</span>
                  <span className="dash-row-meta">
                    <span>{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                  </span>
                </span>
                {phase !== 'error' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    aria-label="Huỷ và chọn học liệu khác"
                    onClick={resetAll}
                  >
                    <X size={16} aria-hidden="true" />
                  </Button>
                )}
              </div>

              {phase === 'uploading' && (
                <ProgressBar
                  value={uploadPercent}
                  showHeader
                  label="Đang tải lên"
                  valueText={`${uploadPercent}%`}
                  className="qg-upload-progress"
                />
              )}

              {phase !== 'idle' && (
                <ProgressSteps steps={progressSteps} className="qg-steps" />
              )}

              {phase === 'error' && (
                <div style={{ display: 'flex', gap: 'var(--ez-space-3)', marginTop: 'var(--ez-space-4)' }}>
                  <Button variant="outline" onClick={resetAll}>
                    Thử lại với học liệu khác
                  </Button>
                  {documentId && (
                    <Button variant="outline" loading={deleting} onClick={handleDeleteDocument}>
                      Xoá học liệu lỗi
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </CardBody>
      </Card>
    </>
  );
}
