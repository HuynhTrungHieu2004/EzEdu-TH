import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { activityLogsApi } from '../api/activityLogsApi';
import type {
  ActivityLogListParams,
  ActivityStatus,
  UserActivityLogItem,
  UserActivityLogListResponse,
  UserActivityLogStatisticsResponse,
} from '../types/activityLogs';
import { ACTIVITY_ACTIONS, ACTIVITY_CATEGORIES } from '../types/activityLogs';
import {
  activityActionLabel,
  activityCategoryLabel,
  activityStatusLabel,
  hasPrivateMetadataKey,
} from '../utils/activityLogsUi';
import './AdminActivityLogsPage.css';

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
    <div className="activity-stat">
      <span>{label}</span>
      <strong>{fmtNumber(value)}</strong>
    </div>
  );
}

function ActivityDetailModal({ item, onClose }: { item: UserActivityLogItem; onClose: () => void }) {
  const metadataText = JSON.stringify(item.metadata || {}, null, 2);
  return (
    <div className="activity-modal-backdrop" role="presentation">
      <section className="activity-modal" role="dialog" aria-modal="true" aria-labelledby="activity-detail-title">
        <h3 id="activity-detail-title">Chi tiết hoạt động</h3>
        <dl className="activity-detail-kv">
          <div><dt>Action</dt><dd>{activityActionLabel(item.action)}</dd></div>
          <div><dt>Category</dt><dd>{activityCategoryLabel(item.category)}</dd></div>
          <div><dt>Status</dt><dd>{activityStatusLabel(item.status)}</dd></div>
          <div><dt>User ID</dt><dd>{item.user_id || 'Không có'}</dd></div>
          <div><dt>Resource</dt><dd>{item.resource_type || '-'} · {item.resource_id || '-'}</dd></div>
          <div><dt>Request ID</dt><dd>{item.request_id || '-'}</dd></div>
          <div><dt>IP hash</dt><dd>{item.ip_hash || '-'}</dd></div>
          <div><dt>User agent</dt><dd>{item.user_agent_summary || '-'}</dd></div>
          <div><dt>Duration</dt><dd>{item.duration_ms == null ? '-' : `${item.duration_ms} ms`}</dd></div>
          <div><dt>Error</dt><dd>{item.error_code || '-'}</dd></div>
        </dl>
        {hasPrivateMetadataKey(item.metadata || {}) && (
          <p className="activity-warning">Metadata có key nhạy cảm. Cần kiểm tra backend sanitizer.</p>
        )}
        <pre className="activity-json">{metadataText}</pre>
        <div className="activity-modal-actions">
          <button type="button" className="admin-action-btn admin-action-btn--primary" onClick={onClose}>Đóng</button>
        </div>
      </section>
    </div>
  );
}

export default function AdminActivityLogsPage() {
  const [state, setState] = useState<LoadState>('loading');
  const [stats, setStats] = useState<UserActivityLogStatisticsResponse | null>(null);
  const [list, setList] = useState<UserActivityLogListResponse | null>(null);
  const [selected, setSelected] = useState<UserActivityLogItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    search: '',
    user_id: '',
    category: 'all',
    action: 'all',
    status: 'all',
    date_from: '',
    date_to: '',
    resource_type: '',
    resource_id: '',
    error_only: false,
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const pageSize = 30;

  const load = useCallback(() => {
    const ctrl = new AbortController();
    setState('loading');
    setError(null);
    const params: ActivityLogListParams = {
      page,
      page_size: pageSize,
      search: appliedFilters.search.trim() || undefined,
      user_id: appliedFilters.user_id.trim() || undefined,
      category: appliedFilters.category === 'all' ? undefined : appliedFilters.category,
      action: appliedFilters.action === 'all' ? undefined : appliedFilters.action,
      status: appliedFilters.status === 'all' ? undefined : appliedFilters.status,
      date_from: toIsoDateStart(appliedFilters.date_from),
      date_to: toIsoDateEnd(appliedFilters.date_to),
      resource_type: appliedFilters.resource_type.trim() || undefined,
      resource_id: appliedFilters.resource_id.trim() || undefined,
      error_only: appliedFilters.error_only || undefined,
    };

    Promise.all([
      activityLogsApi.statistics({}, ctrl.signal),
      activityLogsApi.list(params, ctrl.signal),
    ])
      .then(([statsData, listData]) => {
        setStats(statsData);
        setList(listData);
        setState('ok');
      })
      .catch((err) => {
        if (err?.name === 'CanceledError') return;
        setState('error');
        setError('Không thể tải nhật ký hoạt động.');
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
    <div className="activity-page">
      <header className="admin-header">
        <h1>Nhật ký hoạt động</h1>
        <p className="admin-subtitle">Theo dõi hoạt động quan trọng mà không lưu nội dung riêng tư.</p>
      </header>

      {stats && (
        <section className="activity-stat-grid" aria-label="Thống kê activity logs">
          <StatCard label="Tổng hoạt động hôm nay" value={stats.total_today} />
          <StatCard label="Thành công" value={stats.success_count} />
          <StatCard label="Thất bại" value={stats.failure_count} />
          <StatCard label="Permission denied" value={stats.permission_denied_count} />
          <StatCard label="Quota exceeded" value={stats.quota_exceeded_count} />
        </section>
      )}

      <section className="activity-panel">
        <form className="activity-filters" onSubmit={submitFilters}>
          <label>
            <span>Tìm kiếm</span>
            <input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Action, resource, request ID" />
          </label>
          <label>
            <span>User ID</span>
            <input value={filters.user_id} onChange={(event) => setFilters({ ...filters, user_id: event.target.value })} placeholder="ObjectId hoặc user id" />
          </label>
          <label>
            <span>Category</span>
            <select value={filters.category} onChange={(event) => setFilters({ ...filters, category: event.target.value })}>
              <option value="all">Tất cả</option>
              {ACTIVITY_CATEGORIES.map((item) => <option key={item} value={item}>{activityCategoryLabel(item)}</option>)}
            </select>
          </label>
          <label>
            <span>Action</span>
            <select value={filters.action} onChange={(event) => setFilters({ ...filters, action: event.target.value })}>
              <option value="all">Tất cả</option>
              {ACTIVITY_ACTIONS.map((item) => <option key={item} value={item}>{activityActionLabel(item)}</option>)}
            </select>
          </label>
          <label>
            <span>Status</span>
            <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
              <option value="all">Tất cả</option>
              {(['success', 'failure', 'started', 'denied'] as ActivityStatus[]).map((item) => (
                <option key={item} value={item}>{activityStatusLabel(item)}</option>
              ))}
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
          <label>
            <span>Resource type</span>
            <input value={filters.resource_type} onChange={(event) => setFilters({ ...filters, resource_type: event.target.value })} placeholder="document, question_set..." />
          </label>
          <label>
            <span>Resource ID</span>
            <input value={filters.resource_id} onChange={(event) => setFilters({ ...filters, resource_id: event.target.value })} />
          </label>
          <label className="activity-check">
            <input type="checkbox" checked={filters.error_only} onChange={(event) => setFilters({ ...filters, error_only: event.target.checked })} />
            <span>Chỉ lỗi</span>
          </label>
          <button type="submit" className="admin-action-btn admin-action-btn--primary">Lọc</button>
        </form>

        {error && <div className="panel-error" role="alert">{error}</div>}
        {state === 'loading' && <p className="panel-loading">Đang tải nhật ký...</p>}
        {state === 'error' && <div className="activity-empty"><strong>Không tải được dữ liệu</strong><p>Vui lòng kiểm tra quyền hoặc thử lại.</p></div>}
        {state === 'ok' && list && list.items.length === 0 && (
          <div className="activity-empty"><strong>Chưa có hoạt động phù hợp</strong><p>Thử thay đổi bộ lọc hoặc khoảng thời gian.</p></div>
        )}

        {state === 'ok' && list && list.items.length > 0 && (
          <>
            <div className="activity-table-wrap">
              <table className="activity-table">
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>User</th>
                    <th>Action</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th>Resource</th>
                    <th>Duration</th>
                    <th>Error</th>
                    <th>Chi tiết</th>
                  </tr>
                </thead>
                <tbody>
                  {list.items.map((item) => (
                    <tr key={item.id}>
                      <td data-label="Thời gian">{fmtDateTime(item.timestamp)}</td>
                      <td data-label="User"><span className="activity-mono">{item.user_id || '-'}</span></td>
                      <td data-label="Action">{activityActionLabel(item.action)}</td>
                      <td data-label="Category">{activityCategoryLabel(item.category)}</td>
                      <td data-label="Status">
                        <span className={`activity-status activity-status--${item.status}`}>{activityStatusLabel(item.status)}</span>
                      </td>
                      <td data-label="Resource">{item.resource_type || '-'}<small>{item.resource_id || ''}</small></td>
                      <td data-label="Duration">{item.duration_ms == null ? '-' : `${item.duration_ms} ms`}</td>
                      <td data-label="Error">{item.error_code || '-'}</td>
                      <td data-label="Chi tiết">
                        <button type="button" className="admin-action-btn" onClick={() => setSelected(item)}>Xem</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="activity-pagination">
              <span>Trang {list.page}/{Math.max(list.total_pages, 1)} · {fmtNumber(list.total)} hoạt động</span>
              <div>
                <button type="button" className="admin-action-btn" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Trước</button>
                <button type="button" className="admin-action-btn" disabled={page >= list.total_pages} onClick={() => setPage((value) => value + 1)}>Sau</button>
              </div>
            </div>
          </>
        )}
      </section>

      {selected && <ActivityDetailModal item={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
