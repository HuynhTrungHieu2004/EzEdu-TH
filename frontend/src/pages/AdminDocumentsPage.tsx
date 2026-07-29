import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminContentApi } from '../api/adminContentApi';
import { authApi } from '../api/authApi';
import type { AdminDocumentListParams, AdminDocumentListResponse, AdminDocumentSummary, ContentStatus } from '../types/adminContent';
import { hasPermission } from '../utils/adminPermissions';
import { Badge, EmptyState, Pagination, ReasonModal, dateEnd, dateStart, fmtDateTime, fmtFileSize, fmtNumber } from './AdminContentShared';
import { apiErrorMessage, isCanceledError } from '../utils/apiError';
import {
  Button,
  Card, CardBody,
  DataTable,
  FilterBar,
  FormField,
  Input,
  PageHeader,
  Select,
} from '../components/ui';
import type { DataTableColumn } from '../components/ui';

type ModalKind = 'delete' | 'reprocess' | 'quarantine';

export default function AdminDocumentsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<AdminDocumentListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [role, setRole] = useState<string>();
  const [overrides, setOverrides] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ContentStatus>('active');
  const [fileType, setFileType] = useState('');
  const [processingStatus, setProcessingStatus] = useState('');
  const [userId, setUserId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [hasError, setHasError] = useState('');
  const [modal, setModal] = useState<{ kind: ModalKind; item: AdminDocumentSummary } | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const canUpdate = hasPermission(role, 'documents.update', overrides);
  const canDelete = hasPermission(role, 'documents.delete', overrides);
  const canReprocess = hasPermission(role, 'documents.reprocess', overrides);

  useEffect(() => {
    authApi.getMe().then((user) => {
      setRole(user.role);
      setOverrides(user.permissions_override || []);
    }).catch(() => undefined);
  }, []);

  const params = useMemo<AdminDocumentListParams>(() => ({
    page,
    page_size: 20,
    search: search || undefined,
    user_id: userId || undefined,
    file_type: fileType || undefined,
    processing_status: processingStatus || undefined,
    status,
    created_from: dateStart(from),
    created_to: dateEnd(to),
    has_error: hasError === '' ? undefined : hasError === 'true',
    sort_by: 'created_at',
    sort_order: 'desc',
  }), [fileType, from, hasError, page, processingStatus, search, status, to, userId]);

  const load = useCallback((signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    adminContentApi.listDocuments(params, signal)
      .then(setData)
      .catch((err) => {
        if (!isCanceledError(err)) setError(apiErrorMessage(err, 'Không tải được danh sách tài liệu.'));
      })
      .finally(() => setLoading(false));
  }, [params]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => load(controller.signal));
    return () => controller.abort();
  }, [load]);

  const runAction = async () => {
    if (!modal) return;
    setBusy(true);
    try {
      if (modal.kind === 'delete') await adminContentApi.deleteDocument(modal.item.id, reason);
      if (modal.kind === 'reprocess') await adminContentApi.reprocessDocument(modal.item.id, reason);
      if (modal.kind === 'quarantine') await adminContentApi.quarantineDocument(modal.item.id, reason);
      setModal(null);
      setReason('');
      load();
    } catch (err: unknown) {
      setError(apiErrorMessage(err, 'Thao tác thất bại.'));
    } finally {
      setBusy(false);
    }
  };

  const restore = async (item: AdminDocumentSummary) => {
    setBusy(true);
    try {
      await adminContentApi.restoreDocument(item.id);
      load();
    } catch (err: unknown) {
      setError(apiErrorMessage(err, 'Không khôi phục được tài liệu.'));
    } finally {
      setBusy(false);
    }
  };

  const unquarantine = async (item: AdminDocumentSummary) => {
    setBusy(true);
    try {
      await adminContentApi.unquarantineDocument(item.id);
      load();
    } catch (err: unknown) {
      setError(apiErrorMessage(err, 'Không bỏ cách ly được tài liệu.'));
    } finally {
      setBusy(false);
    }
  };

  const columns: DataTableColumn<AdminDocumentSummary>[] = [
    {
      key: 'title',
      label: 'Tài liệu',
      render: (item) => (
        <div className="ez-datatable-cell-title">
          <strong>{item.original_filename}</strong>
          <span className="ez-muted">{item.id}</span>
        </div>
      ),
    },
    {
      key: 'owner',
      label: 'Chủ sở hữu',
      render: (item) => item.owner.full_name || item.owner.email || item.owner.id || 'Không có dữ liệu',
    },
    {
      key: 'file',
      label: 'File',
      render: (item) => (
        <>
          {item.file_type || 'Không rõ'}
          <br />
          <span className="ez-muted">{fmtFileSize(item.file_size)}</span>
        </>
      ),
    },
    { key: 'uploaded_at', label: 'Upload', render: (item) => fmtDateTime(item.uploaded_at) },
    {
      key: 'processing_status',
      label: 'Xử lý',
      render: (item) => (
        <Badge tone={item.deleted_at || item.is_quarantined ? 'danger' : 'info'}>
          {item.deleted_at ? 'deleted' : item.is_quarantined ? 'quarantined' : item.processing_status}
        </Badge>
      ),
    },
    {
      key: 'counts',
      label: 'Trang/chunk/câu hỏi',
      render: (item) => `${item.page_count ?? 'Không có dữ liệu'} / ${fmtNumber(item.chunk_count)} / ${fmtNumber(item.question_count)}`,
    },
    {
      key: 'knowledge_verification_status',
      label: 'Kiểm tra kiến thức',
      render: (item) => item.knowledge_verification_status || 'Không có dữ liệu',
    },
    { key: 'latest_error', label: 'Lỗi gần nhất', render: (item) => item.latest_error || 'Không có dữ liệu' },
    {
      key: 'actions',
      label: 'Hành động',
      render: (item) => (
        <div className="ez-datatable-cell-actions">
          <Button variant="outline" size="sm" onClick={() => navigate(`/admin/documents/${item.id}`)}>Xem</Button>
          {canReprocess && !item.deleted_at && (
            <Button variant="outline" size="sm" onClick={() => setModal({ kind: 'reprocess', item })}>Xử lý lại</Button>
          )}
          {canUpdate && !item.deleted_at && !item.is_quarantined && (
            <Button variant="outline" size="sm" onClick={() => setModal({ kind: 'quarantine', item })}>Cách ly</Button>
          )}
          {canUpdate && !item.deleted_at && item.is_quarantined && (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => unquarantine(item)}>Bỏ cách ly</Button>
          )}
          {canDelete && !item.deleted_at && (
            <Button variant="danger" size="sm" onClick={() => setModal({ kind: 'delete', item })}>Xóa mềm</Button>
          )}
          {canUpdate && item.deleted_at && (
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => restore(item)}>Khôi phục</Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="ez-admin-page">
      <PageHeader
        title="Quản lý tài liệu"
        description="Kiểm tra trạng thái xử lý, lỗi, đoạn nội dung và câu hỏi liên quan mà không mở nội dung riêng tư."
      />

      <Card>
        <CardBody>
          <FilterBar columns={4}>
            <FormField label="Tìm kiếm">
              <Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Tên tài liệu" />
            </FormField>
            <FormField label="User ID">
              <Input value={userId} onChange={(event) => { setUserId(event.target.value); setPage(1); }} placeholder="ObjectId người sở hữu" />
            </FormField>
            <FormField label="Loại file">
              <Input value={fileType} onChange={(event) => { setFileType(event.target.value); setPage(1); }} placeholder="pdf, docx..." />
            </FormField>
            <FormField label="Trạng thái xử lý">
              <Input value={processingStatus} onChange={(event) => { setProcessingStatus(event.target.value); setPage(1); }} placeholder="uploaded, failed..." />
            </FormField>
            <FormField label="Trạng thái">
              <Select value={status} onChange={(event) => { setStatus(event.target.value as ContentStatus); setPage(1); }}>
                <option value="active">Đang hoạt động</option>
                <option value="quarantined">Cách ly</option>
                <option value="deleted">Đã xóa</option>
                <option value="all">Tất cả</option>
              </Select>
            </FormField>
            <FormField label="Có lỗi">
              <Select value={hasError} onChange={(event) => { setHasError(event.target.value); setPage(1); }}>
                <option value="">Tất cả</option>
                <option value="true">Có lỗi</option>
                <option value="false">Không lỗi</option>
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
          {loading && <EmptyState title="Đang tải" text="Đang lấy dữ liệu tài liệu từ backend." />}
          {!loading && data && data.items.length === 0 && <EmptyState title="Chưa có tài liệu phù hợp" text="Không có dữ liệu giả để hiển thị." />}

          {!loading && data && data.items.length > 0 && (
            <>
              <DataTable columns={columns} data={data.items} rowKey={(item) => item.id} minWidth={1100} />
              <Pagination page={data.page} totalPages={data.total_pages} total={data.total} onPage={setPage} />
            </>
          )}
        </CardBody>
      </Card>

      {modal && (
        <ReasonModal
          title={modal.kind === 'delete' ? 'Xóa mềm tài liệu' : modal.kind === 'quarantine' ? 'Cách ly tài liệu' : 'Xử lý lại tài liệu'}
          target={modal.item.original_filename}
          reason={reason}
          busy={busy}
          consequence={modal.kind === 'delete'
            ? 'Tài liệu sẽ bị ẩn khỏi các luồng sử dụng cho tới khi được khôi phục.'
            : modal.kind === 'reprocess'
              ? 'Hệ thống sẽ chạy lại pipeline xử lý và có thể phát sinh tác vụ nền.'
              : 'Người dùng sẽ tạm thời không thể sử dụng tài liệu này.'}
          reversible={modal.kind !== 'reprocess'}
          confirmationText={modal.kind === 'delete' ? 'XÓA' : undefined}
          onReason={setReason}
          onCancel={() => { setModal(null); setReason(''); }}
          onConfirm={runAction}
        />
      )}
    </div>
  );
}
