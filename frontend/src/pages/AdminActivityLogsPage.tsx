import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { activityLogsApi } from '../api/activityLogsApi';
import type {
  ActivityLogListParams,
  ActivityStatus,
  UserActivityLogItem,
  UserActivityLogListResponse,
  UserActivityLogStatisticsResponse,
  UserBehaviorGroupsResponse,
} from '../types/activityLogs';
import { ACTIVITY_ACTIONS, ACTIVITY_CATEGORIES } from '../types/activityLogs';
import {
  activityActionLabel,
  activityCategoryLabel,
  activityStatusLabel,
  hasPrivateMetadataKey,
} from '../utils/activityLogsUi';
import {
  Alert,
  Badge,
  Button,
  Card, CardBody, CardHeader, CardTitle,
  Checkbox,
  DataTable,
  Dialog,
  EmptyState,
  ErrorState,
  FilterBar,
  FormField,
  Input,
  PageHeader,
  Pagination,
  Select,
  SkeletonText,
  StatGrid,
  StatTile,
} from '../components/ui';
import type { DataTableColumn } from '../components/ui';
import { fmtDateTime } from '../utils/adminUtils';

type LoadState = 'loading' | 'error' | 'ok';

const STATUS_BADGE_MAP: Record<ActivityStatus, 'success' | 'warning' | 'error'> = {
  success: 'success',
  failure: 'error',
  started: 'warning',
  denied: 'error',
};

function fmtNumber(value: number | undefined) {
  return (value ?? 0).toLocaleString('vi-VN');
}

/** Thứ tự và nhãn cho các chỉ số hành vi — tên kỹ thuật không hiện ra giao diện. */
const BEHAVIOR_METRIC_ORDER = [
  'activity_count',
  'active_days',
  'actions_per_active_day',
  'distinct_action_count',
  'error_rate',
  'avg_duration_ms',
  'ai_call_count',
  'ai_total_tokens',
];

const BEHAVIOR_METRIC_LABELS: Record<string, string> = {
  activity_count: 'Số lượt hoạt động',
  active_days: 'Số ngày hoạt động',
  actions_per_active_day: 'Lượt mỗi ngày',
  distinct_action_count: 'Số loại thao tác',
  error_rate: 'Tỉ lệ lỗi',
  avg_duration_ms: 'Thời gian phản hồi TB',
  ai_call_count: 'Lượt gọi AI',
  ai_total_tokens: 'Tổng token AI',
};

function formatBehaviorMetric(key: string, value: number) {
  if (key === 'error_rate') return `${Math.round(value * 100)}%`;
  if (key === 'avg_duration_ms') return `${Math.round(value)} ms`;
  return value.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
}

function toIsoDateStart(value: string) {
  return value ? new Date(`${value}T00:00:00+07:00`).toISOString() : undefined;
}

function toIsoDateEnd(value: string) {
  return value ? new Date(`${value}T23:59:59.999+07:00`).toISOString() : undefined;
}

function ActivityDetailModal({ item, onClose }: { item: UserActivityLogItem; onClose: () => void }) {
  const metadataText = JSON.stringify(item.metadata || {}, null, 2);
  return (
    <Dialog
      open
      onClose={onClose}
      title="Chi tiết hoạt động"
      size="lg"
      footer={<Button variant="primary" onClick={onClose}>Đóng</Button>}
    >
      <dl className="ez-kv-grid">
        <div><dt>Action</dt><dd>{activityActionLabel(item.action)}</dd></div>
        <div><dt>Category</dt><dd>{activityCategoryLabel(item.category)}</dd></div>
        <div><dt>Status</dt><dd>{activityStatusLabel(item.status)}</dd></div>
        <div><dt>User ID</dt><dd>{item.user_id || 'Không có'}</dd></div>
        <div><dt>Resource</dt><dd>{item.resource_type || '-'} · {item.resource_id || '-'}</dd></div>
        <div><dt>Mã yêu cầu</dt><dd>{item.request_id || '-'}</dd></div>
        <div><dt>IP (đã ẩn danh)</dt><dd>{item.ip_hash || '-'}</dd></div>
        <div><dt>Trình duyệt/thiết bị</dt><dd>{item.user_agent_summary || '-'}</dd></div>
        <div><dt>Duration</dt><dd>{item.duration_ms == null ? '-' : `${item.duration_ms} ms`}</dd></div>
        <div><dt>Error</dt><dd>{item.error_code || '-'}</dd></div>
      </dl>
      {hasPrivateMetadataKey(item.metadata || {}) && (
        <Alert tone="warning">Dữ liệu này có thể chứa thông tin nhạy cảm — rà soát trước khi chia sẻ.</Alert>
      )}
      <pre className="ez-pre">{metadataText}</pre>
    </Dialog>
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
  const [behavior, setBehavior] = useState<UserBehaviorGroupsResponse | null>(null);
  const pageSize = 30;

  // Phân nhóm hành vi không phụ thuộc bộ lọc của bảng bên dưới, và lỗi ở đây
  // không được chặn trang nhật ký — đây là thông tin bổ trợ.
  useEffect(() => {
    const ctrl = new AbortController();
    activityLogsApi
      .behaviorGroups(90, ctrl.signal)
      .then((data) => setBehavior(data))
      .catch((err) => {
        if (err?.name !== 'CanceledError') setBehavior(null);
      });
    return () => ctrl.abort();
  }, []);

  const anomalousUsers = behavior?.users.filter((user) => user.is_anomalous) ?? [];

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

  const columns: DataTableColumn<UserActivityLogItem>[] = [
    { key: 'timestamp', label: 'Thời gian', render: (item) => fmtDateTime(item.timestamp) },
    {
      key: 'user',
      label: 'User',
      render: (item) => <span style={{ fontFamily: 'var(--ez-font-mono)' }}>{item.user_id || '-'}</span>,
    },
    { key: 'action', label: 'Action', render: (item) => activityActionLabel(item.action) },
    { key: 'category', label: 'Category', render: (item) => activityCategoryLabel(item.category) },
    {
      key: 'status',
      label: 'Status',
      render: (item) => <Badge variant={STATUS_BADGE_MAP[item.status as ActivityStatus]}>{activityStatusLabel(item.status)}</Badge>,
    },
    {
      key: 'resource',
      label: 'Resource',
      render: (item) => (
        <div className="ez-datatable-cell-title">
          <strong>{item.resource_type || '-'}</strong>
          <span className="ez-muted">{item.resource_id || ''}</span>
        </div>
      ),
    },
    { key: 'duration', label: 'Duration', render: (item) => (item.duration_ms == null ? '-' : `${item.duration_ms} ms`) },
    { key: 'error', label: 'Error', render: (item) => item.error_code || '-' },
    {
      key: 'detail',
      label: 'Chi tiết',
      render: (item) => <Button variant="outline" size="sm" onClick={() => setSelected(item)}>Xem</Button>,
    },
  ];

  return (
    <div className="ez-admin-page">
      <PageHeader
        title="Nhật ký hoạt động"
        description="Theo dõi hoạt động quan trọng mà không lưu nội dung riêng tư."
      />

      {stats && (
        <StatGrid aria-label="Thống kê nhật ký hoạt động">
          <StatTile label="Tổng hôm nay" value={fmtNumber(stats.total_today)} />
          <StatTile label="Thành công" value={fmtNumber(stats.success_count)} />
          <StatTile label="Thất bại" value={fmtNumber(stats.failure_count)} />
          <StatTile label="Bị từ chối quyền" value={fmtNumber(stats.permission_denied_count)} />
          <StatTile label="Vượt quota" value={fmtNumber(stats.quota_exceeded_count)} />
        </StatGrid>
      )}

      {behavior && behavior.status === 'ok' && behavior.groups.length > 0 && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle as="h2">Nhóm hành vi người dùng</CardTitle>
              <p className="ez-muted-note">
                K-Means trên {behavior.user_count} người dùng trong {behavior.window_days} ngày —
                chia {behavior.clustering?.selected_k} nhóm
                {behavior.clustering ? ` (silhouette ${behavior.clustering.silhouette_score.toFixed(2)})` : ''}.
                Dùng để đặt hạn mức theo mức sử dụng thật thay vì theo vai trò.
                {behavior.dropped_features.length > 0 && (
                  <>
                    {' '}Đã bỏ {behavior.dropped_features.length} đặc trưng không biến thiên:{' '}
                    {behavior.dropped_features
                      .map((key) => (BEHAVIOR_METRIC_LABELS[key] ?? key).toLowerCase())
                      .join(', ')}
                    .
                  </>
                )}
              </p>
            </div>
          </CardHeader>
          <CardBody>
            <div className="ez-behavior-groups">
              {behavior.groups.map((group) => (
                <article key={group.cluster_id} className="ez-behavior-group">
                  <div className="ez-behavior-group-head">
                    <strong>Nhóm {group.cluster_id + 1} · {group.size} người</strong>
                    {group.hint && <span className="ez-behavior-hint">{group.hint}</span>}
                  </div>
                  <dl className="ez-behavior-metrics">
                    {BEHAVIOR_METRIC_ORDER.filter((key) => key in group.profile).map((key) => (
                      <div key={key}>
                        <dt>{BEHAVIOR_METRIC_LABELS[key] ?? key}</dt>
                        <dd>{formatBehaviorMetric(key, group.profile[key])}</dd>
                      </div>
                    ))}
                  </dl>
                </article>
              ))}
            </div>

            {anomalousUsers.length > 0 && (
              <div className="ez-behavior-anomalies">
                <strong>Tài khoản lệch hẳn mọi nhóm ({anomalousUsers.length})</strong>
                <p className="ez-muted-note">
                  Hành vi không giống bất kỳ phân khúc nào — nên xem lại trước khi áp hạn mức chung.
                </p>
                <ul>
                  {anomalousUsers.map((user) => (
                    <li key={user.user_id}>
                      {/* Log vẫn còn nhưng tài khoản đã bị xoá — nói rõ thay vì hiện id trần. */}
                      {user.full_name || user.email || 'Tài khoản đã xoá'}
                      {user.role && <span className="ez-behavior-role">{user.role}</span>}
                      <span className="ez-behavior-metric-inline">
                        {user.metrics.activity_count} lượt · lỗi {Math.round((user.metrics.error_rate ?? 0) * 100)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody>
          <FilterBar columns={5} onSubmit={submitFilters}>
            <FormField label="Tìm kiếm">
              <Input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Action, resource, request ID" />
            </FormField>
            <FormField label="User ID">
              <Input value={filters.user_id} onChange={(event) => setFilters({ ...filters, user_id: event.target.value })} placeholder="ObjectId hoặc user id" />
            </FormField>
            <FormField label="Category">
              <Select value={filters.category} onChange={(event) => setFilters({ ...filters, category: event.target.value })}>
                <option value="all">Tất cả</option>
                {ACTIVITY_CATEGORIES.map((item) => <option key={item} value={item}>{activityCategoryLabel(item)}</option>)}
              </Select>
            </FormField>
            <FormField label="Action">
              <Select value={filters.action} onChange={(event) => setFilters({ ...filters, action: event.target.value })}>
                <option value="all">Tất cả</option>
                {ACTIVITY_ACTIONS.map((item) => <option key={item} value={item}>{activityActionLabel(item)}</option>)}
              </Select>
            </FormField>
            <FormField label="Status">
              <Select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
                <option value="all">Tất cả</option>
                {(['success', 'failure', 'started', 'denied'] as ActivityStatus[]).map((item) => (
                  <option key={item} value={item}>{activityStatusLabel(item)}</option>
                ))}
              </Select>
            </FormField>
            <FormField label="Từ ngày">
              <Input type="date" value={filters.date_from} onChange={(event) => setFilters({ ...filters, date_from: event.target.value })} />
            </FormField>
            <FormField label="Đến ngày">
              <Input type="date" value={filters.date_to} onChange={(event) => setFilters({ ...filters, date_to: event.target.value })} />
            </FormField>
            <FormField label="Resource type">
              <Input value={filters.resource_type} onChange={(event) => setFilters({ ...filters, resource_type: event.target.value })} placeholder="document, question_set..." />
            </FormField>
            <FormField label="Resource ID">
              <Input value={filters.resource_id} onChange={(event) => setFilters({ ...filters, resource_id: event.target.value })} />
            </FormField>
            <Checkbox
              checked={filters.error_only}
              onChange={(event) => setFilters({ ...filters, error_only: event.target.checked })}
              label="Chỉ lỗi"
            />
            <Button type="submit" variant="primary">Lọc</Button>
          </FilterBar>

          {error && <ErrorState title="Không tải được dữ liệu" description={error} onRetry={load} compact />}
          {state === 'loading' && <SkeletonText lines={6} />}
          {state === 'ok' && list && list.items.length === 0 && (
            <EmptyState title="Chưa có hoạt động phù hợp" description="Thử thay đổi bộ lọc hoặc khoảng thời gian." compact />
          )}

          {state === 'ok' && list && list.items.length > 0 && (
            <>
              <DataTable columns={columns} data={list.items} rowKey={(item) => item.id} minWidth={1040} />
              <Pagination page={page} totalPages={list.total_pages} total={list.total} label="hoạt động" onPageChange={setPage} />
            </>
          )}
        </CardBody>
      </Card>

      {selected && <ActivityDetailModal item={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
