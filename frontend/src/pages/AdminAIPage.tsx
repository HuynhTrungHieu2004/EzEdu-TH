import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminAiApi } from '../api/adminAiApi';
import type { AIQuotaHistoryResponse, AIQuotaView, AIUsageDashboardResponse, AIUsageFilters, AIUsageStatus } from '../types/adminAi';
import { Badge, EmptyState, Pagination, dateEnd, dateStart, fmtDateTime, fmtNumber, renderObjectRows } from './AdminContentShared';
import { apiErrorMessage, isCanceledError } from '../utils/apiError';
import './AdminContentPages.css';

function money(value: number | null | undefined, currency = 'USD') {
  return `${(value ?? 0).toLocaleString('vi-VN', { maximumFractionDigits: 6 })} ${currency}`;
}

function ms(value: number | null | undefined) {
  return value == null ? 'Không có dữ liệu' : `${fmtNumber(Math.round(value))} ms`;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="admin-content-kv">
      <span>{label}</span>
      <strong>{value}</strong>
      {sub && <small className="admin-content-muted">{sub}</small>}
    </div>
  );
}

export default function AdminAIPage() {
  const [data, setData] = useState<AIUsageDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [userId, setUserId] = useState('');
  const [provider, setProvider] = useState('');
  const [model, setModel] = useState('');
  const [feature, setFeature] = useState('');
  const [status, setStatus] = useState('');
  const [quotaUserId, setQuotaUserId] = useState('');
  const [quota, setQuota] = useState<AIQuotaView | null>(null);
  const [quotaJson, setQuotaJson] = useState('{}');
  const [quotaReason, setQuotaReason] = useState('');
  const [quotaHistory, setQuotaHistory] = useState<AIQuotaHistoryResponse | null>(null);
  const [quotaError, setQuotaError] = useState('');
  const [busy, setBusy] = useState(false);
  const [roleDefaults, setRoleDefaults] = useState<Record<string, Record<string, number>>>({});
  const [roleDefaultsError, setRoleDefaultsError] = useState('');
  const [editingRole, setEditingRole] = useState('');
  const [roleQuotaJson, setRoleQuotaJson] = useState('{}');
  const [roleQuotaReason, setRoleQuotaReason] = useState('');

  const params = useMemo<AIUsageFilters>(() => ({
    page,
    page_size: 30,
    from_date: dateStart(from),
    to_date: dateEnd(to),
    user_id: userId || undefined,
    provider: provider || undefined,
    model: model || undefined,
    feature: feature || undefined,
    status: status ? status as AIUsageStatus : undefined,
  }), [feature, from, model, page, provider, status, to, userId]);

  const loadUsage = useCallback((signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    adminAiApi.usage(params, signal)
      .then(setData)
      .catch((err) => {
        if (!isCanceledError(err)) setError(apiErrorMessage(err, 'Không tải được AI usage.'));
      })
      .finally(() => setLoading(false));
  }, [params]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => loadUsage(controller.signal));
    return () => controller.abort();
  }, [loadUsage]);

  const loadRoleDefaults = useCallback((signal?: AbortSignal) => {
    adminAiApi.quotaDefaults(signal)
      .then((result) => setRoleDefaults(result.items))
      .catch((err) => {
        if (!isCanceledError(err)) setRoleDefaultsError(apiErrorMessage(err, 'Không tải được quota mặc định theo role.'));
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => loadRoleDefaults(controller.signal));
    return () => controller.abort();
  }, [loadRoleDefaults]);

  const startEditRoleDefault = (role: string) => {
    setEditingRole(role);
    setRoleQuotaJson(JSON.stringify(roleDefaults[role] || {}, null, 2));
    setRoleQuotaReason('');
    setRoleDefaultsError('');
  };

  const saveRoleDefault = async () => {
    if (!editingRole || !roleQuotaReason.trim()) return;
    setBusy(true);
    setRoleDefaultsError('');
    try {
      const parsed = JSON.parse(roleQuotaJson) as Record<string, number>;
      const result = await adminAiApi.updateQuotaDefaults(editingRole, parsed, roleQuotaReason);
      setRoleDefaults((prev) => ({ ...prev, [result.role]: result.quota }));
      setEditingRole('');
      setRoleQuotaReason('');
    } catch (err: unknown) {
      setRoleDefaultsError(apiErrorMessage(err, 'Không lưu được quota mặc định.'));
    } finally {
      setBusy(false);
    }
  };

  const loadQuota = async () => {
    if (!quotaUserId.trim()) return;
    setQuotaError('');
    setBusy(true);
    try {
      const result = await adminAiApi.quota(quotaUserId.trim());
      setQuota(result);
      setQuotaJson(JSON.stringify(result.override_quota || {}, null, 2));
      setQuotaHistory(await adminAiApi.quotaHistory(quotaUserId.trim()));
    } catch (err: unknown) {
      setQuotaError(apiErrorMessage(err, 'Không tải được quota user.'));
    } finally {
      setBusy(false);
    }
  };

  const saveQuota = async () => {
    if (!quota || !quotaReason.trim()) return;
    setQuotaError('');
    setBusy(true);
    try {
      const parsed = JSON.parse(quotaJson) as Record<string, unknown>;
      const result = await adminAiApi.updateQuota(quota.user_id, parsed, quotaReason);
      setQuota(result.quota);
      setQuotaJson(JSON.stringify(result.quota.override_quota || {}, null, 2));
      setQuotaReason('');
      setQuotaHistory(await adminAiApi.quotaHistory(quota.user_id));
    } catch (err: unknown) {
      setQuotaError(apiErrorMessage(err, 'Không lưu được quota.'));
    } finally {
      setBusy(false);
    }
  };

  const resetQuota = async () => {
    if (!quota || !quotaReason.trim()) return;
    setQuotaError('');
    setBusy(true);
    try {
      const result = await adminAiApi.resetQuota(quota.user_id, quotaReason);
      setQuota(result.quota);
      setQuotaJson(JSON.stringify(result.quota.override_quota || {}, null, 2));
      setQuotaReason('');
      setQuotaHistory(await adminAiApi.quotaHistory(quota.user_id));
    } catch (err: unknown) {
      setQuotaError(apiErrorMessage(err, 'Không reset được quota.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="admin-content-page">
      <header className="admin-content-header">
        <div>
          <h1>Quản lý AI</h1>
          <p>Theo dõi request, token, quota, lỗi, latency và chi phí ước tính. Không hiển thị API key.</p>
        </div>
      </header>

      <section className="admin-content-toolbar">
        <label className="admin-content-field"><span>Từ ngày</span><input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} /></label>
        <label className="admin-content-field"><span>Đến ngày</span><input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} /></label>
        <label className="admin-content-field"><span>User ID</span><input value={userId} onChange={(event) => { setUserId(event.target.value); setPage(1); }} /></label>
        <label className="admin-content-field"><span>Provider</span><input value={provider} onChange={(event) => { setProvider(event.target.value); setPage(1); }} placeholder="google, groq, mixed" /></label>
        <label className="admin-content-field"><span>Model</span><input value={model} onChange={(event) => { setModel(event.target.value); setPage(1); }} /></label>
        <label className="admin-content-field"><span>Feature</span><input value={feature} onChange={(event) => { setFeature(event.target.value); setPage(1); }} placeholder="advanced_chat..." /></label>
        <label className="admin-content-field"><span>Status</span><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">Tất cả</option><option value="success">Success</option><option value="failure">Failure</option></select></label>
      </section>

      {error && <EmptyState title="Có lỗi" text={error} />}
      {loading && <EmptyState title="Đang tải" text="Đang lấy dữ liệu AI usage từ backend." />}

      {!loading && data && (
        <>
          <section className="admin-content-detail">
            <div className="admin-content-detail-grid">
              <Stat label="Tổng request" value={fmtNumber(data.summary.total_requests)} />
              <Stat label="Thành công" value={fmtNumber(data.summary.success_requests)} />
              <Stat label="Thất bại" value={fmtNumber(data.summary.failed_requests)} />
              <Stat label="Tổng token" value={fmtNumber(data.summary.total_tokens)} sub={`Input ${fmtNumber(data.summary.input_tokens)} · Output ${fmtNumber(data.summary.output_tokens)}`} />
              <Stat label="Chi phí ước tính" value={money(data.summary.estimated_cost, data.summary.currency)} sub="Không phải hóa đơn chính thức" />
              <Stat label="Độ trễ TB" value={ms(data.summary.avg_latency_ms)} />
              <Stat label="P50 / P95 / P99" value={`${ms(data.summary.p50_latency_ms)} / ${ms(data.summary.p95_latency_ms)} / ${ms(data.summary.p99_latency_ms)}`} />
            </div>
          </section>

          {data.warnings.length > 0 && (
            <section className="admin-content-panel">
              <h2>Cảnh báo</h2>
              <div className="admin-content-actions">
                {data.warnings.map((item) => <Badge key={`${item.type}-${item.message}`} tone={item.severity === 'critical' ? 'danger' : item.severity === 'info' ? 'info' : 'danger'}>{item.message}</Badge>)}
              </div>
            </section>
          )}

          <section className="admin-content-detail-grid">
            <div className="admin-content-panel">
              <h2>User dùng nhiều</h2>
              {data.top_users.length ? renderObjectRows(Object.fromEntries(data.top_users.map((row) => [row.label || row.key, `${fmtNumber(row.request_count)} req · ${fmtNumber(row.total_tokens)} token`])) as Record<string, unknown>) : <p className="admin-content-muted">Không có dữ liệu</p>}
            </div>
            <div className="admin-content-panel">
              <h2>Model dùng nhiều</h2>
              {data.top_models.length ? renderObjectRows(Object.fromEntries(data.top_models.map((row) => [row.key, `${fmtNumber(row.request_count)} req · ${money(row.estimated_cost)}`])) as Record<string, unknown>) : <p className="admin-content-muted">Không có dữ liệu</p>}
            </div>
            <div className="admin-content-panel">
              <h2>Feature tốn token</h2>
              {data.top_features.length ? renderObjectRows(Object.fromEntries(data.top_features.map((row) => [row.key, `${fmtNumber(row.total_tokens)} token · ${fmtNumber(row.request_count)} req`])) as Record<string, unknown>) : <p className="admin-content-muted">Không có dữ liệu</p>}
            </div>
          </section>

          <div className="admin-content-table-wrap">
            <table className="admin-content-table">
              <thead><tr><th>Thời gian</th><th>User</th><th>Feature</th><th>Provider/model</th><th>Token</th><th>Cost</th><th>Latency</th><th>Status</th><th>Request</th></tr></thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td data-label="Thời gian">{fmtDateTime(item.created_at)}</td>
                    <td data-label="User">{item.user_email || item.user_id}</td>
                    <td data-label="Feature">{item.feature}</td>
                    <td data-label="Provider/model">{item.provider}<br /><span className="admin-content-muted">{item.model}</span></td>
                    <td data-label="Token">{fmtNumber(item.total_tokens)}<br /><span className="admin-content-muted">In {fmtNumber(item.input_tokens)} · Out {fmtNumber(item.output_tokens)}</span></td>
                    <td data-label="Cost">{money(item.estimated_cost, item.currency)}</td>
                    <td data-label="Latency">{ms(item.latency_ms)}</td>
                    <td data-label="Status"><Badge tone={item.status === 'success' ? 'ok' : 'danger'}>{item.status}{item.error_code ? ` · ${item.error_code}` : ''}</Badge></td>
                    <td data-label="Request">{item.request_id || 'Không có dữ liệu'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} totalPages={data.total_pages} total={data.total} onPage={setPage} />
        </>
      )}

      <section className="admin-content-panel">
        <h2>Quota mặc định theo role</h2>
        <p className="admin-content-muted">Áp dụng ngay không cần khởi động lại server, ghi đè lên giá trị mặc định trong code.</p>
        {roleDefaultsError && <p className="admin-content-muted">{roleDefaultsError}</p>}
        <div className="admin-content-detail-grid">
          {Object.keys(roleDefaults).sort().map((role) => (
            <div key={role} className="admin-content-panel">
              <h3>{role}</h3>
              {editingRole === role ? (
                <>
                  <label className="admin-content-field"><span>Quota JSON</span><textarea rows={8} value={roleQuotaJson} onChange={(event) => setRoleQuotaJson(event.target.value)} /></label>
                  <label className="admin-content-field"><span>Lý do</span><textarea rows={3} value={roleQuotaReason} onChange={(event) => setRoleQuotaReason(event.target.value)} /></label>
                  <div className="admin-content-actions">
                    <button type="button" className="admin-content-btn" disabled={busy || !roleQuotaReason.trim()} onClick={saveRoleDefault}>Lưu</button>
                    <button type="button" className="admin-content-btn" disabled={busy} onClick={() => setEditingRole('')}>Huỷ</button>
                  </div>
                </>
              ) : (
                <>
                  {renderObjectRows(roleDefaults[role])}
                  <button type="button" className="admin-content-btn" onClick={() => startEditRoleDefault(role)}>Sửa</button>
                </>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="admin-content-panel">
        <h2>Quota theo user</h2>
        <div className="admin-content-actions">
          <label className="admin-content-field" style={{ minWidth: 280 }}><span>User ID</span><input value={quotaUserId} onChange={(event) => setQuotaUserId(event.target.value)} /></label>
          <button type="button" className="admin-content-btn" disabled={busy || !quotaUserId.trim()} onClick={loadQuota}>Xem quota</button>
        </div>
        {quotaError && <p className="admin-content-muted">{quotaError}</p>}
        {quota && (
          <div className="admin-content-detail-grid" style={{ marginTop: 14 }}>
            <div className="admin-content-panel"><h3>Usage hiện tại</h3>{renderObjectRows(quota.usage)}</div>
            <div className="admin-content-panel"><h3>Quota hiệu lực</h3>{renderObjectRows(quota.effective_quota)}</div>
            <div className="admin-content-panel">
              <h3>Override</h3>
              <label className="admin-content-field"><span>Quota JSON</span><textarea rows={8} value={quotaJson} onChange={(event) => setQuotaJson(event.target.value)} /></label>
              <label className="admin-content-field"><span>Lý do</span><textarea rows={3} value={quotaReason} onChange={(event) => setQuotaReason(event.target.value)} /></label>
              <div className="admin-content-actions">
                <button type="button" className="admin-content-btn" disabled={busy || !quotaReason.trim()} onClick={saveQuota}>Lưu quota</button>
                <button type="button" className="admin-content-btn admin-content-btn--danger" disabled={busy || !quotaReason.trim()} onClick={resetQuota}>Reset quota</button>
              </div>
            </div>
          </div>
        )}
        {quotaHistory && quotaHistory.items.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <h3>Lịch sử đổi quota</h3>
            {renderObjectRows(Object.fromEntries(quotaHistory.items.map((item) => [fmtDateTime(item.timestamp), `${item.admin_email_snapshot} · ${item.reason || 'Không có lý do'}`])) as Record<string, unknown>)}
          </div>
        )}
      </section>
    </main>
  );
}
