import { useState, useEffect, useRef, useCallback, type FormEvent, type ReactNode } from 'react';
import { analyticsApi } from '../api/analyticsApi';
import type {
  BackendHealthResponse,
  OverviewResponse, UsageResponse, QualityResponse,
  ErrorsLatencyResponse, EvaluationResponse, DateRangeFilter,
  AdminManagedRole, AdminUserItem, AdminUserStatusFilter,
  AuditLogItem, AuditLogSeverity,
  ErrorLogItem, ErrorMonitoringSummary, ErrorSeverity,
} from '../types/analytics';
import { API_BASE_URL, isApiBaseUrlConfigured } from '../config/api';
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

function csvEscape(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  return `"${raw.replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  if (!rows.length) return;
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const csv = [
    headers.map(csvEscape).join(','),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(',')),
  ].join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function toDateInputValue(value: string | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function dateInputToIso(value: string, endOfDay = false) {
  const suffix = endOfDay ? 'T23:59:59.999+07:00' : 'T00:00:00+07:00';
  return new Date(`${value}${suffix}`).toISOString();
}

function pickBucket(fromDate: string, toDate: string): DateRangeFilter['bucket'] {
  const from = new Date(fromDate).getTime();
  const to = new Date(toDate).getTime();
  const days = Math.max(1, Math.ceil((to - from) / 86400_000));
  if (days <= 1) return 'hour';
  if (days > 90) return 'week';
  return 'day';
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
  title, state, onRetry, actions, children,
}: { title: string; state: PanelState; onRetry?: () => void; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="admin-panel" aria-label={title}>
      <div className="panel-heading">
        <h3 className="panel-title">{title}</h3>
        {actions && <div className="panel-actions">{actions}</div>}
      </div>
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

// ─────── Backend Connection Panel ────────────────────────────────────────────

const SERVICE_LABELS: Record<string, string> = {
  mongodb: 'MongoDB',
  chromadb: 'ChromaDB',
  mongodb_indexes: 'MongoDB indexes',
  gemini: 'Gemini',
  groq: 'Groq',
  fastapi_backend: 'FastAPI',
  embedding_service: 'Embedding',
  web_search: 'Web search',
  document_processing: 'Xử lý học liệu',
  background_jobs: 'Background jobs',
  storage: 'Storage',
  frontend_api_connectivity: 'Frontend API',
};

const HEALTH_LABELS: Record<string, string> = {
  healthy: 'Hoạt động',
  degraded: 'Suy giảm',
  down: 'Không khả dụng',
  unknown: 'Chưa xác định',
  unavailable: 'Không khả dụng',
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Không có dữ liệu';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'medium',
    hour12: false,
  });
}

function BackendConnectionPanel() {
  const [state, setState] = useState<PanelState>('loading');
  const [data, setData] = useState<BackendHealthResponse | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState('loading');
    analyticsApi.getBackendHealth(ctrl.signal)
      .then((d) => { setData(d); setState('ok'); })
      .catch((e) => { if (e?.name !== 'CanceledError') setState('error'); });
  }, []);

  useEffect(() => { load(); return () => abortRef.current?.abort(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect

  return (
    <Panel title="Kết nối backend" state={state} onRetry={load}>
      {data && (
        <div className="backend-health">
          <div className={`backend-health-summary backend-health-summary--${data.status}`}>
            <span className="backend-health-dot" aria-hidden="true" />
            <div>
              <p className="backend-health-state">{HEALTH_LABELS[data.status] ?? data.status}</p>
              <p className="backend-health-meta">
                {data.project_name} · {isApiBaseUrlConfigured ? API_BASE_URL : 'Chưa cấu hình API URL'} · {data.api_v1_path}
              </p>
            </div>
            <time dateTime={data.generated_at}>Cập nhật {formatDateTime(data.generated_at)}</time>
          </div>

          <div className="backend-service-grid" aria-label="Trạng thái dịch vụ backend">
            {(data.components?.length ? data.components : Object.entries(data.services).map(([name, status]) => ({
              name,
              status,
              latency_ms: null,
              message: '',
              checked_at: data.generated_at,
              details: {},
            }))).map((component) => (
              <div className={`backend-service backend-service--${component.status}`} key={component.name} title={component.message}>
                <span>{SERVICE_LABELS[component.name] ?? component.name}</span>
                <strong>{HEALTH_LABELS[component.status] ?? component.status}</strong>
                {component.latency_ms !== null && <small>{component.latency_ms} ms</small>}
              </div>
            ))}
          </div>

          {data.alerts?.length > 0 && (
            <div className="health-alert-list">
              {data.alerts.slice(0, 4).map((alert) => (
                <div className={`health-alert health-alert--${alert.severity}`} key={`${alert.component}-${alert.message}`}>
                  <strong>{alert.severity}</strong>
                  <span>{alert.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Panel>
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

  const exportCsv = () => {
    if (!data) return;
    downloadCsv('ezedu-overview.csv', [
      { chi_so: 'Tổng người dùng', gia_tri: data.total_users },
      { chi_so: 'AI-Active Users', gia_tri: data.ai_active_users },
      { chi_so: 'Hội thoại hoạt động', gia_tri: data.total_conversations },
      { chi_so: 'Tin nhắn người học', gia_tri: data.total_messages.user },
      { chi_so: 'Tin nhắn AI', gia_tri: data.total_messages.assistant },
      { chi_so: 'Học liệu tổng', gia_tri: data.documents.total },
      { chi_so: 'Học liệu đã index', gia_tri: data.documents.indexed },
      { chi_so: 'Học liệu lỗi', gia_tri: data.documents.failed },
      { chi_so: 'Phản hồi hữu ích', gia_tri: data.feedback.helpful },
      { chi_so: 'Phản hồi không hữu ích', gia_tri: data.feedback.not_helpful },
      { chi_so: 'Tỷ lệ hữu ích', gia_tri: data.feedback.helpful_ratio ?? '' },
    ]);
  };

  return (
    <>
      <Panel
        title="Tổng quan hệ thống"
        state={state}
        onRetry={load}
        actions={<button type="button" className="admin-action-btn" onClick={exportCsv} disabled={!data}>Xuất báo cáo CSV</button>}
      >
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

  const exportCsv = () => {
    if (!data) return;
    downloadCsv('ezedu-usage.csv', [
      { nhom: 'tokens', chi_so: 'Input tokens', gia_tri: data.tokens.input_tokens ?? '' },
      { nhom: 'tokens', chi_so: 'Output tokens', gia_tri: data.tokens.output_tokens ?? '' },
      { nhom: 'tokens', chi_so: 'Total tokens', gia_tri: data.tokens.total_tokens ?? '' },
      { nhom: 'tokens', chi_so: 'Events có metadata', gia_tri: data.tokens.events_with_usage_metadata },
      { nhom: 'tokens', chi_so: 'Events không có metadata', gia_tri: data.tokens.events_without_usage_metadata },
      ...Object.entries(data.models).map(([model, count]) => ({ nhom: 'model', chi_so: model, gia_tri: count })),
      ...Object.entries(data.retrieval_modes).map(([mode, count]) => ({ nhom: 'retrieval', chi_so: mode, gia_tri: count })),
      ...data.buckets.map((bucket) => ({
        nhom: 'time_bucket',
        chi_so: bucket.time,
        logical_requests: bucket.logical_requests,
        attempts: bucket.attempts,
      })),
    ]);
  };

  return (
    <Panel
      title="Mức sử dụng AI"
      state={state}
      onRetry={load}
      actions={<button type="button" className="admin-action-btn" onClick={exportCsv} disabled={!data}>Xuất báo cáo CSV</button>}
    >
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

  const exportCsv = () => {
    if (!data) return;
    downloadCsv('ezedu-errors-latency.csv', [
      { nhom: 'summary', chi_so: 'Tỷ lệ thành công', gia_tri: data.success_rate ?? '' },
      { nhom: 'summary', chi_so: 'Tổng logical requests', gia_tri: data.total_logical_requests },
      { nhom: 'latency', chi_so: 'Độ trễ trung bình', gia_tri: data.latency.average_ms ?? '' },
      { nhom: 'latency', chi_so: 'P50', gia_tri: data.latency.p50_ms ?? '' },
      { nhom: 'latency', chi_so: 'P95', gia_tri: data.latency.p95_ms ?? '' },
      ...Object.entries(data.errors).map(([code, count]) => ({ nhom: 'error_code', chi_so: code, gia_tri: count })),
      ...data.buckets.map((bucket) => ({
        nhom: 'time_bucket',
        chi_so: bucket.time,
        success_rate: bucket.success_rate ?? '',
        avg_latency_ms: bucket.avg_latency_ms ?? '',
        total: bucket.total,
      })),
    ]);
  };

  return (
    <Panel
      title="Lỗi & Độ trễ"
      state={state}
      onRetry={load}
      actions={<button type="button" className="admin-action-btn" onClick={exportCsv} disabled={!data}>Xuất báo cáo CSV</button>}
    >
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

// ─────── User Management Tab ─────────────────────────────────────────────────

const ROLE_LABELS: Record<AdminManagedRole | 'user', string> = {
  student: 'Học sinh',
  lecturer: 'Giảng viên',
  admin: 'Admin',
  user: 'Người dùng',
};

function UserManagementTab() {
  const [state, setState] = useState<PanelState>('loading');
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<AdminManagedRole | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<AdminUserStatusFilter | 'all'>('all');
  const [page, setPage] = useState(0);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pageSize = 50;

  const load = useCallback(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState('loading');
    setNotice(null);
    analyticsApi.listUsers({
      search: search || undefined,
      role: role === 'all' ? undefined : role,
      status: statusFilter === 'all' ? undefined : statusFilter,
      limit: pageSize,
      skip: page * pageSize,
    }, ctrl.signal)
      .then((d) => {
        setUsers(d.items);
        setTotal(d.total);
        setState('ok');
      })
      .catch((e) => { if (e?.name !== 'CanceledError') setState('error'); });
  }, [page, role, search, statusFilter]);

  useEffect(() => { load(); return () => abortRef.current?.abort(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(0);
    setSearch(searchInput.trim());
  };

  const handleRoleChange = async (user: AdminUserItem, nextRole: AdminManagedRole) => {
    if (user.role === nextRole) return;
    setBusyUserId(user.id);
    setNotice(null);
    try {
      await analyticsApi.updateUserRole(user.id, nextRole);
      setNotice(`Đã đổi quyền của ${user.email} sang ${ROLE_LABELS[nextRole]}.`);
      load();
    } catch {
      setNotice('Không thể đổi quyền tài khoản này.');
    } finally {
      setBusyUserId(null);
    }
  };

  const handleStatusChange = async (user: AdminUserItem) => {
    setBusyUserId(user.id);
    setNotice(null);
    try {
      await analyticsApi.updateUserStatus(user.id, !user.is_active);
      setNotice(`${user.is_active ? 'Đã khóa' : 'Đã kích hoạt'} tài khoản ${user.email}.`);
      load();
    } catch {
      setNotice('Không thể cập nhật trạng thái tài khoản này.');
    } finally {
      setBusyUserId(null);
    }
  };

  return (
    <Panel title="Quản lý người dùng" state={state} onRetry={load}>
      <form className="admin-filter-grid" onSubmit={handleSearch} aria-label="Bộ lọc người dùng">
        <label>
          <span>Tìm kiếm</span>
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Tên hoặc email"
          />
        </label>
        <label>
          <span>Vai trò</span>
          <select value={role} onChange={(event) => { setPage(0); setRole(event.target.value as AdminManagedRole | 'all'); }}>
            <option value="all">Tất cả</option>
            <option value="student">Học sinh</option>
            <option value="lecturer">Giảng viên</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <label>
          <span>Trạng thái</span>
          <select value={statusFilter} onChange={(event) => { setPage(0); setStatusFilter(event.target.value as AdminUserStatusFilter | 'all'); }}>
            <option value="all">Tất cả</option>
            <option value="active">Đang hoạt động</option>
            <option value="locked">Đã khóa</option>
          </select>
        </label>
        <button type="submit" className="admin-action-btn admin-action-btn--primary">Tìm kiếm</button>
      </form>

      {notice && <p className="admin-inline-notice" role="status">{notice}</p>}
      <div className="admin-table-toolbar">
        <p className="admin-table-note">
          Hiển thị {users.length ? page * pageSize + 1 : 0}-{Math.min((page + 1) * pageSize, total)}/{total} tài khoản.
        </p>
        <div className="admin-pagination" aria-label="Phân trang người dùng">
          <button type="button" className="admin-action-btn" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            Trang trước
          </button>
          <button
            type="button"
            className="admin-action-btn"
            disabled={(page + 1) * pageSize >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            Trang sau
          </button>
        </div>
      </div>

      <div className="admin-table-wrap">
        <table className="accessible-table admin-data-table" aria-label="Danh sách tài khoản">
          <thead>
            <tr>
              <th>Người dùng</th>
              <th>Vai trò</th>
              <th>Trạng thái</th>
              <th>Ngày tạo</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>
                  <strong>{user.full_name || 'Chưa có tên'}</strong>
                  <span className="admin-cell-sub">{user.email}</span>
                </td>
                <td>
                  <select
                    className="admin-role-select"
                    value={user.role === 'user' ? 'student' : user.role}
                    disabled={busyUserId === user.id}
                    onChange={(event) => handleRoleChange(user, event.target.value as AdminManagedRole)}
                    aria-label={`Đổi quyền ${user.email}`}
                  >
                    <option value="student">Học sinh</option>
                    <option value="lecturer">Giảng viên</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td>
                  <span className={`admin-status-badge ${user.is_active ? 'admin-status-badge--active' : 'admin-status-badge--locked'}`}>
                    {user.is_active ? 'Hoạt động' : 'Đã khóa'}
                  </span>
                </td>
                <td>{formatDateTime(user.created_at)}</td>
                <td>
                  <button
                    type="button"
                    className={`admin-action-btn ${user.is_active ? 'admin-action-btn--danger' : 'admin-action-btn--success'}`}
                    disabled={busyUserId === user.id}
                    onClick={() => handleStatusChange(user)}
                  >
                    {user.is_active ? 'Khóa' : 'Kích hoạt'}
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5}>Không tìm thấy tài khoản phù hợp.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

// ─────── Audit Logs Tab ──────────────────────────────────────────────────────

const AUDIT_SEVERITY_LABELS: Record<AuditLogSeverity, string> = {
  info: 'Thông tin',
  warning: 'Cảnh báo',
  error: 'Lỗi',
};

const AUDIT_EVENT_LABELS: Record<string, string> = {
  user_role_updated: 'Đổi quyền người dùng',
  user_status_updated: 'Khóa / kích hoạt tài khoản',
  ai_usage_failure: 'Lỗi AI',
  document_processing_failure: 'Lỗi xử lý học liệu',
};

function AuditLogsTab({ filter }: { filter: DateRangeFilter }) {
  const [state, setState] = useState<PanelState>('loading');
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [eventType, setEventType] = useState('all');
  const [severity, setSeverity] = useState<AuditLogSeverity | 'all'>('all');
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState('loading');
    analyticsApi.listAuditLogs({
      ...filter,
      search: search || undefined,
      event_type: eventType === 'all' ? undefined : eventType,
      severity: severity === 'all' ? undefined : severity,
      limit: 120,
    }, ctrl.signal)
      .then((d) => {
        setLogs(d.items);
        setTotal(d.total);
        setState('ok');
      })
      .catch((e) => { if (e?.name !== 'CanceledError') setState('error'); });
  }, [eventType, filter, search, severity]);

  useEffect(() => { load(); return () => abortRef.current?.abort(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearch(searchInput.trim());
  };

  const exportCsv = () => {
    downloadCsv('ezedu-audit-logs.csv', logs.map((log) => ({
      thoi_gian: log.created_at,
      muc_do: log.severity,
      loai_su_kien: log.event_type,
      noi_dung: log.message,
      user_id: log.user_id ?? '',
      actor_user_id: log.actor_user_id ?? '',
      target_user_id: log.target_user_id ?? '',
      metadata: JSON.stringify(log.metadata ?? {}),
    })));
  };

  return (
    <Panel
      title="Nhật ký thao tác hệ thống"
      state={state}
      onRetry={load}
      actions={<button type="button" className="admin-action-btn" onClick={exportCsv} disabled={!logs.length}>Xuất CSV</button>}
    >
      <form className="admin-filter-grid" onSubmit={handleSearch} aria-label="Bộ lọc nhật ký">
        <label>
          <span>Tìm kiếm</span>
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Nội dung, model, mã lỗi..."
          />
        </label>
        <label>
          <span>Loại sự kiện</span>
          <select value={eventType} onChange={(event) => setEventType(event.target.value)}>
            <option value="all">Tất cả</option>
            <option value="user_role_updated">Đổi quyền người dùng</option>
            <option value="user_status_updated">Khóa / kích hoạt tài khoản</option>
            <option value="ai_usage_failure">Lỗi AI</option>
            <option value="document_processing_failure">Lỗi xử lý học liệu</option>
          </select>
        </label>
        <label>
          <span>Mức độ</span>
          <select value={severity} onChange={(event) => setSeverity(event.target.value as AuditLogSeverity | 'all')}>
            <option value="all">Tất cả</option>
            <option value="info">Thông tin</option>
            <option value="warning">Cảnh báo</option>
            <option value="error">Lỗi</option>
          </select>
        </label>
        <button type="submit" className="admin-action-btn admin-action-btn--primary">Lọc nhật ký</button>
      </form>

      <p className="admin-table-note">Hiển thị {logs.length}/{total} dòng nhật ký trong khoảng thời gian đã chọn.</p>
      <div className="admin-log-list" aria-label="Nhật ký hệ thống">
        {logs.map((log) => (
          <article className={`admin-log-item admin-log-item--${log.severity}`} key={`${log.event_type}-${log.id}`}>
            <div>
              <span className={`admin-status-badge admin-status-badge--${log.severity}`}>
                {AUDIT_SEVERITY_LABELS[log.severity] ?? log.severity}
              </span>
              <strong>{AUDIT_EVENT_LABELS[log.event_type] ?? log.event_type}</strong>
            </div>
            <p>{log.message}</p>
            <small>{formatDateTime(log.created_at)}{log.user_id ? ` · user ${log.user_id}` : ''}</small>
          </article>
        ))}
        {logs.length === 0 && <p className="chart-empty">Chưa có nhật ký trong khoảng thời gian này.</p>}
      </div>
    </Panel>
  );
}

// ─────── System Health Tab ──────────────────────────────────────────────────

const ERROR_SEVERITY_LABELS: Record<ErrorSeverity, string> = {
  info: 'Thông tin',
  warning: 'Cảnh báo',
  critical: 'Nghiêm trọng',
};

function SafeDetails({ details }: { details: Record<string, unknown> }) {
  const rows = Object.entries(details || {});
  if (!rows.length) return <p className="admin-content-muted">Không có chi tiết bổ sung.</p>;
  return (
    <dl className="health-detail-list">
      {rows.map(([key, value]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function ErrorDetailModal({ item, onClose }: { item: ErrorLogItem; onClose: () => void }) {
  return (
    <div className="admin-error-modal-backdrop" role="presentation">
      <section className="admin-error-modal" role="dialog" aria-modal="true" aria-labelledby="error-detail-title">
        <h3 id="error-detail-title">Chi tiết lỗi an toàn</h3>
        <dl className="health-detail-list">
          <div><dt>Error ID</dt><dd>{item.error_id}</dd></div>
          <div><dt>Endpoint</dt><dd>{item.method} {item.endpoint}</dd></div>
          <div><dt>Status</dt><dd>{item.status_code} · {item.error_code}</dd></div>
          <div><dt>Severity</dt><dd>{ERROR_SEVERITY_LABELS[item.severity]}</dd></div>
          <div><dt>Request ID</dt><dd>{item.request_id || '-'}</dd></div>
          <div><dt>User ID</dt><dd>{item.user_id || '-'}</dd></div>
          <div><dt>Duration</dt><dd>{item.duration_ms} ms</dd></div>
          <div><dt>Occurrences</dt><dd>{item.occurrence_count}</dd></div>
        </dl>
        <p>{item.message_safe}</p>
        <div className="panel-actions">
          <button type="button" className="admin-action-btn admin-action-btn--primary" onClick={onClose}>Đóng</button>
        </div>
      </section>
    </div>
  );
}

function SystemHealthTab({ filter }: { filter: DateRangeFilter }) {
  const [state, setState] = useState<PanelState>('loading');
  const [health, setHealth] = useState<BackendHealthResponse | null>(null);
  const [errors, setErrors] = useState<ErrorLogItem[]>([]);
  const [summary, setSummary] = useState<ErrorMonitoringSummary | null>(null);
  const [selectedError, setSelectedError] = useState<ErrorLogItem | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState<ErrorSeverity | 'all'>('all');
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState('loading');
    Promise.all([
      analyticsApi.getBackendHealth(ctrl.signal),
      analyticsApi.getErrorMonitoring({
        ...filter,
        search: search || undefined,
        severity: severity === 'all' ? undefined : severity,
        page: 1,
        page_size: 50,
      }, ctrl.signal),
    ])
      .then(([healthData, errorData]) => {
        setHealth(healthData);
        setErrors(errorData.items);
        setSummary(errorData.summary);
        setState('ok');
      })
      .catch((e) => { if (e?.name !== 'CanceledError') setState('error'); });
  }, [filter, search, severity]);

  useEffect(() => { load(); return () => abortRef.current?.abort(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearch(searchInput.trim());
  };

  return (
    <Panel title="System Health & Error Monitoring" state={state} onRetry={load}>
      {health && summary && (
        <div className="system-health-layout">
          <section className="stat-grid">
            <StatCard label="Trạng thái hệ thống" value={HEALTH_LABELS[health.status] ?? health.status} />
            <StatCard label="Tổng lỗi" value={fmt(summary.total_errors)} />
            <StatCard label="Critical" value={fmt(summary.by_severity.critical || 0)} />
            <StatCard label="Timeout" value={fmt(summary.timeout_count)} />
            <StatCard label="Error rate" value={summary.error_rate == null ? 'Không có dữ liệu' : fmtPct(summary.error_rate)} />
            <StatCard label="P50 / P95 / P99" value={`${fmt(summary.latency.p50_ms, ' ms')} / ${fmt(summary.latency.p95_ms, ' ms')} / ${fmt(summary.latency.p99_ms, ' ms')}`} />
          </section>

          {(health.alerts.length > 0 || summary.warnings.length > 0) && (
            <section className="health-alert-list">
              {[...health.alerts, ...summary.warnings].map((alert) => (
                <div className={`health-alert health-alert--${alert.severity}`} key={`${alert.component}-${alert.message}`}>
                  <strong>{alert.severity}</strong>
                  <span>{alert.message}</span>
                </div>
              ))}
            </section>
          )}

          <section className="health-component-grid">
            {health.components.map((component) => (
              <article className={`health-component health-component--${component.status}`} key={component.name}>
                <div>
                  <strong>{SERVICE_LABELS[component.name] ?? component.name}</strong>
                  <span>{HEALTH_LABELS[component.status] ?? component.status}</span>
                </div>
                <p>{component.message}</p>
                <small>{component.latency_ms ?? '-'} ms · {formatDateTime(component.checked_at)}</small>
                <SafeDetails details={component.details} />
              </article>
            ))}
          </section>

          <section className="admin-panel">
            <div className="panel-heading"><h3 className="panel-title">Lịch sử trạng thái</h3></div>
            <div className="health-history-list">
              {health.history.map((item) => (
                <div className={`health-history-item health-history-item--${item.status}`} key={`${item.checked_at}-${item.status}`}>
                  <span>{HEALTH_LABELS[item.status] ?? item.status}</span>
                  <time dateTime={item.checked_at}>{formatDateTime(item.checked_at)}</time>
                </div>
              ))}
              {health.history.length === 0 && <p className="chart-empty">Chưa có lịch sử health.</p>}
            </div>
          </section>

          <section className="admin-panel">
            <div className="panel-heading"><h3 className="panel-title">Bảng lỗi gần đây</h3></div>
            <form className="admin-filter-grid" onSubmit={submit}>
              <label>
                <span>Tìm kiếm</span>
                <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Endpoint, error code, request ID" />
              </label>
              <label>
                <span>Severity</span>
                <select value={severity} onChange={(event) => setSeverity(event.target.value as ErrorSeverity | 'all')}>
                  <option value="all">Tất cả</option>
                  <option value="warning">Cảnh báo</option>
                  <option value="critical">Nghiêm trọng</option>
                </select>
              </label>
              <button type="submit" className="admin-action-btn admin-action-btn--primary">Lọc</button>
            </form>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr><th>Thời gian</th><th>Endpoint</th><th>Status</th><th>Message</th><th>Latency</th><th></th></tr>
                </thead>
                <tbody>
                  {errors.map((item) => (
                    <tr key={item.error_id}>
                      <td>{formatDateTime(item.timestamp)}</td>
                      <td>{item.method} {item.endpoint}</td>
                      <td><span className={`admin-status-badge admin-status-badge--${item.severity}`}>{item.status_code} · {item.error_code}</span></td>
                      <td>{item.message_safe}</td>
                      <td>{item.duration_ms} ms</td>
                      <td><button type="button" className="admin-action-btn" onClick={() => setSelectedError(item)}>Chi tiết</button></td>
                    </tr>
                  ))}
                  {errors.length === 0 && <tr><td colSpan={6}>Không có lỗi trong khoảng thời gian này.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section className="stat-grid">
            <div className="admin-panel">
              <div className="panel-heading"><h3 className="panel-title">Endpoint lỗi nhiều</h3></div>
              {summary.top_endpoints.map((row) => <p key={row.endpoint}>{row.endpoint}: <strong>{row.count}</strong></p>)}
              {summary.top_endpoints.length === 0 && <p className="chart-empty">Không có dữ liệu</p>}
            </div>
            <div className="admin-panel">
              <div className="panel-heading"><h3 className="panel-title">Model AI lỗi nhiều</h3></div>
              {summary.top_ai_models.map((row) => <p key={`${row.provider}-${row.model}`}>{row.provider}/{row.model}: <strong>{row.count}</strong></p>)}
              {summary.top_ai_models.length === 0 && <p className="chart-empty">Không có dữ liệu</p>}
            </div>
          </section>
        </div>
      )}
      {selectedError && <ErrorDetailModal item={selectedError} onClose={() => setSelectedError(null)} />}
    </Panel>
  );
}

// ─────── Main Dashboard Page ──────────────────────────────────────────────────

type Tab = 'overview' | 'usage' | 'quality' | 'errors' | 'health' | 'users' | 'audit' | 'evaluation';
type Preset = 'today' | '7d' | '30d' | 'custom';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: '📊 Tổng quan' },
  { id: 'usage', label: '⚡ Mức sử dụng' },
  { id: 'quality', label: '⭐ Chất lượng AI' },
  { id: 'errors', label: '🔥 Lỗi & Độ trễ' },
  { id: 'health', label: '🫀 System Health' },
  { id: 'users', label: '👥 Quản lý người dùng' },
  { id: 'audit', label: '🧾 Nhật ký hệ thống' },
  { id: 'evaluation', label: '🔬 RAG Benchmark' },
];

export default function AdminDashboardPage() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [preset, setPreset] = useState<Preset>('7d');
  const [filter, setFilter] = useState<DateRangeFilter>(daysAgoRange(7));
  const [customFrom, setCustomFrom] = useState(toDateInputValue(daysAgoRange(7).from_date));
  const [customTo, setCustomTo] = useState(toDateInputValue(daysAgoRange(7).to_date));

  const applyPreset = (p: Preset) => {
    setPreset(p);
    let nextFilter: DateRangeFilter | null = null;
    if (p === 'today') nextFilter = todayRange();
    else if (p === '7d') nextFilter = daysAgoRange(7);
    else if (p === '30d') nextFilter = daysAgoRange(30);
    // 'custom' handled separately
    if (nextFilter) {
      setFilter(nextFilter);
      setCustomFrom(toDateInputValue(nextFilter.from_date));
      setCustomTo(toDateInputValue(nextFilter.to_date));
    }
  };

  const applyCustomRange = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!customFrom || !customTo) return;
    const fromIso = dateInputToIso(customFrom);
    const toIso = dateInputToIso(customTo, true);
    setPreset('custom');
    setFilter({
      from_date: fromIso,
      to_date: toIso,
      timezone: 'Asia/Ho_Chi_Minh',
      bucket: pickBucket(fromIso, toIso),
    });
  };

  return (
    <div className="admin-dashboard">
      <header className="admin-header">
        <h1>Dashboard Quản trị</h1>
        <p className="admin-subtitle">Thống kê hoạt động và chất lượng AI — chỉ dành cho quản trị viên</p>
      </header>

      <BackendConnectionPanel />

      {/* Date Preset Controls */}
      <form className="preset-bar" onSubmit={applyCustomRange} aria-label="Bộ lọc thời gian">
        <div className="preset-shortcuts" role="group" aria-label="Khoảng thời gian nhanh">
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
        <div className="custom-range">
          <label>
            <span>Từ ngày</span>
            <input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} />
          </label>
          <label>
            <span>Đến ngày</span>
            <input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} />
          </label>
          <button type="submit" className={`preset-btn${preset === 'custom' ? ' preset-btn--active' : ''}`}>
            Áp dụng
          </button>
        </div>
      </form>

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
        {activeTab === 'health' && <SystemHealthTab filter={filter} />}
        {activeTab === 'users' && <UserManagementTab />}
        {activeTab === 'audit' && <AuditLogsTab filter={filter} />}
        {activeTab === 'evaluation' && <EvaluationTab />}
      </main>
    </div>
  );
}
