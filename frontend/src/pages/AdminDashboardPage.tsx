import { useState, useEffect, useRef, useCallback } from 'react';
import { analyticsApi } from '../api/analyticsApi';
import type {
  OverviewResponse, UsageResponse, QualityResponse,
  ErrorsLatencyResponse, EvaluationResponse, DateRangeFilter,
} from '../types/analytics';
import './AdminDashboardPage.css';

// ─────── Helpers ────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, unit = ''): string {
  if (n === null || n === undefined) return 'Không có dữ liệu';
  return `${n.toLocaleString('vi-VN')}${unit}`;
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return 'Không có dữ liệu';
  return `${n.toFixed(1)}%`;
}

// ─────── Date Preset Helpers ─────────────────────────────────────────────────

function todayRange(): DateRangeFilter {
  const now = new Date();
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  return {
    from_date: from.toISOString(),
    to_date: now.toISOString(),
    timezone: 'Asia/Ho_Chi_Minh',
    bucket: 'hour',
  };
}

function daysAgoRange(days: number): DateRangeFilter {
  const now = new Date();
  const from = new Date(now.getTime() - days * 86400_000);
  return {
    from_date: from.toISOString(),
    to_date: now.toISOString(),
    timezone: 'Asia/Ho_Chi_Minh',
    bucket: 'day',
  };
}

// ─────── Tiny SVG Bar Chart ──────────────────────────────────────────────────

function MiniBarChart({ data, color = '#6366f1' }: { data: number[]; color?: string }) {
  if (!data.length) return <p className="chart-empty">Không có dữ liệu</p>;
  const max = Math.max(...data, 1);
  const W = 300, H = 60, gap = 2;
  const bw = (W - gap * (data.length - 1)) / data.length;
  return (
    <svg role="img" aria-label="Biểu đồ cột" viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
      {data.map((v, i) => {
        const h = (v / max) * (H - 4);
        return <rect key={i} x={i * (bw + gap)} y={H - h} width={bw} height={h} fill={color} rx="2" />;
      })}
    </svg>
  );
}

// ─────── Donut Chart ─────────────────────────────────────────────────────────

function DonutChart({ value, total, color = '#6366f1' }: { value: number; total: number; color?: string }) {
  const r = 28, cx = 36, cy = 36, C = 2 * Math.PI * r;
  const pct = total > 0 ? value / total : 0;
  return (
    <svg role="img" aria-label={`${Math.round(pct * 100)}%`} viewBox="0 0 72 72" width="72" height="72">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--glass-border)" strokeWidth="8" />
      <circle
        cx={cx} cy={cy} r={r} fill="none"
        stroke={color} strokeWidth="8"
        strokeDasharray={`${pct * C} ${C}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text x={cx} y={cy + 5} textAnchor="middle" fontSize="11" fill="var(--text-primary)">
        {Math.round(pct * 100)}%
      </text>
    </svg>
  );
}

// ─────── Panel Wrapper ────────────────────────────────────────────────────────

type PanelState = 'loading' | 'error' | 'ok';

function Panel({
  title, state, onRetry, children,
}: { title: string; state: PanelState; onRetry?: () => void; children: React.ReactNode }) {
  return (
    <section className="admin-panel" aria-label={title}>
      <h3 className="panel-title">{title}</h3>
      {state === 'loading' && <p className="panel-loading" role="status">Đang tải...</p>}
      {state === 'error' && (
        <div className="panel-error" role="alert">
          <span>Lỗi tải dữ liệu.</span>
          {onRetry && <button type="button" onClick={onRetry} className="btn-retry">Thử lại</button>}
        </div>
      )}
      {state === 'ok' && children}
    </section>
  );
}

// ─────── Stat Card ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat-card">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}

// ─────── Overview Tab ────────────────────────────────────────────────────────

function OverviewTab({ filter }: { filter: DateRangeFilter }) {
  const [state, setState] = useState<PanelState>('loading');
  const [data, setData] = useState<OverviewResponse | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState('loading');
    analyticsApi.getOverview(filter, ctrl.signal)
      .then((d) => { setData(d); setState('ok'); })
      .catch((e) => { if (e?.name !== 'CanceledError') setState('error'); });
  }, [filter]);

  useEffect(() => { load(); return () => abortRef.current?.abort(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect

  return (
    <>
      <Panel title="Tổng quan hệ thống" state={state} onRetry={load}>
        {data && (
          <>
            <div className="stat-grid">
              <StatCard label="Tổng người dùng" value={fmt(data.total_users)} />
              <StatCard label="AI-Active Users" value={fmt(data.ai_active_users)} sub="Final logical AI ops trong kỳ" />
              <StatCard label="Hội thoại hoạt động" value={fmt(data.total_conversations)} />
              <StatCard label="Tin nhắn người học" value={fmt(data.total_messages.user)} />
              <StatCard label="Tin nhắn AI" value={fmt(data.total_messages.assistant)} />
              <StatCard label="Học liệu đã index" value={fmt(data.documents.indexed)} sub={`/ ${fmt(data.documents.total)} tổng`} />
              <StatCard label="Kiểm tra CL thành công" value={fmt(data.verification.success)} />
              <StatCard label="Tỷ lệ 👍 hữu ích" value={fmtPct(data.feedback.helpful_ratio)} sub={`${fmt(data.feedback.total)} phản hồi`} />
            </div>
            {/* Accessible table summary */}
            <details className="accessible-table-toggle">
              <summary>Xem dữ liệu dạng bảng</summary>
              <table className="accessible-table" aria-label="Bảng tổng quan hệ thống">
                <caption>Tổng quan hệ thống trong kỳ</caption>
                <thead><tr><th>Chỉ số</th><th>Giá trị</th></tr></thead>
                <tbody>
                  <tr><td>Tổng người dùng</td><td>{data.total_users}</td></tr>
                  <tr><td>AI-Active Users</td><td>{data.ai_active_users}</td></tr>
                  <tr><td>Hội thoại hoạt động</td><td>{data.total_conversations}</td></tr>
                  <tr><td>Tin nhắn người học</td><td>{data.total_messages.user}</td></tr>
                  <tr><td>Tin nhắn AI</td><td>{data.total_messages.assistant}</td></tr>
                  <tr><td>Học liệu đã index</td><td>{data.documents.indexed}</td></tr>
                  <tr><td>Phản hồi hữu ích</td><td>{data.feedback.helpful}</td></tr>
                  <tr><td>Phản hồi không hữu ích</td><td>{data.feedback.not_helpful}</td></tr>
                  <tr><td>Tỷ lệ hữu ích</td><td>{fmtPct(data.feedback.helpful_ratio)}</td></tr>
                </tbody>
              </table>
            </details>
          </>
        )}
      </Panel>
    </>
  );
}

// ─────── Usage Tab ────────────────────────────────────────────────────────────

function UsageTab({ filter }: { filter: DateRangeFilter }) {
  const [state, setState] = useState<PanelState>('loading');
  const [data, setData] = useState<UsageResponse | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState('loading');
    analyticsApi.getUsage(filter, ctrl.signal)
      .then((d) => { setData(d); setState('ok'); })
      .catch((e) => { if (e?.name !== 'CanceledError') setState('error'); });
  }, [filter]);

  useEffect(() => { load(); return () => abortRef.current?.abort(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect

  return (
    <Panel title="Mức sử dụng AI" state={state} onRetry={load}>
      {data && (
        <>
          <div className="stat-grid">
            <StatCard label="Token đầu vào" value={fmt(data.tokens.input_tokens)} />
            <StatCard label="Token đầu ra" value={fmt(data.tokens.output_tokens)} />
            <StatCard label="Tổng token" value={fmt(data.tokens.total_tokens)} sub="Chỉ khi SDK trả metadata" />
            <StatCard
              label="Quota nhà cung cấp"
              value={data.provider_quota_status === 'unsupported' ? 'Không hỗ trợ' : 'Hỗ trợ'}
              sub="Ngưỡng nội bộ"
            />
          </div>

          <div className="chart-section">
            <h4>Logical Requests vs Attempts theo thời gian</h4>
            <MiniBarChart data={data.buckets.map((b) => b.logical_requests)} color="#6366f1" />
            <p className="chart-caption">▪ Tím: Logical requests (final) &nbsp; ▫ Attempts bao gồm retry</p>
          </div>

          <div className="two-col">
            <div>
              <h4>Phân bổ Model</h4>
              <ul className="legend-list" aria-label="Phân bổ model AI">
                {Object.entries(data.models).map(([m, c]) => (
                  <li key={m}><span className="legend-dot" />{m}: <strong>{c}</strong></li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Retrieval Mode</h4>
              <ul className="legend-list" aria-label="Phân bổ retrieval mode">
                {Object.entries(data.retrieval_modes).map(([m, c]) => (
                  <li key={m}><span className="legend-dot" />{m}: <strong>{c}</strong></li>
                ))}
              </ul>
            </div>
          </div>

          <details className="accessible-table-toggle">
            <summary>Xem dữ liệu token dạng bảng</summary>
            <table className="accessible-table" aria-label="Token usage detail">
              <caption>Thống kê token sử dụng AI</caption>
              <thead><tr><th>Chỉ số</th><th>Giá trị</th></tr></thead>
              <tbody>
                <tr><td>Input tokens</td><td>{fmt(data.tokens.input_tokens)}</td></tr>
                <tr><td>Output tokens</td><td>{fmt(data.tokens.output_tokens)}</td></tr>
                <tr><td>Total tokens</td><td>{fmt(data.tokens.total_tokens)}</td></tr>
                <tr><td>Events có metadata</td><td>{data.tokens.events_with_usage_metadata}</td></tr>
                <tr><td>Events không có metadata</td><td>{data.tokens.events_without_usage_metadata}</td></tr>
              </tbody>
            </table>
          </details>
        </>
      )}
    </Panel>
  );
}

// ─────── Quality Tab ──────────────────────────────────────────────────────────

function QualityTab({ filter }: { filter: DateRangeFilter }) {
  const [state, setState] = useState<PanelState>('loading');
  const [data, setData] = useState<QualityResponse | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState('loading');
    analyticsApi.getQuality(filter, ctrl.signal)
      .then((d) => { setData(d); setState('ok'); })
      .catch((e) => { if (e?.name !== 'CanceledError') setState('error'); });
  }, [filter]);

  useEffect(() => { load(); return () => abortRef.current?.abort(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect

  return (
    <Panel title="Chất lượng AI" state={state} onRetry={load}>
      {data && (() => {
        // Derive counts from ratios since QualityResponse only has totals + ratios
        const helpfulCount = data.helpful_ratio !== null
          ? Math.round((data.helpful_ratio / 100) * data.total_feedback)
          : 0;
        const notHelpfulCount = data.total_feedback - helpfulCount;
        return (
          <>
            <div className="feedback-donut-row">
              <div className="donut-item">
                <DonutChart value={helpfulCount} total={data.total_feedback} color="#22c55e" />
                <span>👍 Hữu ích: {fmtPct(data.helpful_ratio)}</span>
              </div>
              <div className="donut-item">
                <DonutChart value={notHelpfulCount} total={data.total_feedback} color="#ef4444" />
                <span>👎 Không hữu ích: {fmtPct(data.not_helpful_ratio)}</span>
              </div>
            </div>

            <div className="stat-grid">
            <StatCard label="Thiếu bằng chứng" value={fmtPct(data.insufficient_evidence_rate)} sub="evidence_status=insufficient_evidence" />
            <StatCard label="Lỗi tìm kiếm web" value={fmtPct(data.external_search_failure_rate)} sub="Các lần gọi web grounding thất bại" />
          </div>

          {Object.keys(data.negative_reasons).length > 0 && (
            <div>
              <h4>Lý do phản hồi tiêu cực phổ biến</h4>
              <ul className="legend-list" aria-label="Lý do phản hồi tiêu cực">
                {Object.entries(data.negative_reasons).map(([r, c]) => (
                  <li key={r}><span className="legend-dot legend-dot--red" />{r}: <strong>{c}</strong></li>
                ))}
              </ul>
            </div>
          )}
        </>
        );
      })()}
    </Panel>
  );
}

// ─────── Errors & Latency Tab ─────────────────────────────────────────────────

function ErrorsLatencyTab({ filter }: { filter: DateRangeFilter }) {
  const [state, setState] = useState<PanelState>('loading');
  const [data, setData] = useState<ErrorsLatencyResponse | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState('loading');
    analyticsApi.getErrorsLatency(filter, ctrl.signal)
      .then((d) => { setData(d); setState('ok'); })
      .catch((e) => { if (e?.name !== 'CanceledError') setState('error'); });
  }, [filter]);

  useEffect(() => { load(); return () => abortRef.current?.abort(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect

  return (
    <Panel title="Lỗi & Độ trễ" state={state} onRetry={load}>
      {data && (
        <>
          <div className="stat-grid">
            <StatCard label="Tỷ lệ thành công" value={fmtPct(data.success_rate)} />
            <StatCard label="Độ trễ TB" value={fmt(data.latency.average_ms, ' ms')} />
            <StatCard label="P50 Latency" value={fmt(data.latency.p50_ms, ' ms')} />
            <StatCard label="P95 Latency" value={fmt(data.latency.p95_ms, ' ms')} />
          </div>

          {Object.keys(data.errors).length > 0 && (
            <div>
              <h4>Phân bổ lỗi</h4>
              <ul className="legend-list" aria-label="Phân bổ mã lỗi">
                {Object.entries(data.errors).map(([code, count]) => (
                  <li key={code}><span className="legend-dot legend-dot--red" />{code}: <strong>{count}</strong></li>
                ))}
              </ul>
            </div>
          )}

          <div className="chart-section">
            <h4>Tỷ lệ thành công theo thời gian</h4>
            <MiniBarChart
              data={data.buckets.map((b) => b.success_rate ?? 0)}
              color="#22c55e"
            />
          </div>

          <details className="accessible-table-toggle">
            <summary>Xem dữ liệu latency dạng bảng</summary>
            <table className="accessible-table" aria-label="Latency detail">
              <caption>Thống kê độ trễ phần trăm</caption>
              <thead><tr><th>Chỉ số</th><th>Giá trị (ms)</th></tr></thead>
              <tbody>
                <tr><td>Độ trễ trung bình</td><td>{fmt(data.latency.average_ms)}</td></tr>
                <tr><td>P50 (Median)</td><td>{fmt(data.latency.p50_ms)}</td></tr>
                <tr><td>P95</td><td>{fmt(data.latency.p95_ms)}</td></tr>
              </tbody>
            </table>
          </details>
        </>
      )}
    </Panel>
  );
}

// ─────── Evaluation Tab ───────────────────────────────────────────────────────

function EvaluationTab() {
  const [state, setState] = useState<PanelState>('loading');
  const [data, setData] = useState<EvaluationResponse | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState('loading');
    analyticsApi.getEvaluation(ctrl.signal)
      .then((d) => { setData(d); setState('ok'); })
      .catch((e) => { if (e?.name !== 'CanceledError') setState('error'); });
  }, []);

  useEffect(() => { load(); return () => abortRef.current?.abort(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect

  const statusBadge = (d: EvaluationResponse) => {
    const badges: Record<string, string> = {
      ok: '✅ OK', stale: '⚠️ Stale', missing: '❌ Missing',
      malformed: '❌ Malformed', oversized: '❌ Oversized',
    };
    return <span className="eval-badge">{badges[d.status] ?? d.status}</span>;
  };

  return (
    <Panel title="RAG Benchmark Offline" state={state} onRetry={load}>
      {data && (
        <>
          <div className="eval-meta">
            {statusBadge(data)}
            {data.meta && (
              <>
                <span className={`eval-badge eval-badge--${data.meta.source_mode}`}>
                  {data.meta.source_mode === 'live' ? '🟢 Live' : '🔵 Mock'}
                </span>
                {data.meta.is_stale && <span className="eval-badge eval-badge--stale">⏰ Stale</span>}
              </>
            )}
            <small className="eval-note">Dữ liệu TÁCH BIỆT với production usage</small>
          </div>

          {data.status === 'missing' && <p>{data.message}</p>}

          {data.summary && (
            <>
              <div className="stat-grid">
                <StatCard label="Kết quả" value={data.summary.passed ? '✅ PASS' : '❌ FAIL'} />
                <StatCard label="Test cases" value={`${data.summary.passed_cases}/${data.summary.total_cases}`} />
                <StatCard label="LLM Model" value={data.summary.llm_model} />
                <StatCard label="Embedding" value={data.summary.embedding_model} />
              </div>

              <table className="accessible-table" aria-label="Kết quả benchmark offline">
                <caption>Kết quả RAG Benchmark theo thành phần — Offline / {data.meta?.source_mode ?? 'N/A'}</caption>
                <thead>
                  <tr><th>Thành phần</th><th>Tổng</th><th>Đạt</th><th>Thất bại</th><th>Tỷ lệ</th><th>Ngưỡng</th></tr>
                </thead>
                <tbody>
                  {Object.entries(data.summary.categories).map(([cat, c]) => (
                    <tr key={cat}>
                      <td>{cat}</td>
                      <td>{c.total}</td>
                      <td>{c.passed}</td>
                      <td>{c.failed}</td>
                      <td>{c.total > 0 ? `${((c.passed / c.total) * 100).toFixed(0)}%` : 'N/A'}</td>
                      <td>{(c.threshold * 100).toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}
    </Panel>
  );
}

// ─────── Main Dashboard Page ──────────────────────────────────────────────────

type Tab = 'overview' | 'usage' | 'quality' | 'errors' | 'evaluation';
type Preset = 'today' | '7d' | '30d' | 'custom';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: '📊 Tổng quan' },
  { id: 'usage', label: '⚡ Mức sử dụng' },
  { id: 'quality', label: '⭐ Chất lượng AI' },
  { id: 'errors', label: '🔥 Lỗi & Độ trễ' },
  { id: 'evaluation', label: '🔬 RAG Benchmark' },
];

export default function AdminDashboardPage() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [preset, setPreset] = useState<Preset>('7d');
  const [filter, setFilter] = useState<DateRangeFilter>(daysAgoRange(7));

  const applyPreset = (p: Preset) => {
    setPreset(p);
    if (p === 'today') setFilter(todayRange());
    else if (p === '7d') setFilter(daysAgoRange(7));
    else if (p === '30d') setFilter(daysAgoRange(30));
    // 'custom' handled separately
  };

  return (
    <div className="admin-dashboard">
      <header className="admin-header">
        <h1>Dashboard Quản trị</h1>
        <p className="admin-subtitle">Thống kê hoạt động và chất lượng AI — chỉ dành cho quản trị viên</p>
      </header>

      {/* Date Preset Controls */}
      <div className="preset-bar" role="group" aria-label="Bộ lọc thời gian">
        {(['today', '7d', '30d'] as Preset[]).map((p) => (
          <button
            key={p}
            type="button"
            className={`preset-btn${preset === p ? ' preset-btn--active' : ''}`}
            onClick={() => applyPreset(p)}
          >
            {p === 'today' ? 'Hôm nay' : p === '7d' ? '7 ngày' : '30 ngày'}
          </button>
        ))}
      </div>

      {/* Tab Navigation */}
      <nav className="admin-tabs" role="tablist" aria-label="Tab thống kê quản trị">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={activeTab === t.id}
            className={`admin-tab${activeTab === t.id ? ' admin-tab--active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* Tab Content */}
      <main className="admin-content" role="tabpanel" aria-live="polite">
        {activeTab === 'overview' && <OverviewTab filter={filter} />}
        {activeTab === 'usage' && <UsageTab filter={filter} />}
        {activeTab === 'quality' && <QualityTab filter={filter} />}
        {activeTab === 'errors' && <ErrorsLatencyTab filter={filter} />}
        {activeTab === 'evaluation' && <EvaluationTab />}
      </main>
    </div>
  );
}
