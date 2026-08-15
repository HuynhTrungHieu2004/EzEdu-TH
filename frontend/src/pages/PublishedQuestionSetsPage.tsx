import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { questionApi } from '../api/questionApi';
import type { LearningHistoryItem, QuestionSetSummary } from '../api/questionApi';
import { getApiErrorDetail, isUnauthorizedError } from '../api/errors';

const PublishedQuestionSetsPage = () => {
  const [items, setItems] = useState<QuestionSetSummary[]>([]);
  const [attempts, setAttempts] = useState<LearningHistoryItem[]>([]);
  const [activeTab, setActiveTab] = useState<'pending' | 'completed'>('pending');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [result, history] = await Promise.all([
          questionApi.listPublished(search.trim(), controller.signal),
          questionApi.listMyLearningHistory(),
        ]);
        setItems(result.items);
        setAttempts(history.filter((item) => item.item_type === 'practice'));
      } catch (err: unknown) {
        if (isUnauthorizedError(err)) {
          localStorage.removeItem('access_token');
          navigate('/login');
          return;
        }
        if (!controller.signal.aborted) {
          setError(getApiErrorDetail(err) ?? 'Không tải được ngân hàng câu hỏi đã xuất bản.');
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };
    const timer = window.setTimeout(load, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [search, navigate]);

  const attemptsBySet = new Map<string, LearningHistoryItem>();
  for (const attempt of attempts) {
    if (attempt.question_set_id && !attemptsBySet.has(attempt.question_set_id)) attemptsBySet.set(attempt.question_set_id, attempt);
  }
  const pendingItems = items.filter((item) => !attemptsBySet.has(item.id));
  const completedItems = items.filter((item) => attemptsBySet.has(item.id));
  const visibleItems = activeTab === 'pending' ? pendingItems : completedItems;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Bài thi của bạn</h1>
          <p style={styles.subtitle}>Bài thi giảng viên vừa ban hành sẽ được đánh dấu đỏ cho đến khi bạn hoàn thành.</p>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo tên tài liệu..."
          style={styles.search}
        />
      </div>

      <div style={styles.tabs} role="tablist" aria-label="Trạng thái bài thi">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'pending'}
          onClick={() => setActiveTab('pending')}
          style={{ ...styles.tab, ...(activeTab === 'pending' ? styles.activeTab : {}) }}
        >
          Chưa hoàn thành
          {pendingItems.length > 0 && <span style={styles.redBadge}>{pendingItems.length}</span>}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'completed'}
          onClick={() => setActiveTab('completed')}
          style={{ ...styles.tab, ...(activeTab === 'completed' ? styles.activeTab : {}) }}
        >
          Đã hoàn thành <span style={styles.countBadge}>{completedItems.length}</span>
        </button>
      </div>

      {error && <div style={styles.error}>{error}</div>}
      {loading && <p style={styles.muted}>Đang tải...</p>}

      {!loading && visibleItems.length === 0 && (
        <div style={styles.empty}>
          {activeTab === 'pending' ? 'Bạn không có bài thi nào chưa hoàn thành.' : 'Bạn chưa hoàn thành bài thi nào.'}
        </div>
      )}

      <div style={styles.grid}>
        {visibleItems.map((item) => {
          const latestAttempt = attemptsBySet.get(item.id);
          return (
          <article key={item.id} style={styles.card}>
            <div style={styles.cardStatus}>
              <span style={activeTab === 'pending' ? styles.pendingPill : styles.completedPill}>
                {activeTab === 'pending' ? (
                  '● Bài thi mới'
                ) : (
                  <>
                    <Check size={12} aria-hidden="true" style={{ verticalAlign: 'text-bottom' }} /> Đã hoàn thành
                  </>
                )}
              </span>
            </div>
            <h3 style={styles.cardTitle}>{item.document_name}</h3>
            <div style={styles.meta}>
              <span>{item.published_question_count || item.question_count} câu đã xuất bản</span>
              <span>{item.difficulty}</span>
              <span>{item.question_type}</span>
            </div>
            {latestAttempt && (
              <div style={styles.resultBox}>
                Kết quả gần nhất: <strong>{latestAttempt.score}/{latestAttempt.max_score} — {latestAttempt.percent.toFixed(1)}%</strong>
              </div>
            )}
            <button type="button" onClick={() => navigate(`/question-sets/${item.id}`)} style={styles.button}>
              {activeTab === 'pending' ? 'Bắt đầu làm bài' : 'Xem lại / Làm lại'}
            </button>
          </article>
          );
        })}
      </div>
    </div>
  );
};

const styles = {
  container: {
    padding: '40px',
    maxWidth: '980px',
    margin: '0 auto',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '16px',
    flexWrap: 'wrap' as const,
    marginBottom: '24px',
  },
  title: {
    margin: 0,
    color: 'var(--ez-text)',
    fontSize: '26px',
  },
  subtitle: {
    margin: '6px 0 0',
    color: 'var(--ez-text-muted)',
    fontSize: '14px',
  },
  search: {
    minWidth: '260px',
    border: '1px solid var(--ez-border)',
    borderRadius: '8px',
    padding: '10px 12px',
    backgroundColor: 'var(--ez-bg)',
    color: 'var(--ez-text)',
  },
  tabs: { display: 'flex', gap: '10px', marginBottom: '22px', flexWrap: 'wrap' as const },
  tab: { display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '11px 16px', border: '1px solid var(--ez-border)', borderRadius: '10px', background: 'var(--ez-bg)', color: 'var(--ez-text-muted)', fontWeight: 700, cursor: 'pointer' },
  activeTab: { background: 'var(--ez-primary)', color: 'var(--ez-text-on-brand)', borderColor: 'var(--ez-primary)' },
  redBadge: { minWidth: '20px', height: '20px', padding: '0 6px', borderRadius: '999px', background: 'var(--ez-error)', color: 'var(--ez-text-on-brand)', fontSize: '12px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  countBadge: { minWidth: '20px', height: '20px', padding: '0 6px', borderRadius: '999px', background: 'rgba(255,255,255,0.2)', fontSize: '12px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  error: {
    padding: '12px 14px',
    borderRadius: '8px',
    backgroundColor: 'var(--ez-error-subtle)',
    border: '1px solid var(--ez-error-border)',
    color: 'var(--ez-error-text)',
    marginBottom: '16px',
  },
  muted: {
    color: 'var(--ez-text-muted)',
  },
  empty: {
    padding: '28px',
    border: '1px solid var(--ez-border)',
    borderRadius: '12px',
    backgroundColor: 'var(--ez-bg)',
    color: 'var(--ez-text-muted)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: '16px',
  },
  card: {
    padding: '18px',
    border: '1px solid var(--ez-border)',
    borderRadius: '12px',
    backgroundColor: 'var(--ez-bg)',
    boxShadow: 'var(--ez-shadow-lg)',
  },
  cardStatus: { display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' },
  pendingPill: { color: 'var(--ez-error-text)', background: 'var(--ez-error-subtle)', borderRadius: '999px', padding: '5px 9px', fontSize: '12px', fontWeight: 800 },
  completedPill: { color: 'var(--ez-success-text)', background: 'var(--ez-success-subtle)', borderRadius: '999px', padding: '5px 9px', fontSize: '12px', fontWeight: 800 },
  resultBox: { padding: '10px', marginBottom: '12px', borderRadius: '8px', background: 'var(--ez-surface-muted)', color: 'var(--ez-text)', fontSize: '13px' },
  cardTitle: {
    margin: '0 0 12px',
    color: 'var(--ez-text)',
    fontSize: '17px',
  },
  meta: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap' as const,
    color: 'var(--ez-text-muted)',
    fontSize: '12px',
    marginBottom: '16px',
  },
  button: {
    width: '100%',
    padding: '10px 12px',
    border: 'none',
    borderRadius: '8px',
    backgroundColor: 'var(--ez-primary)',
    color: 'var(--ez-text-on-brand)',
    fontWeight: 700,
    cursor: 'pointer',
  },
};

export default PublishedQuestionSetsPage;
