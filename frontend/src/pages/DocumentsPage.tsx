import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Library } from 'lucide-react';
import { documentApi } from '../api/documentApi';
import type { DocumentResponse } from '../api/documentApi';
import FileUpload from '../components/FileUpload';
import { getApiErrorDetail, isUnauthorizedError } from '../api/errors';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  FilterBar,
  FormField,
  Input,
  PageHeader,
  Select,
  SkeletonText,
} from '../components/ui';
import type { DataTableColumn } from '../components/ui';
import { ProcessingStatusBadge } from '../components/domain/ProcessingStatusBadge';
import { StaggerGroup } from '../motion';

type StatusFilter = 'all' | 'ready' | 'processing' | 'failed';

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'Tất cả trạng thái' },
  { value: 'ready', label: 'Sẵn sàng dùng' },
  { value: 'processing', label: 'Đang xử lý' },
  { value: 'failed', label: 'Không thành công' },
];

const FAILED_STATUSES = new Set(['failed', 'index_failed']);
const READY_STATUSES = new Set(['indexed']);

function statusGroupOf(status: string): Exclude<StatusFilter, 'all'> {
  if (READY_STATUSES.has(status)) return 'ready';
  if (FAILED_STATUSES.has(status)) return 'failed';
  return 'processing';
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const units = ['Bytes', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

/**
 * Kho học liệu của giáo viên.
 *
 * Trang này trước đây tự dựng bảng bằng CSS legacy (`.table-card`, `.data-table`,
 * `.tag`) và tự map màu trạng thái bằng biến hệ cũ (`--accent-2-bg`, `--danger-bg`),
 * nên nhìn khác hẳn các trang danh sách còn lại và không có cách nào lọc khi kho
 * học liệu nhiều lên. Nay dùng đúng `PageHeader`/`FilterBar`/`DataTable`/`EmptyState`
 * như các trang danh sách khác, và trạng thái dùng `ProcessingStatusBadge` chung.
 */
const DocumentsPage = () => {
  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentResponse | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const navigate = useNavigate();

  const handleDelete = async () => {
    const doc = deleteTarget;
    if (!doc || deletingId || deleteConfirmation !== 'XÓA') return;
    setDeletingId(doc.id);
    setActionError(null);
    try {
      await documentApi.delete(doc.id);
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
      setDeleteTarget(null);
      setDeleteConfirmation('');
    } catch (err: unknown) {
      setActionError(getApiErrorDetail(err) ?? 'Xoá tài liệu thất bại. Vui lòng thử lại.');
    } finally {
      setDeletingId(null);
    }
  };

  const fetchDocuments = useCallback(async () => {
    setError(null);
    try {
      const docs = await documentApi.list();
      setDocuments(docs);
    } catch (err: unknown) {
      if (isUnauthorizedError(err)) {
        localStorage.removeItem('access_token');
        navigate('/login');
        return;
      }
      setError(getApiErrorDetail(err) ?? 'Không thể tải danh sách tài liệu. Vui lòng thử lại sau.');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      navigate('/login');
      return;
    }
    void Promise.resolve().then(fetchDocuments);
  }, [fetchDocuments, navigate]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return documents.filter((doc) => {
      const matchesKeyword = keyword === ''
        || doc.original_filename.toLowerCase().includes(keyword);
      const matchesStatus = statusFilter === 'all' || statusGroupOf(doc.status) === statusFilter;
      return matchesKeyword && matchesStatus;
    });
  }, [documents, search, statusFilter]);

  const columns: Array<DataTableColumn<DocumentResponse>> = [
    {
      key: 'name',
      label: 'Tên tài liệu',
      render: (doc) => (
        <Button variant="ghost" size="sm" onClick={() => navigate(`/documents/${doc.id}`)}>
          {doc.original_filename}
        </Button>
      ),
    },
    {
      key: 'kind',
      label: 'Loại',
      render: (doc) => `${doc.media_kind === 'video' ? 'Video' : 'Tài liệu'} · ${doc.file_type.toUpperCase()}`,
    },
    { key: 'size', label: 'Dung lượng', render: (doc) => formatSize(doc.file_size) },
    { key: 'status', label: 'Trạng thái', render: (doc) => <ProcessingStatusBadge status={doc.status} /> },
    {
      key: 'created',
      label: 'Thời gian tải lên',
      render: (doc) => new Date(doc.created_at).toLocaleString('vi-VN'),
    },
    {
      key: 'actions',
      label: 'Hành động',
      render: (doc) => (
        <div className="ez-datatable-cell-actions">
          <Button variant="outline" size="sm" onClick={() => navigate(`/documents/${doc.id}`)}>
            Xem chi tiết
          </Button>
          <Button
            variant="danger"
            size="sm"
            loading={deletingId === doc.id}
            onClick={() => setDeleteTarget(doc)}
          >
            Xoá
          </Button>
        </div>
      ),
    },
  ];

  if (error && documents.length === 0) {
    return (
      <ErrorState
        title="Không tải được danh sách học liệu"
        description={error}
        actions={<Button onClick={() => void fetchDocuments()}>Thử lại</Button>}
      />
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Kho học liệu"
        title="Quản lý học liệu điện tử"
        description="Tải lên và quản lý tài liệu PDF, DOCX, PPTX cùng video MP4, MOV, WEBM, MKV."
      />

      <FileUpload onUploadSuccess={fetchDocuments} />

      {(actionError || error) && (
        <Alert tone="error" style={{ marginBottom: 'var(--ez-space-4)' }}>
          {actionError ?? error}
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle as="h2">Học liệu của bạn</CardTitle>
          </div>
        </CardHeader>
        <CardBody>
          <FilterBar columns={2}>
            <FormField label="Tìm theo tên">
              <Input
                type="search"
                value={search}
                placeholder="Nhập tên tài liệu…"
                onChange={(event) => setSearch(event.target.value)}
              />
            </FormField>
            <FormField label="Trạng thái xử lý">
              <Select
                value={statusFilter}
                options={STATUS_FILTERS}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              />
            </FormField>
          </FilterBar>

          <p className="ez-filter-summary" aria-live="polite">
            {loading ? 'Đang tải học liệu…' : `${filtered.length}/${documents.length} học liệu`}
          </p>

          {loading ? (
            <SkeletonText lines={6} />
          ) : documents.length === 0 ? (
            <EmptyState
              icon={<Library size={24} />}
              title="Chưa có học liệu nào"
              description="Tải lên tệp PDF, DOCX, PPTX hoặc video ở phần trên để bắt đầu."
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              compact
              icon={<Library size={24} />}
              title="Không có học liệu khớp bộ lọc"
              description="Thử xoá từ khoá tìm kiếm hoặc chọn lại trạng thái."
              actions={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearch('');
                    setStatusFilter('all');
                  }}
                >
                  Xoá bộ lọc
                </Button>
              }
            />
          ) : (
            <StaggerGroup selector=".ez-datatable tbody tr">
              <DataTable
                columns={columns}
                data={filtered}
                rowKey={(doc) => doc.id}
                minWidth={880}
              />
            </StaggerGroup>
          )}
        </CardBody>
      </Card>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={deletingId ? () => undefined : () => { setDeleteTarget(null); setDeleteConfirmation(''); }}
        onConfirm={() => void handleDelete()}
        title="Xóa vĩnh viễn học liệu?"
        description={`“${deleteTarget?.original_filename ?? ''}” cùng nội dung trích xuất và các bộ câu hỏi liên quan sẽ bị xóa. Thao tác không thể hoàn tác.`}
        confirmLabel="Xóa vĩnh viễn"
        confirmDisabled={deleteConfirmation !== 'XÓA'}
        busy={Boolean(deletingId)}
      >
        <Alert tone="error">Đây là thao tác xóa nghiêm trọng. Hãy kiểm tra đúng học liệu trước khi tiếp tục.</Alert>
        <FormField
          label="Nhập XÓA để xác nhận"
          error={deleteConfirmation && deleteConfirmation !== 'XÓA' ? 'Nội dung xác nhận chưa đúng.' : undefined}
        >
          <Input
            value={deleteConfirmation}
            onChange={(event) => setDeleteConfirmation(event.target.value)}
            autoComplete="off"
            invalid={Boolean(deleteConfirmation && deleteConfirmation !== 'XÓA')}
          />
        </FormField>
      </ConfirmDialog>
    </>
  );
};

export default DocumentsPage;
