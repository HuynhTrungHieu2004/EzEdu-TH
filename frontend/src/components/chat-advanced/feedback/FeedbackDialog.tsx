import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ThumbsDown, X } from 'lucide-react';
import type { LocalChatMessage } from '../../../types/chat';
import type { FeedbackReasonCode, FeedbackData } from '../../../types/feedback';
import { FeedbackReasonSelector } from './FeedbackReasonSelector';
import { CitationReportSelector } from './CitationReportSelector';

interface FeedbackDialogProps {
  isOpen: boolean;
  message: LocalChatMessage;
  initialData?: FeedbackData | null;
  onClose: () => void;
  onSubmit: (data: FeedbackData) => Promise<void>;
}

export const FeedbackDialog: React.FC<FeedbackDialogProps> = ({
  isOpen,
  message,
  initialData,
  onClose,
  onSubmit,
}) => {
  const [selectedReasons, setSelectedReasons] = useState<FeedbackReasonCode[]>([]);
  const [comment, setComment] = useState('');
  const [selectedCitations, setSelectedCitations] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Sync initial feedback data when modal opens
  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement as HTMLElement;
      const id = requestAnimationFrame(() => {
        setSelectedReasons(initialData?.reason_codes || []);
        setComment(initialData?.comment || '');
        setSelectedCitations(initialData?.reported_citation_ids || []);
        setErrorMsg(null);
        containerRef.current?.focus();
      });
      return () => cancelAnimationFrame(id);
    }
    return undefined;
  }, [isOpen, initialData]);

  // Escape key handler to close the modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (!isOpen && previousActiveElement.current) {
        previousActiveElement.current.focus();
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const isCommentRequired = selectedReasons.includes('other');
  const isFormInvalid =
    selectedReasons.length === 0 && !comment.trim();
  const isSubmitDisabled = isFormInvalid || (isCommentRequired && !comment.trim()) || submitting;

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitDisabled) {
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);

    const payload: FeedbackData = {
      rating: 'not_helpful',
      reason_codes: selectedReasons,
      comment: comment.trim() || null,
      reported_citation_ids: selectedCitations,
    };

    try {
      await onSubmit(payload);
      onClose();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      setErrorMsg(axiosErr.response?.data?.detail || 'Không thể lưu phản hồi. Vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="feedback-dialog-title">
      <div
        ref={containerRef}
        tabIndex={-1}
        style={styles.modal}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={styles.header}>
          <h3 id="feedback-dialog-title" style={styles.title}>
            <ThumbsDown size={16} aria-hidden="true" /><span>Đóng góp ý kiến cho câu trả lời</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={styles.closeBtn}
            title="Đóng hộp thoại"
            aria-label="Đóng hộp thoại"
            disabled={submitting}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleFormSubmit} style={styles.body}>
          {errorMsg && (
            <div style={styles.errorAlert} role="alert">
              <AlertTriangle size={16} aria-hidden="true" />
              <span>{errorMsg}</span>
            </div>
          )}

          <FeedbackReasonSelector
            selectedReasons={selectedReasons}
            onChange={(reasons) => {
              setSelectedReasons(reasons);
              setErrorMsg(null);
            }}
          />

          <CitationReportSelector
            internalCitations={message.internal_citations}
            webCitations={message.web_citations}
            selectedCitations={selectedCitations}
            onChange={(citations) => {
              setSelectedCitations(citations);
              setErrorMsg(null);
            }}
          />

          <div style={styles.commentContainer}>
            <label htmlFor="feedback-comment" style={styles.commentLabel}>
              Nhận xét chi tiết {isCommentRequired && <span style={styles.required}>*</span>}:
            </label>
            <textarea
              id="feedback-comment"
              rows={4}
              maxLength={500}
              placeholder={
                isCommentRequired
                  ? "Vui lòng nhập lý do cụ thể tại đây (bắt buộc)..."
                  : "Ý kiến đóng góp bổ sung của bạn (tùy chọn)..."
              }
              value={comment}
              onChange={(e) => {
                setComment(e.target.value);
                setErrorMsg(null);
              }}
              style={styles.textarea}
              disabled={submitting}
            />
            <div style={styles.counter}>{comment.length} / 500</div>
          </div>

          <div style={styles.footer}>
            <button
              type="button"
              onClick={onClose}
              style={styles.cancelBtn}
              disabled={submitting}
            >
              Hủy
            </button>
            <button
              type="submit"
              style={{
                ...styles.submitBtn,
                ...(isSubmitDisabled ? styles.submitBtnDisabled : {}),
              }}
              disabled={isSubmitDisabled}
            >
              {submitting ? 'Đang gửi...' : 'Gửi phản hồi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const styles = {
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'var(--overlay-bg)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '16px',
  },
  modal: {
    backgroundColor: 'var(--ez-surface)',
    border: '1px solid var(--ez-border)',
    borderRadius: '16px',
    width: '100%',
    maxWidth: '560px',
    boxShadow: 'var(--ez-shadow-xl)',
    outline: 'none',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column' as const,
    overflowY: 'auto' as const,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid var(--ez-border)',
  },
  title: {
    margin: 0,
    fontSize: '15px',
    fontWeight: '700',
    color: 'var(--ez-text)',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  closeBtn: {
    border: 'none',
    backgroundColor: 'transparent',
    fontSize: '16px',
    cursor: 'pointer',
    color: 'var(--ez-text-muted)',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'color 0.2s',
  },
  body: {
    padding: '20px',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  errorAlert: {
    padding: '10px 12px',
    borderRadius: '8px',
    backgroundColor: 'var(--ez-error-subtle)',
    border: '1px solid var(--ez-border-strong)',
    color: 'var(--ez-error)',
    fontSize: '13px',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  commentContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
    marginBottom: '20px',
  },
  commentLabel: {
    fontSize: '12px',
    fontWeight: '700',
    color: 'var(--ez-text)',
  },
  required: {
    color: 'var(--ez-error)',
  },
  textarea: {
    width: '100%',
    borderRadius: '8px',
    border: '1px solid var(--ez-border)',
    backgroundColor: 'var(--ez-surface)',
    color: 'var(--ez-text-secondary)',
    padding: '10px 12px',
    fontSize: '13px',
    lineHeight: 1.5,
    resize: 'vertical' as const,
    fontFamily: 'inherit',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  counter: {
    fontSize: '11px',
    color: 'var(--ez-text-muted)',
    alignSelf: 'flex-end',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    borderTop: '1px dashed var(--ez-border)',
    paddingTop: '16px',
  },
  cancelBtn: {
    padding: '8px 16px',
    borderRadius: '8px',
    border: '1px solid var(--ez-border)',
    backgroundColor: 'var(--ez-surface-muted)',
    color: 'var(--ez-text-secondary)',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  submitBtn: {
    padding: '8px 20px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: 'var(--ez-error)',
    color: '#fff',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  submitBtnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
    backgroundColor: 'var(--ez-surface-muted)',
    color: 'var(--ez-text-muted)',
    border: '1px solid var(--ez-border)',
  },
};
