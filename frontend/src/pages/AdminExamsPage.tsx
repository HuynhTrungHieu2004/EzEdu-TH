import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminContentApi } from '../api/adminContentApi';
import type { AdminExamListParams, AdminExamListResponse, ContentStatus } from '../types/adminContent';
import { Badge, EmptyState, Pagination, dateEnd, dateStart, fmtDateTime, fmtNumber } from './AdminContentShared';
import {
  Card,
  CardBody,
  DataTable,
  FilterBar,
  FormField,
  Input,
  PageHeader,
  Select,
} from '../components/ui';
import type { DataTableColumn } from '../components/ui';

export default function AdminExamsPage() {
  const [data, setData] = useState<AdminExamListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [userId, setUserId] = useState('');
  const [status, setStatus] = useState<ContentStatus>('active');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const params = useMemo<AdminExamListParams>(() => ({
    page,
    page_size: 20,
    search: search || undefined,
    user_id: userId || undefined,
    status,
    created_from: dateStart(from),
    created_to: dateEnd(to),
    sort_by: 'created_at',
    sort_order: 'desc',
  }), [from, page, search, status, to, userId]);

  const load = useCallback((signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    adminContentApi.listExams(params, signal)
      .then(setData)
      .catch((err) => {
        if (err.name !== 'CanceledError') setError(err.response?.data?.detail || 'Không tải được danh sách đề thi.');
      })
      .finally(() => setLoading(false));
  }, [params]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => load(controller.signal));
    return () => controller.abort();
  }, [load]);

  type ExamItem = AdminExamListResponse['items'][number];

  const columns: DataTableColumn<ExamItem>[] = useMemo(() => [
    {
      key: 'name',
      label: 'Tên đề',
      render: (item) => (
        <div className="ez-datatable-cell-title">
          <strong>{item.name}</strong>
          <span className="ez-muted">{item.id}</span>
        </div>
      ),
    },
    {
      key: 'owner',
      label: 'Chủ sở hữu',
      render: (item) => item.owner.full_name || item.owner.email || item.owner.id || 'Không có dữ liệu',
    },
    { key: 'question_count', label: 'Số câu', render: (item) => fmtNumber(item.question_count) },
    { key: 'created_at', label: 'Ngày tạo', render: (item) => fmtDateTime(item.created_at) },
    { key: 'last_exported_at', label: 'Lần xuất gần nhất', render: (item) => fmtDateTime(item.last_exported_at) },
    {
      key: 'status',
      label: 'Trạng thái',
      render: (item) => <Badge tone={item.status === 'deleted' ? 'danger' : 'ok'}>{item.status}</Badge>,
    },
    {
      key: 'source',
      label: 'Nguồn',
      render: (item) => item.source_document_name || item.source_document_id || 'Không có dữ liệu',
    },
  ], []);

  return (
    <div className="ez-admin-page">
      <PageHeader
        title="Quản lý đề thi"
        description="Danh sách đề thi hiện có trong hệ thống."
      />

      <Card>
        <CardBody>
          <FilterBar columns={5}>
            <FormField label="Tìm kiếm">
              <Input
                value={search}
                onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                placeholder="Tên đề hoặc tài liệu nguồn"
              />
            </FormField>
            <FormField label="User ID">
              <Input value={userId} onChange={(event) => { setUserId(event.target.value); setPage(1); }} />
            </FormField>
            <FormField label="Trạng thái">
              <Select value={status} onChange={(event) => { setStatus(event.target.value as ContentStatus); setPage(1); }}>
                <option value="active">Đang hoạt động</option>
                <option value="deleted">Đã xóa</option>
                <option value="all">Tất cả</option>
              </Select>
            </FormField>
            <FormField label="Từ ngày">
              <Input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} />
            </FormField>
            <FormField label="Đến ngày">
              <Input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} />
            </FormField>
          </FilterBar>

          {error && <EmptyState title="Có lỗi" text={error} />}
          {loading && <EmptyState title="Đang tải" text="Đang lấy dữ liệu đề thi từ backend." />}
          {!loading && data && data.items.length === 0 && <EmptyState title="Chưa có đề thi phù hợp" text="Không có dữ liệu giả để hiển thị." />}

          {!loading && data && data.items.length > 0 && (
            <>
              <DataTable columns={columns} data={data.items} rowKey={(item) => item.id} minWidth={900} />
              <Pagination page={data.page} totalPages={data.total_pages} total={data.total} onPage={setPage} />
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
