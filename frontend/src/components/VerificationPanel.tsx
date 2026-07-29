import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Hash,
  HelpCircle,
  Hourglass,
  Lightbulb,
  Loader,
  RefreshCw,
  Scissors,
  Search,
  Type,
  XCircle,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { verificationApi } from '../api/verificationApi';
import type { VerificationIssue, VerificationSession, VerificationResolutionAction } from '../api/verificationApi';
import IssueCard from './IssueCard';

interface VerificationPanelProps {
  documentId: string;
  documentStatus: string;
  disabled?: boolean;
  onApplied?: () => void;
  onApplyingChange?: (applying: boolean) => void;
}

const ISSUE_TYPE_LABELS: Record<string, string> = {
  ocr_error: 'Lỗi OCR',
  factual_error: 'Sai kiến thức',
  suspicious_number: 'Số liệu nghi vấn',
  terminology_error: 'Sai thuật ngữ',
  internal_contradiction: 'Mâu thuẫn nội bộ',
  incomplete_content: 'Thiếu nội dung',
  outdated_information: 'Thông tin lỗi thời',
  missing_context: 'Thiếu ngữ cảnh',
  misleading_statement: 'Gây hiểu nhầm',
  unsupported_claim: 'Thiếu bằng chứng',
  needs_verification: 'Cần kiểm chứng',
};

const ISSUE_TYPE_ICONS: Record<string, LucideIcon> = {
  ocr_error: Type,
  factual_error: XCircle,
  suspicious_number: Hash,
  terminology_error: BookOpen,
  internal_contradiction: Zap,
  incomplete_content: Scissors,
  outdated_information: Hourglass,
  missing_context: Lightbulb,
  misleading_statement: AlertTriangle,
  unsupported_claim: HelpCircle,
  needs_verification: Search,
};

const VerificationPanel: React.FC<VerificationPanelProps> = ({
  documentId,
  documentStatus,
  disabled = false,
  onApplied,
  onApplyingChange,
}) => {
  const [session, setSession] = useState<VerificationSession | null>(null);
  const [issues, setIssues] = useState<VerificationIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [triggerLoading, setTriggerLoading] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [severityFilter, setSeverityFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('index');

  const canVerify = ['processed', 'transcribed', 'indexed', 'indexing', 'index_failed'].includes(documentStatus);

  // ─── Load existing session ────────────────────────────────────
  const loadSession = useCallback(async () => {
    try {
      const s = await verificationApi.getStatus(documentId);
      setSession(s);
      return s;
    } catch {
      setSession(null);
      return null;
    }
  }, [documentId]);

  const loadIssues = useCallback(async (sessionId: string) => {
    try {
      const list = await verificationApi.getIssues(documentId, sessionId);
      setIssues(list);
    } catch {
      setIssues([]);
    }
  }, [documentId]);

  // On mount: load existing session + issues
  useEffect(() => {
    if (!canVerify) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    loadSession().then(async (s) => {
      if (s?.session_id) {
        await loadIssues(s.session_id);
      }
    }).finally(() => setLoading(false));
  }, [canVerify, loadSession, loadIssues]);

  // ─── Polling while processing ─────────────────────────────────
  useEffect(() => {
    if (session?.status !== 'processing') {
      if (pollingRef.current) clearInterval(pollingRef.current);
      return;
    }

    pollingRef.current = setInterval(async () => {
      const s = await loadSession();
      if (s && s.status !== 'processing') {
        if (pollingRef.current) clearInterval(pollingRef.current);
        if (s.session_id) {
          await loadIssues(s.session_id);
        }
        if (onApplied) onApplied();
      }
    }, 3000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [session?.status, loadSession, loadIssues, onApplied]);

  // ─── Trigger verification ─────────────────────────────────────
  const handleTrigger = async () => {
    if (disabled || triggerLoading) return;
    setTriggerLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await verificationApi.trigger(documentId);
      setSession({
        session_id: res.session_id,
        document_id: documentId,
        status: res.status as VerificationSession['status'],
        total_chunks: 0,
        total_chunks_processed: 0,
        total_issues_found: 0,
        issues_accepted: 0,
        issues_rejected: 0,
        issues_pending: 0,
        error_message: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: null,
      });
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      if (status === 429) {
        setError('Dịch vụ AI đang vượt giới hạn sử dụng (Rate Limit). Vui lòng thử lại sau.');
      } else if (status === 503) {
        setError('Dịch vụ kiểm tra học liệu hiện chưa khả dụng.');
      } else {
        setError(msg ?? 'Không thể bắt đầu kiểm tra.');
      }
    } finally {
      setTriggerLoading(false);
    }
  };

  // ─── Resolve single issue ─────────────────────────────────────
  const handleResolve = async (
    issueId: string,
    action: VerificationResolutionAction,
    editedText?: string,
  ): Promise<boolean> => {
    if (disabled || !session?.session_id) return false;
    setError(null);
    try {
      await verificationApi.resolve(documentId, session.session_id, [
        { issue_id: issueId, action, edited_text: editedText },
      ]);
      // Optimistic update
      setIssues((prev) =>
        prev.map((iss) =>
          iss.id === issueId
            ? { ...iss, resolution: action, user_edited_text: editedText ?? iss.user_edited_text }
            : iss,
        ),
      );
      // Refresh session counters
      await loadSession();
      return true;
    } catch {
      setError('Không thể cập nhật trạng thái issue.');
      return false;
    }
  };

  // ─── Apply accepted fixes ─────────────────────────────────────
  const handleApply = async () => {
    if (disabled || applyLoading || !session?.session_id) return;
    setApplyLoading(true);
    setError(null);
    setSuccessMsg(null);
    if (onApplyingChange) onApplyingChange(true);

    try {
      const res = await verificationApi.apply(documentId, session.session_id);
      setSuccessMsg(res.message);
      const s = await loadSession();
      if (s?.session_id) {
        await loadIssues(s.session_id);
      }
      if (onApplied) onApplied();
    } catch {
      setError('Áp dụng bản sửa thất bại.');
    } finally {
      setApplyLoading(false);
      if (onApplyingChange) onApplyingChange(false);
    }
  };

  if (!canVerify) return null;

  // ─── Summary counts ───────────────────────────────────────────
  const typeCounts: Record<string, number> = {};
  for (const iss of issues) {
    typeCounts[iss.issue_type] = (typeCounts[iss.issue_type] || 0) + 1;
  }
  const pendingCount = issues.filter((i) => i.resolution === 'pending').length;
  const acceptedCount = issues.filter((i) => i.resolution === 'accepted' || i.resolution === 'edited').length;

  const showResults = session?.status === 'completed' || session?.status === 'partially_completed';

  // Apply filters and sort
  const filteredIssues = issues
    .filter((iss) => severityFilter === 'all' || iss.severity === severityFilter)
    .filter((iss) => typeFilter === 'all' || iss.issue_type === typeFilter)
    .sort((a, b) => {
      if (sortBy === 'severity') {
        const priority = { critical: 4, high: 3, medium: 2, low: 1 };
        return (priority[b.severity] || 0) - (priority[a.severity] || 0);
      }
      if (sortBy === 'confidence') {
        return b.confidence - a.confidence;
      }
      return a.chunk_index - b.chunk_index;
    });

  return (
    <div style={styles.wrapper}>
      <h4 style={{ ...styles.sectionTitle, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Search size={18} aria-hidden="true" />
        <span>Kiểm tra chất lượng nội dung</span>
      </h4>
      <p style={styles.subtitle}>
        Phát hiện lỗi OCR, sai sự thật, số liệu đáng nghi, thuật ngữ lệch và mâu thuẫn nội bộ bằng AI kép.
      </p>

      {/* Guidelines disclaimer */}
      <div style={styles.guidelinesBox}>
        <Lightbulb size={16} aria-hidden="true" style={{ verticalAlign: 'text-bottom', marginRight: '6px' }} />
        <strong>Lưu ý:</strong> AI hỗ trợ phát hiện lỗi nhưng không thay thế hoàn toàn chuyên gia. Các kết quả có độ tin cậy thấp cần được xem lại thủ công. Trạng thái "Cần kiểm chứng thêm" không đồng nghĩa với việc nội dung đó chắc chắn sai.
      </div>

      {error && <div style={styles.errorAlert}>{error}</div>}
      {successMsg && <div style={styles.successAlert}>{successMsg}</div>}

      {/* Stale content warning */}
      {session && session.is_stale && (
        <div style={styles.staleAlert}>
          <AlertTriangle size={16} aria-hidden="true" style={{ verticalAlign: 'text-bottom', marginRight: '6px' }} />
          <strong>Nội dung tài liệu đã thay đổi kể từ lần kiểm tra gần nhất.</strong> Kết quả hiển thị bên dưới thuộc về phiên bản cũ. Bạn nên bấm <strong>Kiểm tra lại nội dung mới</strong> để cập nhật.
        </div>
      )}

      {/* ─── No session yet -> Trigger button ─── */}
      {!session && !loading && (
        <button
          onClick={handleTrigger}
          disabled={disabled || triggerLoading}
          style={{ ...styles.triggerButton, display: 'inline-flex', alignItems: 'center', gap: '8px' }}
        >
          {triggerLoading ? (
            <>
              <Loader size={16} aria-hidden="true" />
              <span>Đang khởi tạo...</span>
            </>
          ) : (
            <>
              <Search size={16} aria-hidden="true" />
              <span>Bắt đầu kiểm tra chất lượng</span>
            </>
          )}
        </button>
      )}

      {/* ─── Processing state ─── */}
      {session?.status === 'processing' && (
        <div style={styles.processingBox}>
          <div style={styles.spinnerSmall} />
          <div>
            <strong>Đang kiểm tra nội dung...</strong>
            <div style={styles.progressInfo}>
              Đã xử lý {session.total_chunks_processed}/{session.total_chunks} đoạn
              {session.total_issues_found > 0 && ` — ${session.total_issues_found} vấn đề phát hiện`}
            </div>
            <div style={styles.progressTrack}>
              <div
                style={{
                  ...styles.progressFill,
                  width: session.total_chunks > 0
                    ? `${(session.total_chunks_processed / session.total_chunks) * 100}%`
                    : '0%',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ─── Partially Completed state ─── */}
      {session?.status === 'partially_completed' && (
        <div style={styles.partiallyCompletedBox}>
          <AlertTriangle size={16} aria-hidden="true" style={{ verticalAlign: 'text-bottom', marginRight: '6px' }} />
          <strong>Kiểm tra hoàn thành một phần:</strong>
          <span style={{ marginLeft: '4px' }}>
            Đã phân tích thành công {session.successful_chunks || 0}/{session.total_chunks || 0} đoạn. Có {session.failed_chunks || 0} đoạn gặp lỗi khi phân tích.
          </span>
          {session.error_message && (
            <div style={{ ...styles.errorAlert, marginTop: '8px' }}>Lỗi chi tiết: {session.error_message}</div>
          )}
        </div>
      )}

      {/* ─── Failed state ─── */}
      {session?.status === 'failed' && (
        <div style={styles.failedBox}>
          <strong>Kiểm tra thất bại:</strong> {session.error_message || 'Lỗi không xác định.'}
          <button
            onClick={handleTrigger}
            disabled={disabled || triggerLoading}
            style={{ ...styles.triggerButton, marginTop: '10px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <RefreshCw size={16} aria-hidden="true" />
            <span>Thử lại</span>
          </button>
        </div>
      )}

      {/* ─── Completed or Partially Completed: summary + issues ─── */}
      {showResults && (
        <>
          {/* Summary Bar */}
          <div style={styles.summaryBar}>
            <div style={styles.summaryLeft}>
              <span style={{ ...styles.summaryTitle, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <ClipboardList size={16} aria-hidden="true" />
                <span>{session.summary || (issues.length === 0 ? 'Không phát hiện vấn đề nào' : `${issues.length} vấn đề phát hiện`)}</span>
              </span>
              {session.ai_model && (
                <span style={styles.modelInfo}>
                  Model AI: <code>{session.ai_model}</code> 
                  {session.completed_at && ` — Đã chạy lúc: ${new Date(session.completed_at).toLocaleString('vi-VN')}`}
                </span>
              )}
              
              {/* Severity stats breakdown if available */}
              {session.severity_stats && (
                <div style={styles.severityStatsRow}>
                  <strong>Mức độ:</strong>
                  {session.severity_stats.critical > 0 && <span style={{ ...styles.severityStatBadge, backgroundColor: '#991b1b', color: '#fff', border: '1px solid #7f1d1d' }}>Nguy hiểm: {session.severity_stats.critical}</span>}
                  {session.severity_stats.high > 0 && <span style={{ ...styles.severityStatBadge, backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}>Cao: {session.severity_stats.high}</span>}
                  {session.severity_stats.medium > 0 && <span style={{ ...styles.severityStatBadge, backgroundColor: 'rgba(245,158,11,0.1)', color: '#d97706', borderColor: 'rgba(245,158,11,0.3)' }}>Vừa: {session.severity_stats.medium}</span>}
                  {session.severity_stats.low > 0 && <span style={{ ...styles.severityStatBadge, backgroundColor: 'rgba(16,185,129,0.1)', color: '#059669', borderColor: 'rgba(16,185,129,0.3)' }}>Thấp: {session.severity_stats.low}</span>}
                </div>
              )}

              <div style={styles.typeBadges}>
                {Object.entries(typeCounts).map(([type, count]) => {
                  const TypeIcon = ISSUE_TYPE_ICONS[type];
                  return (
                    <span key={type} style={{ ...styles.typeBadge, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      {TypeIcon && <TypeIcon size={12} aria-hidden="true" />}
                      <span>{ISSUE_TYPE_LABELS[type] || type}: {count}</span>
                    </span>
                  );
                })}
              </div>
            </div>

            <div style={styles.summaryRight}>
              {issues.length > 0 && (
                <span style={styles.resolveProgress}>
                  Đã duyệt: {issues.length - pendingCount}/{issues.length}
                </span>
              )}
              {acceptedCount > 0 && (
                <button
                  onClick={handleApply}
                  disabled={disabled || applyLoading}
                  style={{ ...styles.applyButton, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  {applyLoading ? (
                    <>
                      <Loader size={16} aria-hidden="true" />
                      <span>Đang áp dụng...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw size={16} aria-hidden="true" />
                      <span>{`Áp dụng ${acceptedCount} bản sửa`}</span>
                    </>
                  )}
                </button>
              )}
              <button
                onClick={handleTrigger}
                disabled={disabled || triggerLoading}
                style={{ ...styles.retriggerButton, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                {triggerLoading ? (
                  <>
                    <Loader size={16} aria-hidden="true" />
                    <span>...</span>
                  </>
                ) : session.is_stale ? (
                  <>
                    <Search size={16} aria-hidden="true" />
                    <span>Kiểm tra lại nội dung mới</span>
                  </>
                ) : (
                  <>
                    <RefreshCw size={16} aria-hidden="true" />
                    <span>Kiểm tra lại</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Filters Bar */}
          {issues.length > 0 && (
            <div style={styles.filtersBar}>
              <div style={styles.filterGroup}>
                <label style={styles.filterLabel}>Mức độ:</label>
                <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} style={styles.filterSelect}>
                  <option value="all">Tất cả</option>
                  <option value="critical">Nguy hiểm</option>
                  <option value="high">Mức cao</option>
                  <option value="medium">Mức vừa</option>
                  <option value="low">Mức thấp</option>
                </select>
              </div>

              <div style={styles.filterGroup}>
                <label style={styles.filterLabel}>Loại lỗi:</label>
                <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={styles.filterSelect}>
                  <option value="all">Tất cả</option>
                  {Object.entries(ISSUE_TYPE_LABELS).map(([key, val]) => (
                    <option key={key} value={key}>{val}</option>
                  ))}
                </select>
              </div>

              <div style={styles.filterGroup}>
                <label style={styles.filterLabel}>Sắp xếp:</label>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={styles.filterSelect}>
                  <option value="index">Vị trí tài liệu</option>
                  <option value="severity">Mức độ nghiêm trọng</option>
                  <option value="confidence">Độ tin cậy</option>
                </select>
              </div>
            </div>
          )}

          {/* Issue Cards */}
          {filteredIssues.length > 0 && (
            <div style={styles.issueList}>
              {filteredIssues.map((issue) => (
                <IssueCard
                  key={issue.id}
                  issue={issue}
                  resolving={applyLoading}
                  disabled={disabled}
                  onResolve={handleResolve}
                />
              ))}
            </div>
          )}

          {issues.length > 0 && filteredIssues.length === 0 && (
            <div style={{ ...styles.noIssues, backgroundColor: 'var(--code-bg)', color: 'var(--text)' }}>
              Không có vấn đề nào khớp với bộ lọc hiện tại.
            </div>
          )}

          {issues.length === 0 && (
            <div style={{ ...styles.noIssues, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <CheckCircle2 size={18} aria-hidden="true" />
              <span>Nội dung tài liệu không có vấn đề nào được phát hiện. Chất lượng tốt!</span>
            </div>
          )}
        </>
      )}

      {loading && (
        <div style={styles.loadingRow}>
          <div style={styles.spinnerSmall} />
          <span>Đang tải trạng thái kiểm tra...</span>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    padding: '24px',
    borderRadius: '16px',
    border: '1px solid var(--border)',
    backgroundColor: 'var(--bg)',
    boxShadow: 'var(--shadow)',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    textAlign: 'left',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: 'var(--text-h)',
    margin: 0,
  },
  subtitle: {
    fontSize: '13px',
    color: 'var(--text)',
    margin: 0,
  },
  errorAlert: {
    padding: '10px 14px',
    backgroundColor: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.3)',
    color: '#ef4444',
    borderRadius: '8px',
    fontSize: '13px',
  },
  successAlert: {
    padding: '10px 14px',
    backgroundColor: 'rgba(34,197,94,0.1)',
    border: '1px solid rgba(34,197,94,0.3)',
    color: '#22c55e',
    borderRadius: '8px',
    fontSize: '13px',
  },
  triggerButton: {
    alignSelf: 'flex-start',
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: '600',
    color: '#fff',
    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(245,158,11,0.24)',
  },
  processingBox: {
    display: 'flex',
    gap: '14px',
    alignItems: 'flex-start',
    padding: '16px',
    borderRadius: '12px',
    backgroundColor: 'rgba(245,158,11,0.06)',
    border: '1px solid rgba(245,158,11,0.2)',
  },
  spinnerSmall: {
    width: '20px',
    height: '20px',
    border: '3px solid var(--border)',
    borderTop: '3px solid #f59e0b',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    flexShrink: 0,
    marginTop: '2px',
  },
  progressInfo: {
    fontSize: '13px',
    color: 'var(--text)',
    marginTop: '4px',
  },
  progressTrack: {
    width: '100%',
    height: '6px',
    borderRadius: '3px',
    backgroundColor: 'var(--border)',
    overflow: 'hidden',
    marginTop: '8px',
  },
  progressFill: {
    height: '100%',
    borderRadius: '3px',
    background: 'linear-gradient(90deg, #f59e0b, #22c55e)',
    transition: 'width .5s ease',
  },
  failedBox: {
    padding: '16px',
    borderRadius: '12px',
    backgroundColor: 'rgba(239,68,68,0.06)',
    border: '1px solid rgba(239,68,68,0.2)',
    fontSize: '13px',
    color: '#ef4444',
    lineHeight: '1.5',
  },
  summaryBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px',
    padding: '14px 18px',
    borderRadius: '12px',
    backgroundColor: 'var(--code-bg)',
    border: '1px solid var(--border)',
    flexWrap: 'wrap',
  },
  summaryLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  summaryTitle: {
    fontSize: '14px',
    fontWeight: '700',
    color: 'var(--text-h)',
  },
  typeBadges: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
  },
  typeBadge: {
    padding: '2px 8px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: '600',
    backgroundColor: 'var(--bg)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
  },
  summaryRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
  },
  resolveProgress: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text)',
  },
  applyButton: {
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: '600',
    color: '#fff',
    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  retriggerButton: {
    padding: '8px 14px',
    fontSize: '12px',
    fontWeight: '500',
    color: 'var(--text)',
    backgroundColor: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  issueList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    marginTop: '10px',
  },
  noIssues: {
    padding: '20px',
    borderRadius: '12px',
    backgroundColor: 'rgba(34,197,94,0.06)',
    border: '1px solid rgba(34,197,94,0.2)',
    color: '#22c55e',
    fontSize: '14px',
    fontWeight: '600',
    textAlign: 'center',
  },
  loadingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    color: 'var(--text)',
    fontSize: '13px',
  },
  guidelinesBox: {
    padding: '12px 16px',
    borderRadius: '10px',
    backgroundColor: 'var(--code-bg)',
    border: '1px solid var(--border)',
    fontSize: '13px',
    color: 'var(--text)',
    lineHeight: '1.5',
  },
  staleAlert: {
    padding: '12px 16px',
    borderRadius: '10px',
    backgroundColor: 'rgba(245,158,11,0.06)',
    border: '1px solid rgba(245,158,11,0.3)',
    color: '#d97706',
    fontSize: '13px',
    lineHeight: '1.5',
  },
  partiallyCompletedBox: {
    padding: '16px',
    borderRadius: '12px',
    backgroundColor: 'rgba(245,158,11,0.06)',
    border: '1px solid rgba(245,158,11,0.2)',
    fontSize: '13px',
    color: '#d97706',
    lineHeight: '1.5',
  },
  modelInfo: {
    fontSize: '12px',
    color: 'var(--muted)',
    marginTop: '2px',
    display: 'block',
  },
  severityStatsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
    color: 'var(--text)',
    marginTop: '6px',
    flexWrap: 'wrap',
  },
  severityStatBadge: {
    padding: '2px 8px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: '600',
    border: '1px solid transparent',
  },
  filtersBar: {
    display: 'flex',
    gap: '16px',
    alignItems: 'center',
    flexWrap: 'wrap',
    padding: '10px 16px',
    borderRadius: '10px',
    backgroundColor: 'var(--code-bg)',
    border: '1px solid var(--border)',
  },
  filterGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  filterLabel: {
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--text)',
  },
  filterSelect: {
    padding: '6px 12px',
    fontSize: '12px',
    borderRadius: '6px',
    border: '1px solid var(--border)',
    backgroundColor: 'var(--bg)',
    color: 'var(--text)',
    outline: 'none',
  },
};

export default VerificationPanel;
