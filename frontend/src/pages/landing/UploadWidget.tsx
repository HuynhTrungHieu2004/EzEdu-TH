/**
 * UploadWidget — Khối nhập học liệu trong Hero Section
 *
 * Hành vi:
 * - Guest  → click/drop → chuyển đến /register (không thực hiện upload)
 * - Logged-in → upload thật qua documentApi.upload() với progress thật
 *   (cần token trong localStorage)
 *
 * Định dạng hỗ trợ (theo backend):
 *   pdf, docx, pptx, mp4, mov, webm, mkv
 *
 * Không hiển thị tab YouTube (backend chưa hỗ trợ xử lý YouTube URL).
 * Không giả lập upload, không giả lập progress, không gọi API giả.
 */
import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, CheckCircle, AlertCircle, Loader, FileText, Video } from 'lucide-react';
import { documentApi } from '../../api/documentApi';

// ─── Định dạng hỗ trợ ─────────────────────────────────────────────────────────
const DOC_TYPES = ['PDF', 'DOCX', 'PPTX'];
const VIDEO_TYPES = ['MP4', 'MOV', 'WEBM', 'MKV'];
const ACCEPT = '.pdf,.docx,.pptx,.mp4,.mov,.webm,.mkv';

// ─── Props ─────────────────────────────────────────────────────────────────────
interface UploadWidgetProps {
  hasToken: boolean;
}

// ─── Upload state ──────────────────────────────────────────────────────────────
type UploadState =
  | { phase: 'idle' }
  | { phase: 'uploading'; fileName: string; percent: number }
  | { phase: 'done';      fileName: string; documentId: string }
  | { phase: 'error';     message: string };

// ─── Component ────────────────────────────────────────────────────────────────
export default function UploadWidget({ hasToken }: UploadWidgetProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [state, setState] = useState<UploadState>({ phase: 'idle' });

  // ── Kiểm tra loại file ──────────────────────────────────────────────────────
  const isFileAllowed = (file: File): boolean => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    return ['pdf', 'docx', 'pptx', 'mp4', 'mov', 'webm', 'mkv'].includes(ext);
  };

  // ── Xử lý file được chọn/kéo thả ──────────────────────────────────────────
  const handleFile = useCallback(
    async (file: File) => {
      // Guest → chuyển hướng đến đăng ký
      if (!hasToken) {
        navigate('/register');
        return;
      }

      // Kiểm tra định dạng
      if (!isFileAllowed(file)) {
        setState({
          phase: 'error',
          message: `Định dạng không được hỗ trợ. Chỉ chấp nhận: PDF, DOCX, PPTX, MP4, MOV, WEBM, MKV.`,
        });
        return;
      }

      // Bắt đầu upload thật
      setState({ phase: 'uploading', fileName: file.name, percent: 0 });

      try {
        const result = await documentApi.upload(file, (percent) => {
          setState({ phase: 'uploading', fileName: file.name, percent });
        });

        setState({ phase: 'done', fileName: file.name, documentId: result.document_id });

        // Sau 2s tự chuyển đến trang chi tiết tài liệu vừa upload
        setTimeout(() => {
          navigate(`/documents/${result.document_id}`);
        }, 2000);
      } catch (err: unknown) {
        const msg =
          (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
          'Tải tệp thất bại. Vui lòng thử lại.';
        setState({ phase: 'error', message: msg });
      }
    },
    [hasToken, navigate]
  );

  // ── Drag & drop handlers ────────────────────────────────────────────────────
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = ()                    => { setDragOver(false); };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  // ── Input change ────────────────────────────────────────────────────────────
  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = ''; // reset để có thể chọn lại cùng file
  };

  // ── Reset ───────────────────────────────────────────────────────────────────
  const reset = () => setState({ phase: 'idle' });

  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div className="lp-upload-widget" role="region" aria-label="Tải lên học liệu">

      {/* ── Trạng thái: idle / drag over ─────────────────────────── */}
      {state.phase === 'idle' && (
        <>
          {/* Drop zone */}
          <div
            className={`lp-upload-drop${dragOver ? ' lp-upload-drop--over' : ''}`}
            role="button"
            tabIndex={0}
            aria-label={
              hasToken
                ? 'Kéo thả tệp vào đây hoặc nhấn để chọn tệp'
                : 'Nhấn để đăng ký và tải lên học liệu'
            }
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => hasToken ? inputRef.current?.click() : navigate('/register')}
            onKeyDown={e => e.key === 'Enter' && (hasToken ? inputRef.current?.click() : navigate('/register'))}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              onChange={onInputChange}
              style={{ display: 'none' }}
              aria-hidden="true"
            />

            {/* Icon */}
            <div className="lp-upload-drop-icon" aria-hidden="true">
              <Upload size={28} strokeWidth={1.8} aria-hidden="true" />
            </div>

            {/* Text */}
            <p className="lp-upload-drop-text">
              {hasToken
                ? 'Kéo thả học liệu vào đây'
                : 'Đăng ký để bắt đầu tải học liệu'}
            </p>
            <p className="lp-upload-drop-sub">
              {hasToken
                ? 'hoặc nhấn để chọn tệp từ máy tính'
                : 'Tính năng upload yêu cầu đăng nhập'}
            </p>

            {/* Nút chọn tệp */}
            <button
              className="lp-upload-browse-btn"
              type="button"
              onClick={e => {
                e.stopPropagation();
                if (hasToken) {
                  inputRef.current?.click();
                } else {
                  navigate('/register');
                }
              }}
            >
              {hasToken ? 'Chọn tệp' : 'Đăng ký miễn phí →'}
            </button>
          </div>

          {/* Chip loại file */}
          <div className="lp-upload-types" role="list" aria-label="Định dạng hỗ trợ">
            <div className="lp-upload-type-group">
              <FileText size={13} strokeWidth={2} aria-hidden="true" />
              {DOC_TYPES.map(t => (
                <span key={t} className="lp-upload-type-chip lp-upload-type-chip--doc" role="listitem">
                  {t}
                </span>
              ))}
            </div>
            <div className="lp-upload-type-group">
              <Video size={13} strokeWidth={2} aria-hidden="true" />
              {VIDEO_TYPES.map(t => (
                <span key={t} className="lp-upload-type-chip lp-upload-type-chip--video" role="listitem">
                  {t}
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Trạng thái: đang upload ───────────────────────────────── */}
      {state.phase === 'uploading' && (
        <div className="lp-upload-progress" aria-live="polite" aria-busy="true">
          <Loader size={24} strokeWidth={2} className="lp-upload-spin" aria-hidden="true" />
          <p className="lp-upload-progress-name">{state.fileName}</p>
          <div className="lp-upload-bar-wrap" role="progressbar" aria-valuenow={state.percent} aria-valuemin={0} aria-valuemax={100}>
            <div className="lp-upload-bar-fill" style={{ width: `${state.percent}%` }} />
          </div>
          <p className="lp-upload-progress-pct">{state.percent}%</p>
        </div>
      )}

      {/* ── Trạng thái: upload thành công ─────────────────────────── */}
      {state.phase === 'done' && (
        <div className="lp-upload-result lp-upload-result--success" aria-live="polite">
          <CheckCircle size={28} strokeWidth={1.8} className="lp-upload-result-icon lp-upload-result-icon--success" aria-hidden="true" />
          <p className="lp-upload-result-title">Tải lên thành công!</p>
          <p className="lp-upload-result-sub">{state.fileName}</p>
          <p className="lp-upload-result-hint">Đang chuyển đến trang xử lý...</p>
        </div>
      )}

      {/* ── Trạng thái: lỗi ──────────────────────────────────────── */}
      {state.phase === 'error' && (
        <div className="lp-upload-result lp-upload-result--error" aria-live="polite">
          <AlertCircle size={28} strokeWidth={1.8} className="lp-upload-result-icon lp-upload-result-icon--error" aria-hidden="true" />
          <p className="lp-upload-result-title">Tải lên thất bại</p>
          <p className="lp-upload-result-sub">{state.message}</p>
          <button className="lp-upload-retry-btn" onClick={reset}>
            Thử lại
          </button>
        </div>
      )}
    </div>
  );
}
