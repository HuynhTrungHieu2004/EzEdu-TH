import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardList,
  Download,
  File,
  FileText,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { questionApi } from '../api/questionApi';
import type { QuestionSetSummary, HistoryParams } from '../api/questionApi';
import { getApiErrorDetail, isUnauthorizedError } from '../api/errors';
import { Alert, ConfirmDialog, FormField, Input } from '../components/ui';

/* ─── Constants ─────────────────────────────────────────────────────────── */
const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;

const DIFFICULTY_OPTIONS = [
  { value: '', label: 'Tất cả độ khó' },
  { value: 'easy', label: 'Dễ' },
  { value: 'medium', label: 'Trung bình' },
  { value: 'hard', label: 'Khó' },
];

const TYPE_OPTIONS = [
  { value: '', label: 'Tất cả dạng' },
  { value: 'multiple_choice', label: 'Trắc nghiệm' },
  { value: 'true_false', label: 'Đúng / Sai' },
  { value: 'short_answer', label: 'Tự luận ngắn' },
];

const DIFFICULTY_LABELS: Record<string, string> = {
  easy: 'Dễ',
  medium: 'Trung bình',
  hard: 'Khó',
};

const TYPE_LABELS: Record<string, string> = {
  multiple_choice: 'Trắc nghiệm',
  true_false: 'Đúng / Sai',
  short_answer: 'Tự luận ngắn',
};

const BLOOM_CONFIG: Record<string, { label: string; color: string }> = {
  remember: { label: 'Nhận biết', color: 'var(--ez-success)' },
  understand: { label: 'Thông hiểu', color: 'var(--ez-info)' },
  apply: { label: 'Vận dụng', color: 'var(--ez-warning)' },
  analyze: { label: 'VD cao', color: 'var(--ez-error)' },
};

/* ─── Component ─────────────────────────────────────────────────────────── */
const QuestionHistoryPage: React.FC = () => {
  const navigate = useNavigate();

  // Data state
  const [items, setItems] = useState<QuestionSetSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // Filter state
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState('');

  // UI state
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  // Request identity to prevent stale responses
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch data ──────────────────────────────────────────────
  const fetchHistory = useCallback(
    async (cursorValue: string | null, append: boolean) => {
      const rid = ++requestIdRef.current;

      // Abort previous request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const params: HistoryParams = {
        limit: PAGE_SIZE,
      };
      if (searchQuery) params.search = searchQuery;
      if (filterType) params.question_type = filterType;
      if (filterDifficulty) params.difficulty = filterDifficulty;
      if (cursorValue) params.cursor = cursorValue;

      try {
        const res = await questionApi.listMyHistory(params, controller.signal);

        // Stale response guard
        if (rid !== requestIdRef.current) return;

        if (append) {
          // Deduplicate by ID
          setItems((prev) => {
            const existingIds = new Set(prev.map((i) => i.id));
            const newItems = res.items.filter((i) => !existingIds.has(i.id));
            return [...prev, ...newItems];
          });
        } else {
          setItems(res.items);
        }
        setNextCursor(res.next_cursor);
        setHasMore(res.has_more);
      } catch (err: unknown) {
        if (rid !== requestIdRef.current) return;
        if ((err as { code?: string })?.code === 'ERR_CANCELED') return;

        if (isUnauthorizedError(err)) {
          localStorage.removeItem('access_token');
          navigate('/login');
          return;
        }
        setError(
          getApiErrorDetail(err) ?? 'Không thể tải lịch sử. Vui lòng thử lại.'
        );
      } finally {
        if (rid === requestIdRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [searchQuery, filterType, filterDifficulty, navigate]
  );

  // Initial load + reload when filters change
  useEffect(() => {
    void Promise.resolve().then(() => {
      fetchHistory(null, false);
    });
  }, [fetchHistory]);

  // Search debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  // ── Load more ──────────────────────────────────────────────
  const handleLoadMore = () => {
    if (!hasMore || loadingMore || !nextCursor) return;
    fetchHistory(nextCursor, true);
  };

  // ── Delete ─────────────────────────────────────────────────
  const handleDeleteConfirm = async () => {
    if (!confirmDeleteId || deletingId || deleteConfirmation !== 'XÓA') return;
    const id = confirmDeleteId;
    setDeletingId(id);
    setDeleteError(null);

    try {
      await questionApi.deleteQuestionSet(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      setConfirmDeleteId(null);
      setDeleteConfirmation('');
    } catch (err: unknown) {
      if (isUnauthorizedError(err)) {
        localStorage.removeItem('access_token');
        navigate('/login');
        return;
      }
      setDeleteError(
        getApiErrorDetail(err) ?? 'Xóa thất bại. Vui lòng thử lại.'
      );
    } finally {
      setDeletingId(null);
    }
  };

  // ── Clear filters ──────────────────────────────────────────
  const hasFilters = !!searchInput || !!filterType || !!filterDifficulty;
  const clearFilters = () => {
    setSearchInput('');
    setSearchQuery('');
    setFilterType('');
    setFilterDifficulty('');
  };

  // ── Delete target info for dialog ──────────────────────────
  const deleteTarget = confirmDeleteId
    ? items.find((i) => i.id === confirmDeleteId)
    : null;

  /* ═══════════════════════════════════════════════════════════ */
  /* RENDER                                                     */
  /* ═══════════════════════════════════════════════════════════ */
  return (
    <div style={S.container}>
      <ConfirmDialog
        open={confirmDeleteId !== null}
        onClose={deletingId ? () => undefined : () => { setConfirmDeleteId(null); setDeleteError(null); setDeleteConfirmation(''); }}
        onConfirm={() => void handleDeleteConfirm()}
        title="Xóa vĩnh viễn bộ đề?"
        description={`Bộ đề ${deleteTarget?.question_count ?? 0} câu từ học liệu “${deleteTarget?.document_name ?? ''}” sẽ bị xóa. Thao tác không thể hoàn tác.`}
        confirmLabel="Xóa bộ đề"
        confirmDisabled={deleteConfirmation !== 'XÓA'}
        busy={Boolean(deletingId)}
      >
        {deleteError && <Alert tone="error">{deleteError}</Alert>}
        <FormField
          label="Nhập XÓA để xác nhận"
          error={deleteConfirmation && deleteConfirmation !== 'XÓA' ? 'Nội dung xác nhận chưa đúng.' : undefined}
        >
          <Input
            value={deleteConfirmation}
            onChange={(event) => setDeleteConfirmation(event.target.value)}
            autoComplete="off"
            invalid={Boolean(deleteConfirmation && deleteConfirmation !== 'XÓA')}
          />
        </FormField>
      </ConfirmDialog>

      {/* ── Page Header ── */}
      <header style={S.header}>
        <div>
          <h1 style={S.title}>
            <ClipboardList size={18} aria-hidden="true" /><span>Ngân hàng câu hỏi</span>
          </h1>
          <p style={S.subtitle}>
            Quản lý bộ câu hỏi AI đã soạn, duyệt nội dung và ban hành đề thi cho học sinh.
          </p>
        </div>
        <button type="button" onClick={() => navigate('/generate')} className="btn-primary">
          <Plus size={16} aria-hidden="true" /><span>Upload học liệu &amp; sinh đề AI</span>
        </button>
      </header>

      {/* ── Filters ── */}
      <div style={S.filterBar}>
        <div style={S.searchWrap}>
          <Search size={16} style={S.searchIcon} aria-hidden="true" />
          <input
            id="history-search"
            type="text"
            placeholder="Tìm theo tên tài liệu…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            style={S.searchInput}
            aria-label="Tìm kiếm tài liệu"
          />
        </div>
        <select
          id="history-filter-type"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          style={S.filterSelect}
          aria-label="Lọc theo dạng câu hỏi"
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          id="history-filter-difficulty"
          value={filterDifficulty}
          onChange={(e) => setFilterDifficulty(e.target.value)}
          style={S.filterSelect}
          aria-label="Lọc theo độ khó"
        >
          {DIFFICULTY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {hasFilters && (
          <button type="button" onClick={clearFilters} style={S.clearBtn} aria-label="Xóa bộ lọc">
            <X size={16} aria-hidden="true" /><span>Xóa lọc</span>
          </button>
        )}
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div style={S.center}>
          <div style={S.spinner} />
          <p style={{ marginTop: '16px', color: 'var(--text)' }}>Đang tải lịch sử…</p>
        </div>
      ) : error ? (
        <div style={S.center}>
          <div style={S.errorBox}>{error}</div>
          <button type="button" onClick={() => fetchHistory(null, false)} style={S.retryBtn}>
            <RefreshCw size={16} aria-hidden="true" /><span>Thử lại</span>
          </button>
        </div>
      ) : items.length === 0 ? (
        <div style={S.emptyState}>
          <div style={S.emptyIcon} aria-hidden="true"><FileText size={56} /></div>
          <h3 style={S.emptyTitle}>
            {hasFilters ? 'Không tìm thấy kết quả' : 'Chưa có bộ đề nào'}
          </h3>
          <p style={S.emptyText}>
            {hasFilters
              ? 'Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm.'
              : 'Hãy tải tài liệu lên và sinh câu hỏi để bắt đầu!'}
          </p>
          {hasFilters && (
            <button type="button" onClick={clearFilters} style={S.retryBtn}>
              Xóa bộ lọc
            </button>
          )}
        </div>
      ) : (
        <>
          {/* ── Cards Grid ── */}
          <div style={S.grid}>
            {items.map((item) => (
              <article key={item.id} style={S.card}>
                {/* Card header */}
                <div style={S.cardHeader}>
                  <span style={S.cardDate}>
                    {new Date(item.created_at).toLocaleDateString('vi-VN', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(item.id)}
                    style={S.deleteBtn}
                    aria-label={`Xóa bộ đề ${item.document_name}`}
                    title="Xóa bộ đề"
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>

                {/* Document name */}
                <h3 style={S.cardDocName} title={item.document_name}>
                  <File size={16} style={S.docNameIcon} aria-hidden="true" />
                  {item.document_name}
                </h3>

                {/* Meta badges */}
                <div style={S.cardMeta}>
                  <span style={S.metaBadge}>
                    {item.question_count} câu
                  </span>
                  <span style={{ ...S.metaBadge, ...S.typeBadge }}>
                    {TYPE_LABELS[item.question_type] ?? item.question_type}
                  </span>
                  <span style={{
                    ...S.metaBadge,
                    ...(item.difficulty === 'easy' ? S.diffEasy : item.difficulty === 'hard' ? S.diffHard : S.diffMedium),
                  }}>
                    {DIFFICULTY_LABELS[item.difficulty] ?? item.difficulty}
                  </span>
                </div>

                {/* Bloom distribution bar */}
                {item.bloom_distribution && Object.keys(item.bloom_distribution).length > 0 && (() => {
                  const total = Object.values(item.bloom_distribution!).reduce((a, b) => a + b, 0);
                  return (
                    <div style={S.bloomBar}>
                      {Object.entries(item.bloom_distribution!).map(([level, cnt]) => {
                        const cfg = BLOOM_CONFIG[level];
                        if (!cfg || cnt === 0) return null;
                        const pct = (cnt / total) * 100;
                        return (
                          <div
                            key={level}
                            title={`${cfg.label}: ${cnt} câu`}
                            style={{
                              width: `${pct}%`,
                              background: cfg.color,
                              height: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'var(--ez-text-on-brand)',
                              fontSize: '9px',
                              fontWeight: 600,
                            }}
                          >
                            {pct >= 25 ? cfg.label : ''}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Action button */}
                <button
                  type="button"
                  onClick={() => navigate(`/question-sets/${item.id}`)}
                  style={S.viewBtn}
                >
                  <FileText size={16} aria-hidden="true" /><span>Duyệt &amp; ban hành đề</span>
                </button>
              </article>
            ))}
          </div>

          {/* ── Load More ── */}
          {hasMore && (
            <div style={S.loadMoreWrap}>
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                style={S.loadMoreBtn}
              >
                {loadingMore ? (
                  <span>Đang tải…</span>
                ) : (
                  <>
                    <Download size={16} aria-hidden="true" /><span>Xem thêm</span>
                  </>
                )}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════ */
/* STYLES                                                                    */
/* ═══════════════════════════════════════════════════════════════════════════ */
const S: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: '1100px',
    margin: '0 auto',
    padding: '32px 24px 64px',
    width: '100%',
    boxSizing: 'border-box',
  },

  // ── Header ──
  header: {
    marginBottom: '28px',
  },
  title: {
    fontSize: '24px',
    fontWeight: 700,
    color: 'var(--text-h)',
    margin: '0 0 6px 0',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  subtitle: {
    fontSize: '14px',
    color: 'var(--text)',
    margin: 0,
  },

  // ── Filters ──
  filterBar: {
    display: 'flex',
    gap: '12px',
    marginBottom: '24px',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  searchWrap: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    flex: '1 1 220px',
    minWidth: '180px',
  },
  searchIcon: {
    position: 'absolute',
    left: '14px',
    color: 'var(--muted)',
    pointerEvents: 'none',
  },
  searchInput: {
    width: '100%',
    padding: '10px 14px 10px 38px',
    fontSize: '14px',
    borderRadius: '10px',
    border: '1px solid var(--border)',
    backgroundColor: 'var(--surface)',
    color: 'var(--text-h)',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  filterSelect: {
    padding: '10px 14px',
    fontSize: '14px',
    borderRadius: '10px',
    border: '1px solid var(--border)',
    backgroundColor: 'var(--surface)',
    color: 'var(--text-h)',
    outline: 'none',
    cursor: 'pointer',
    minWidth: '140px',
  },
  clearBtn: {
    padding: '10px 16px',
    fontSize: '13px',
    fontWeight: 500,
    border: '1px solid var(--border)',
    borderRadius: '10px',
    backgroundColor: 'var(--surface)',
    color: 'var(--danger)',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
  },

  // ── Center states ──
  center: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '60px 20px',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '4px solid var(--border)',
    borderTop: '4px solid var(--accent)',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  errorBox: {
    padding: '14px 20px',
    backgroundColor: 'var(--danger-bg)',
    border: '1px solid var(--ez-error-border)',
    color: 'var(--danger)',
    borderRadius: '10px',
    fontSize: '14px',
    marginBottom: '16px',
    maxWidth: '500px',
    textAlign: 'center',
  },
  retryBtn: {
    padding: '10px 24px',
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--accent)',
    backgroundColor: 'var(--accent-bg)',
    border: '1px solid var(--accent-border)',
    borderRadius: '10px',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
  },

  // ── Empty state ──
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '80px 20px',
    textAlign: 'center',
  },
  emptyIcon: {
    display: 'flex',
    color: 'var(--muted)',
    marginBottom: '16px',
  },
  emptyTitle: {
    fontSize: '18px',
    fontWeight: 600,
    color: 'var(--text-h)',
    margin: '0 0 8px 0',
  },
  emptyText: {
    fontSize: '14px',
    color: 'var(--text)',
    margin: '0 0 20px 0',
    maxWidth: '400px',
  },

  // ── Grid ──
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: '20px',
  },

  // ── Card ──
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '20px',
    borderRadius: '14px',
    border: '1px solid var(--border)',
    backgroundColor: 'var(--surface)',
    boxShadow: 'var(--shadow-card)',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    textAlign: 'left',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardDate: {
    fontSize: '12px',
    color: 'var(--muted)',
    fontWeight: 500,
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '16px',
    padding: '4px 6px',
    borderRadius: '6px',
    opacity: 0.5,
    transition: 'opacity 0.2s',
    display: 'inline-flex',
    alignItems: 'center',
    color: 'var(--danger)',
  },
  docNameIcon: {
    verticalAlign: '-3px',
    marginRight: '6px',
    color: 'var(--muted)',
  },
  cardDocName: {
    fontSize: '15px',
    fontWeight: 600,
    color: 'var(--text-h)',
    margin: 0,
    lineHeight: 1.4,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  cardMeta: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  metaBadge: {
    fontSize: '11px',
    fontWeight: 600,
    padding: '3px 10px',
    borderRadius: '16px',
    backgroundColor: 'var(--accent-bg)',
    color: 'var(--accent)',
    border: '1px solid var(--accent-border)',
  },
  typeBadge: {
    backgroundColor: 'var(--accent-2-bg)',
    color: 'var(--accent-2)',
    border: '1px solid var(--ez-secondary-border)',
  },
  diffEasy: {
    backgroundColor: 'var(--success-bg)',
    color: 'var(--success)',
    border: '1px solid var(--ez-success-border)',
  },
  diffMedium: {
    backgroundColor: 'var(--warning-bg)',
    color: 'var(--warning)',
    border: '1px solid var(--ez-warning-border)',
  },
  diffHard: {
    backgroundColor: 'var(--danger-bg)',
    color: 'var(--danger)',
    border: '1px solid var(--ez-error-border)',
  },
  bloomBar: {
    display: 'flex',
    borderRadius: '6px',
    overflow: 'hidden',
    height: '16px',
  },
  viewBtn: {
    marginTop: 'auto',
    padding: '10px 0',
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--ez-text-on-brand)',
    background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'opacity 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },

  // ── Load more ──
  loadMoreWrap: {
    display: 'flex',
    justifyContent: 'center',
    marginTop: '32px',
  },
  loadMoreBtn: {
    padding: '12px 36px',
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--accent)',
    backgroundColor: 'var(--accent-bg)',
    border: '1px solid var(--accent-border)',
    borderRadius: '12px',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
  },

  // ── Confirm Dialog ──
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--overlay-bg)',
    backdropFilter: 'blur(4px)',
  },
  dialog: {
    width: '100%',
    maxWidth: '440px',
    margin: '16px',
    padding: '28px',
    borderRadius: '16px',
    backgroundColor: 'var(--modal-bg)',
    boxShadow: 'var(--modal-shadow)',
    textAlign: 'left',
  },
  dialogTitle: {
    fontSize: '18px',
    fontWeight: 700,
    color: 'var(--text-h)',
    margin: '0 0 12px 0',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  dialogBody: {
    fontSize: '14px',
    color: 'var(--text)',
    margin: '0 0 8px 0',
    lineHeight: 1.5,
  },
  dialogNote: {
    fontSize: '13px',
    color: 'var(--danger)',
    margin: '0 0 16px 0',
    fontStyle: 'italic',
  },
  dialogError: {
    fontSize: '13px',
    color: 'var(--danger)',
    backgroundColor: 'var(--danger-bg)',
    padding: '8px 12px',
    borderRadius: '8px',
    marginBottom: '12px',
  },
  dialogActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
  },
  btnCancel: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--text)',
    backgroundColor: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '10px',
    cursor: 'pointer',
  },
  btnDanger: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--ez-text-on-brand)',
    backgroundColor: 'var(--danger)',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
  },
};

export default QuestionHistoryPage;
