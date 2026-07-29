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
import {
  Badge,
  Button,
  Card, CardBody,
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

const RESULT_BADGE_MAP: Record<AdminAuditResult, 'success' | 'error'> = {
  success: 'success',
  failure: 'error',
};

function fmtNumber(value: number | undefined) {
  return (value ?? 0).toLocaleString('vi-VN');
}

function toIsoDateStart(value: string) {
  return value ? new Date(`${value}T00:00:00+07:00`).toISOString() : undefined;
}

function toIsoDateEnd(value: string) {
  return value ? new Date(`${value}T23:59:59.999+07:00`).toISOString() : undefined;
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

  const diffColumns: DataTableColumn<(typeof rows)[number]>[] = [
    { key: 'field', label: 'Field', render: (row) => row.field },
    { key: 'before', label: 'Before', render: (row) => row.before },
    { key: 'after', label: 'After', render: (row) => row.after },
  ];

  return (
    <Dialog
      open
      onClose={onClose}
      title="Trước và sau thay đổi"
      size="xl"
      footer={<Button variant="primary" onClick={onClose}>Đóng</Button>}
    >
      <dl className="ez-kv-grid">
        <div><dt>Admin</dt><dd>{item.admin_email_snapshot}</dd></div>
        <div><dt>Action</dt><dd>{adminAuditActionLabel(item.action)}</dd></div>
        <div><dt>Target</dt><dd>{item.target_type} · {item.target_id}</dd></div>
        <div><dt>Result</dt><dd>{adminAuditResultLabel(item.result)}</dd></div>
        <div><dt>Reason</dt><dd>{item.reason || '-'}</dd></div>
        <div><dt>Mã yêu cầu</dt><dd>{item.request_id || '-'}</dd></div>
        <div><dt>IP (đã ẩn danh)</dt><dd>{item.ip_hash || '-'}</dd></div>
        <div><dt>Trình duyệt/thiết bị</dt><dd>{item.user_agent_summary || '-'}</dd></div>
      </dl>

      {rows.length > 0 ? (
        <DataTable columns={diffColumns} data={rows} rowKey={(row) => row.field} minWidth={0} />
      ) : (
        <p className="ez-muted">Không có thay đổi before/after được ghi nhận.</p>
      )}
    </Dialog>
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

  const columns: DataTableColumn<AdminAuditLogItem>[] = [
    { key: 'timestamp', label: 'Thời gian', render: (item) => fmtDateTime(item.timestamp) },
    {
      key: 'admin',
      label: 'Admin',
      render: (item) => (
        <div className="ez-datatable-cell-title">
          <strong>{item.admin_email_snapshot}</strong>
          <span className="ez-muted">{item.admin_user_id}</span>
        </div>
      ),
    },
    { key: 'action', label: 'Hành động', render: (item) => adminAuditActionLabel(item.action) },
    {
      key: 'target',
      label: 'Đối tượng',
      render: (item) => (
        <div className="ez-datatable-cell-title">
          <strong>{item.target_type}</strong>
          <span className="ez-muted">{item.target_id}</span>
        </div>
      ),
    },
    {
      key: 'result',
      label: 'Kết quả',
      render: (item) => <Badge variant={RESULT_BADGE_MAP[item.result as AdminAuditResult]}>{adminAuditResultLabel(item.result)}</Badge>,
    },
    { key: 'reason', label: 'Lý do', render: (item) => item.reason || '-' },
    {
      key: 'diff',
      label: 'Before/After',
      render: (item) => <Button variant="outline" size="sm" onClick={() => setSelected(item)}>Xem</Button>,
    },
  ];

  return (
    <div className="ez-admin-page">
      <PageHeader
        title="Nhật ký quản trị"
        description="Theo dõi thao tác quản trị có ảnh hưởng dữ liệu hoặc cấu hình."
      />

      {stats && (
        <StatGrid aria-label="Thống kê nhật ký quản trị">
          <StatTile label="Tổng bản ghi" value={fmtNumber(stats.total)} />
          <StatTile label="Thành công" value={fmtNumber(stats.success_count)} />
          <StatTile label="Thất bại" value={fmtNumber(stats.failure_count)} />
          <StatTile label="Loại hành động" value={fmtNumber(Object.keys(stats.by_action).length)} />
          <StatTile label="Loại đối tượng" value={fmtNumber(Object.keys(stats.by_target_type).length)} />
        </StatGrid>
      )}

      <Card>
        <CardBody>
          <FilterBar columns={4} onSubmit={submitFilters}>
            <FormField label="Tìm kiếm">
              <Input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Admin, action, target, reason" />
            </FormField>
            <FormField label="Admin ID">
              <Input value={filters.admin_user_id} onChange={(event) => setFilters({ ...filters, admin_user_id: event.target.value })} />
            </FormField>
            <FormField label="Action">
              <Select value={filters.action} onChange={(event) => setFilters({ ...filters, action: event.target.value })}>
                <option value="all">Tất cả</option>
                {ADMIN_AUDIT_ACTIONS.map((action) => <option key={action} value={action}>{adminAuditActionLabel(action)}</option>)}
              </Select>
            </FormField>
            <FormField label="Target type">
              <Input value={filters.target_type} onChange={(event) => setFilters({ ...filters, target_type: event.target.value })} placeholder="user, document..." />
            </FormField>
            <FormField label="Target ID">
              <Input value={filters.target_id} onChange={(event) => setFilters({ ...filters, target_id: event.target.value })} />
            </FormField>
            <FormField label="Kết quả">
              <Select value={filters.result} onChange={(event) => setFilters({ ...filters, result: event.target.value })}>
                <option value="all">Tất cả</option>
                {(['success', 'failure'] as AdminAuditResult[]).map((item) => <option key={item} value={item}>{adminAuditResultLabel(item)}</option>)}
              </Select>
            </FormField>
            <FormField label="Từ ngày">
              <Input type="date" value={filters.date_from} onChange={(event) => setFilters({ ...filters, date_from: event.target.value })} />
            </FormField>
            <FormField label="Đến ngày">
              <Input type="date" value={filters.date_to} onChange={(event) => setFilters({ ...filters, date_to: event.target.value })} />
            </FormField>
            <Button type="submit" variant="primary">Lọc</Button>
          </FilterBar>

          {error && <ErrorState title="Không tải được dữ liệu" description={error} onRetry={load} compact />}
          {state === 'loading' && <SkeletonText lines={6} />}
          {state === 'ok' && list && list.items.length === 0 && (
            <EmptyState title="Chưa có bản ghi phù hợp" description="Thử thay đổi bộ lọc hoặc khoảng thời gian." compact />
          )}

          {state === 'ok' && list && list.items.length > 0 && (
            <>
              <DataTable columns={columns} data={list.items} rowKey={(item) => item.id} minWidth={1040} />
              <Pagination page={page} totalPages={list.total_pages} total={list.total} label="bản ghi" onPageChange={setPage} />
            </>
          )}
        </CardBody>
      </Card>

      {selected && <AuditDiffModal item={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
