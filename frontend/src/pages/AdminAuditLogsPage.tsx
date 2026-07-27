import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { adminAuditLogsApi } from '../api/adminAuditLogsApi';
import type {
  AdminAuditLogItem,
  AdminAuditLogListParams,
  AdminAuditLogListResponse,
  AdminAuditLogStatisticsResponse,
  AdminAuditResult,
} from '../types/adminAuditLogs';
import { ADMIN_AUDIT_ACTIONS } from '../types/adminAuditLogs';
import {
  adminAuditActionLabel,
  adminAuditResultLabel,
  formatAuditValue,
} from '../utils/adminAuditLogsUi';
import './AdminAuditLogsPage.css';

type LoadState = 'loading' | 'error' | 'ok';

function fmtNumber(value: number | undefined) {
  return (value ?? 0).toLocaleString('vi-VN');
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return 'Không có dữ liệu';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'medium', hour12: false });
}

function toIsoDateStart(value: string) {
  return value ? new Date(`${value}T00:00:00+07:00`).toISOString() : undefined;
}

function toIsoDateEnd(value: string) {
  return value ? new Date(`${value}T23:59:59.999+07:00`).toISOString() : undefined;
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="audit-stat">
      <span>{label}</span>
      <strong>{fmtNumber(value)}</strong>
    </div>
  );
}

function AuditDiffModal({ item, onClose }: { item: AdminAuditLogItem; onClose: () => void }) {
  const rows = useMemo(() => {
    const before = item.before || {};
    const after = item.after || {};
    const keys = item.changed_fields.length
      ? item.changed_fields
      : Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
    return keys.map((field) => ({
      field,
      before: formatAuditValue(before[field]),
      after: formatAuditValue(after[field]),
    }));
  }, [item]);

  return (
    <div className="audit-modal-backdrop" role="presentation">
      <section className="audit-modal" role="dialog" aria-modal="true" aria-labelledby="audit-detail-title">
        <h3 id="audit-detail-title">Before / After</h3>
        <dl className="audit-detail-kv">
          <div><dt>Admin</dt><dd>{item.admin_email_snapshot}</dd></div>
          <div><dt>Action</dt><dd>{adminAuditActionLabel(item.action)}</dd></div>
          <div><dt>Target</dt><dd>{item.target_type} · {item.target_id}</dd></div>
          <div><dt>Result</dt><dd>{adminAuditResultLabel(item.result)}</dd></div>
          <div><dt>Reason</dt><dd>{item.reason || '-'}</dd></div>
          <div><dt>Request ID</dt><dd>{item.request_id || '-'}</dd></div>
          <div><dt>IP hash</dt><dd>{item.ip_hash || '-'}</dd></div>
          <div><dt>User agent</dt><dd>{item.user_agent_summary || '-'}</dd></div>
        </dl>

        {rows.length > 0 ? (
          <div className="audit-diff-wrap">
            <table className="audit-diff-table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Before</th>
                  <th>After</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.field}>
                    <td>{row.field}</td>
                    <td>{row.before}</td>
                    <td>{row.after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="audit-empty-small">Không có thay đổi before/after được ghi nhận.</p>
        )}

        <div className="audit-modal-actions">
          <button type="button" className="admin-action-btn admin-action-btn--primary" onClick={onClose}>Đóng</button>
        </div>
      </section>
    </div>
  );
}

export default function AdminAuditLogsPage() {
  const [state, setState] = useState<LoadState>('loading');
  const [stats, setStats] = useState<AdminAuditLogStatisticsResponse | null>(null);
  const [list, setList] = useState<AdminAuditLogListResponse | null>(null);
  const [selected, setSelected] = useState<AdminAuditLogItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    search: '',
    admin_user_id: '',
    action: 'all',
    target_type: '',
    target_id: '',
    result: 'all',
    date_from: '',
    date_to: '',
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const pageSize = 30;

  const load = useCallback(() => {
    const ctrl = new AbortController();
    setState('loading');
    setError(null);
    const params: AdminAuditLogListParams = {
      page,
      page_size: pageSize,
      search: appliedFilters.search.trim() || undefined,
      admin_user_id: appliedFilters.admin_user_id.trim() || undefined,
      action: appliedFilters.action === 'all' ? undefined : appliedFilters.action,
      target_type: appliedFilters.target_type.trim() || undefined,
      target_id: appliedFilters.target_id.trim() || undefined,
      result: appliedFilters.result === 'all' ? undefined : appliedFilters.result,
      date_from: toIsoDateStart(appliedFilters.date_from),
      date_to: toIsoDateEnd(appliedFilters.date_to),
    };
    Promise.all([
      adminAuditLogsApi.statistics({}, ctrl.signal),
      adminAuditLogsApi.list(params, ctrl.signal),
    ])
      .then(([statsData, listData]) => {
        setStats(statsData);
        setList(listData);
        setState('ok');
      })
      .catch((err) => {
        if (err?.name === 'CanceledError') return;
        setState('error');
        setError('Không thể tải nhật ký quản trị.');
      });
    return () => ctrl.abort();
  }, [appliedFilters, page]);

  useEffect(() => {
    queueMicrotask(() => load());
  }, [load]);

  const submitFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setAppliedFilters(filters);
  };

  return (
    <div className="audit-page">
      <header className="admin-header">
        <h1>Nhật ký quản trị</h1>
        <p className="admin-subtitle">Theo dõi thao tác quản trị có ảnh hưởng dữ liệu hoặc cấu hình.</p>
      </header>

      {stats && (
        <section className="audit-stat-grid" aria-label="Thống kê admin audit logs">
          <StatCard label="Tổng audit" value={stats.total} />
          <StatCard label="Thành công" value={stats.success_count} />
          <StatCard label="Thất bại" value={stats.failure_count} />
          <StatCard label="Loại hành động" value={Object.keys(stats.by_action).length} />
          <StatCard label="Loại đối tượng" value={Object.keys(stats.by_target_type).length} />
        </section>
      )}

      <section className="audit-panel">
        <form className="audit-filters" onSubmit={submitFilters}>
          <label>
            <span>Tìm kiếm</span>
            <input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Admin, action, target, reason" />
          </label>
          <label>
            <span>Admin ID</span>
            <input value={filters.admin_user_id} onChange={(event) => setFilters({ ...filters, admin_user_id: event.target.value })} />
          </label>
          <label>
            <span>Action</span>
            <select value={filters.action} onChange={(event) => setFilters({ ...filters, action: event.target.value })}>
              <option value="all">Tất cả</option>
              {ADMIN_AUDIT_ACTIONS.map((action) => <option key={action} value={action}>{adminAuditActionLabel(action)}</option>)}
            </select>
          </label>
          <label>
            <span>Target type</span>
            <input value={filters.target_type} onChange={(event) => setFilters({ ...filters, target_type: event.target.value })} placeholder="user, document..." />
          </label>
          <label>
            <span>Target ID</span>
            <input value={filters.target_id} onChange={(event) => setFilters({ ...filters, target_id: event.target.value })} />
          </label>
          <label>
            <span>Kết quả</span>
            <select value={filters.result} onChange={(event) => setFilters({ ...filters, result: event.target.value })}>
              <option value="all">Tất cả</option>
              {(['success', 'failure'] as AdminAuditResult[]).map((item) => <option key={item} value={item}>{adminAuditResultLabel(item)}</option>)}
            </select>
          </label>
          <label>
            <span>Từ ngày</span>
            <input type="date" value={filters.date_from} onChange={(event) => setFilters({ ...filters, date_from: event.target.value })} />
          </label>
          <label>
            <span>Đến ngày</span>
            <input type="date" value={filters.date_to} onChange={(event) => setFilters({ ...filters, date_to: event.target.value })} />
          </label>
          <button type="submit" className="admin-action-btn admin-action-btn--primary">Lọc</button>
        </form>

        {error && <div className="panel-error" role="alert">{error}</div>}
        {state === 'loading' && <p className="panel-loading">Đang tải nhật ký quản trị...</p>}
        {state === 'error' && <div className="audit-empty"><strong>Không tải được dữ liệu</strong><p>Vui lòng kiểm tra quyền hoặc thử lại.</p></div>}
        {state === 'ok' && list && list.items.length === 0 && (
          <div className="audit-empty"><strong>Chưa có audit phù hợp</strong><p>Thử thay đổi bộ lọc hoặc khoảng thời gian.</p></div>
        )}

        {state === 'ok' && list && list.items.length > 0 && (
          <>
            <div className="audit-table-wrap">
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>Admin</th>
                    <th>Hành động</th>
                    <th>Đối tượng</th>
                    <th>Kết quả</th>
                    <th>Lý do</th>
                    <th>Before/After</th>
                  </tr>
                </thead>
                <tbody>
                  {list.items.map((item) => (
                    <tr key={item.id}>
                      <td data-label="Thời gian">{fmtDateTime(item.timestamp)}</td>
                      <td data-label="Admin">{item.admin_email_snapshot}<small>{item.admin_user_id}</small></td>
                      <td data-label="Hành động">{adminAuditActionLabel(item.action)}</td>
                      <td data-label="Đối tượng">{item.target_type}<small>{item.target_id}</small></td>
                      <td data-label="Kết quả">
                        <span className={`audit-result audit-result--${item.result}`}>{adminAuditResultLabel(item.result)}</span>
                      </td>
                      <td data-label="Lý do">{item.reason || '-'}</td>
                      <td data-label="Before/After">
                        <button type="button" className="admin-action-btn" onClick={() => setSelected(item)}>Xem</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="audit-pagination">
              <span>Trang {list.page}/{Math.max(list.total_pages, 1)} · {fmtNumber(list.total)} audit</span>
              <div>
                <button type="button" className="admin-action-btn" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Trước</button>
                <button type="button" className="admin-action-btn" disabled={page >= list.total_pages} onClick={() => setPage((value) => value + 1)}>Sau</button>
              </div>
            </div>
          </>
        )}
      </section>

      {selected && <AuditDiffModal item={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
