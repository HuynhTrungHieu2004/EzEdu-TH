import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Check,
  Hash,
  HelpCircle,
  Hourglass,
  Lightbulb,
  Pencil,
  Scissors,
  Search,
  Type,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type {
  VerificationIssue,
  VerificationIssueType,
  VerificationResolutionAction,
  VerificationSeverity,
} from '../api/verificationApi';

interface IssueCardProps {
  issue: VerificationIssue;
  resolving: boolean;
  disabled?: boolean;
  onResolve: (
    issueId: string,
    action: VerificationResolutionAction,
    editedText?: string,
  ) => Promise<boolean>;
}

const ISSUE_TYPE_LABELS: Record<VerificationIssueType, { label: string; icon: LucideIcon }> = {
  ocr_error: { label: 'Lỗi OCR', icon: Type },
  factual_error: { label: 'Sai kiến thức', icon: XCircle },
  suspicious_number: { label: 'Số liệu đáng nghi', icon: Hash },
  terminology_error: { label: 'Sai thuật ngữ', icon: BookOpen },
  internal_contradiction: { label: 'Mâu thuẫn nội bộ', icon: Zap },
  incomplete_content: { label: 'Nội dung thiếu', icon: Scissors },
  outdated_information: { label: 'Thông tin lỗi thời', icon: Hourglass },
  missing_context: { label: 'Thiếu ngữ cảnh', icon: Lightbulb },
  misleading_statement: { label: 'Gây hiểu nhầm', icon: AlertTriangle },
  unsupported_claim: { label: 'Thiếu bằng chứng', icon: HelpCircle },
  needs_verification: { label: 'Cần kiểm chứng thêm', icon: Search },
};

const SEVERITY_LABELS: Record<VerificationSeverity, string> = {
  low: 'Mức thấp',
  medium: 'Mức vừa',
  high: 'Mức cao',
  critical: 'Nguy hiểm',
};

const RESOLUTION_LABELS = {
  pending: 'Chưa duyệt',
  accepted: 'Đã chấp nhận đề xuất',
  rejected: 'Đã từ chối đề xuất',
  edited: 'Đã lưu bản tự sửa',
} as const;

const IssueCard: React.FC<IssueCardProps> = ({
  issue,
  resolving,
  disabled = false,
  onResolve,
}) => {
  const [editing, setEditing] = useState(false);
  const [reconsidering, setReconsidering] = useState(false);
  const [editedText, setEditedText] = useState(
    issue.user_edited_text || issue.suggested_fix,
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  const issueMeta = ISSUE_TYPE_LABELS[issue.issue_type] ?? {
    label: issue.issue_type,
    icon: HelpCircle,
  };
  const IssueTypeIcon = issueMeta.icon;
  const confidence = Number.isFinite(issue.confidence)
    ? Math.min(1, Math.max(0, issue.confidence))
    : 0;
  const confidencePercent = Math.round(confidence * 100);
  const resolved = issue.resolution !== 'pending';
  const showActions = !issue.applied_at && (!resolved || reconsidering);
  const sourceReference = issue.source_reference?.trim();
  
  const parseSources = (): { title: string; url: string | null }[] => {
    if (!sourceReference) return [];
    return sourceReference.split('; ').map((src) => {
      const idx = src.indexOf('http');
      if (idx !== -1) {
        const title = src.substring(0, idx).trim().replace(/:$/, '').trim();
        const url = src.substring(idx).trim();
        return { title: title || url, url };
      }
      return { title: src, url: null };
    });
  };

  const submitResolution = async (
    action: VerificationResolutionAction,
    value?: string,
  ) => {
    setValidationError(null);
    const updated = await onResolve(issue.id, action, value);
    if (updated) {
      setEditing(false);
      setReconsidering(false);
    }
  };

  const submitEditedText = async () => {
    const normalizedText = editedText.trim();
    if (!normalizedText) {
      setValidationError('Nội dung tự sửa không được để trống.');
      return;
    }

    setEditedText(normalizedText);
    await submitResolution('edited', normalizedText);
  };

  const openEditor = () => {
    setValidationError(null);
    setEditedText(issue.user_edited_text || issue.suggested_fix);
    setEditing(true);
  };

  const cancelEditor = () => {
    setValidationError(null);
    setEditedText(issue.user_edited_text || issue.suggested_fix);
    setEditing(false);
  };

  return (
    <article
      className={[
        'verification-issue',
        `verification-issue--${issue.issue_type}`,
        resolved ? 'verification-issue--resolved' : '',
      ].filter(Boolean).join(' ')}
      aria-busy={resolving}
    >
      <div className="verification-issue__header">
        <div className="verification-issue__badges">
          <span className="verification-badge verification-badge--type" style={{ gap: '4px' }}>
            <IssueTypeIcon size={12} aria-hidden="true" />
            <span>{issueMeta.label}</span>
          </span>
          <span
            className={`verification-badge verification-badge--severity verification-badge--${issue.severity}`}
          >
            {SEVERITY_LABELS[issue.severity]}
          </span>
          <span className="verification-badge verification-badge--chunk">
            Đoạn #{issue.chunk_index + 1}
          </span>
        </div>

        <div
          className="verification-confidence"
          role="progressbar"
          aria-label={`Độ tin cậy ${confidencePercent}%`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={confidencePercent}
        >
          <span>Tin cậy</span>
          <span className="verification-confidence__track" aria-hidden="true">
            <span
              className={[
                'verification-confidence__fill',
                confidence >= 0.7
                  ? 'verification-confidence__fill--high'
                  : confidence >= 0.5
                    ? 'verification-confidence__fill--medium'
                    : 'verification-confidence__fill--low',
              ].join(' ')}
              style={{ width: `${confidencePercent}%` }}
            />
          </span>
          <strong>{confidencePercent}%</strong>
        </div>
      </div>

      <div className="verification-diff">
        <div className="verification-diff__column">
          <span className="verification-diff__label">Nội dung gốc</span>
          <div className="verification-diff__text verification-diff__text--original">
            {issue.original_text}
          </div>
        </div>
        <span className="verification-diff__arrow" aria-hidden="true"><ArrowRight size={18} /></span>
        <div className="verification-diff__column">
          <span className="verification-diff__label">
            {issue.resolution === 'edited' ? 'Bản tự sửa' : 'Đề xuất sửa'}
          </span>
          <div className="verification-diff__text verification-diff__text--suggested">
            {issue.resolution === 'edited' && issue.user_edited_text
              ? issue.user_edited_text
              : (issue.suggested_fix?.trim() || 'Chưa đủ căn cứ để đề xuất nội dung thay thế.')}
          </div>
        </div>
      </div>

      <div className="verification-issue__reason">
        <strong>Lý do</strong>
        <span>{issue.reason}</span>
      </div>

      {sourceReference && (
        <div
          className={[
            'verification-issue__source',
            issue.external_verified
              ? 'verification-issue__source--verified'
              : 'verification-issue__source--unverified',
          ].join(' ')}
        >
          <strong>
            {issue.external_verified
              ? 'Nguồn đã được đối chiếu:'
              : 'Nguồn do AI đề xuất (chưa xác minh):'}
          </strong>{' '}
          <div className="verification-sources-list" style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '8px', marginLeft: '4px' }}>
            {parseSources().map((src, i) => (
              <span key={i}>
                {src.url ? (
                  <a href={src.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline', color: 'inherit' }}>
                    {src.title}
                  </a>
                ) : (
                  <span>{src.title}</span>
                )}
                {i < parseSources().length - 1 && '; '}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="verification-issue__evidence">
        {issue.ai_provider === 'both' && (
          <span className="verification-evidence-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Check size={12} aria-hidden="true" />
            <span>Đã kiểm tra chéo bởi hai mô hình AI</span>
          </span>
        )}
        {issue.applied_at && (
          <span className="verification-evidence-badge verification-evidence-badge--applied" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Check size={12} aria-hidden="true" />
            <span>Đã áp dụng vào nội dung</span>
          </span>
        )}
      </div>

      {showActions ? (
        <div className="verification-issue__actions">
          {editing ? (
            <div className="verification-editor">
              <label htmlFor={`verification-edit-${issue.id}`}>
                Nội dung thay thế của bạn
              </label>
              <textarea
                id={`verification-edit-${issue.id}`}
                value={editedText}
                onChange={(event) => {
                  setEditedText(event.target.value);
                  setValidationError(null);
                }}
                rows={4}
                disabled={resolving || disabled}
              />
              {validationError && (
                <p className="verification-editor__error" role="alert">
                  {validationError}
                </p>
              )}
              <div className="verification-editor__actions">
                <button
                  type="button"
                  className="verification-button verification-button--save"
                  onClick={() => void submitEditedText()}
                  disabled={resolving || disabled || !editedText.trim()}
                >
                  {resolving ? 'Đang lưu...' : 'Lưu bản sửa'}
                </button>
                <button
                  type="button"
                  className="verification-button verification-button--neutral"
                  onClick={cancelEditor}
                  disabled={resolving || disabled}
                >
                  Hủy
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                className="verification-button verification-button--accept"
                onClick={() => void submitResolution('accepted')}
                disabled={resolving || disabled}
              >
                {resolving ? (
                  'Đang cập nhật...'
                ) : (
                  <>
                    <Check size={16} aria-hidden="true" />
                    <span>Chấp nhận</span>
                  </>
                )}
              </button>
              <button
                type="button"
                className="verification-button verification-button--reject"
                onClick={() => void submitResolution('rejected')}
                disabled={resolving || disabled}
              >
                <X size={16} aria-hidden="true" />
                <span>Từ chối</span>
              </button>
              <button
                type="button"
                className="verification-button verification-button--edit"
                onClick={openEditor}
                disabled={resolving || disabled}
              >
                <Pencil size={16} aria-hidden="true" />
                <span>Tự sửa</span>
              </button>
              {resolved && (
                <button
                  type="button"
                  className="verification-button verification-button--neutral"
                  onClick={() => setReconsidering(false)}
                  disabled={resolving || disabled}
                >
                  Giữ lựa chọn cũ
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        <div className={`verification-resolution verification-resolution--${issue.resolution}`}>
          <span>{RESOLUTION_LABELS[issue.resolution]}</span>
          {!issue.applied_at && (
            <button
              type="button"
              onClick={() => setReconsidering(true)}
              disabled={resolving || disabled}
            >
              Thay đổi lựa chọn
            </button>
          )}
        </div>
      )}
    </article>
  );
};

export default IssueCard;
