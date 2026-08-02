import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, ExternalLink, Pencil } from 'lucide-react';
import { teacherHistoryApi } from '../../api/teacherHistoryApi';
import type { ContentHistoryItem, ContentHistoryType } from '../../api/teacherHistoryApi';
import { documentApi } from '../../api/documentApi';
import { examBankApi } from '../../api/examBankApi';
import { getApiErrorDetail } from '../../api/errors';
import {
  Alert,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FilterBar,
  Input,
  Pagination,
  PageHeader,
  Tabs,
  useToast,
} from '../../components/ui';
import type { DataTableColumn, TabItem } from '../../components/ui';

const PAGE_SIZE = 20;

const TABS: TabItem[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'document', label: 'Học liệu' },
  { id: 'exam', label: 'Đề thi' },
];

export default function ContentHistoryPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [type, setType] = useState<ContentHistoryType>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<ContentHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ContentHistoryItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    teacherHistoryApi
      .list({ type, search: search || undefined, skip: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE })
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((err) => setError(getApiErrorDetail(err) ?? 'Không tải được lịch sử.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const timer = window.setTimeout(load, 250);
    return () => window.clearTimeout(timer);
  }, [type, search, page]);

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      if (pendingDelete.item_type === 'document') {
        await documentApi.delete(pendingDelete.id);
      } else {
        await examBankApi.deleteExam(pendingDelete.id, pendingDelete.version ?? 1);
      }
      toast({ tone: 'success', title: 'Đã xóa khỏi lịch sử.' });
      setPendingDelete(null);
      load();
    } catch (err) {
      toast({ tone: 'error', title: getApiErrorDetail(err) ?? 'Xóa thất bại.' });
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleRetake = async (row: ContentHistoryItem) => {
    if (row.item_type !== 'exam' || row.version === null) return;
    setTogglingId(row.id);
    try {
      await examBankApi.setAllowRetake(row.id, row.version, !row.allow_retake);
      load();
    } catch (err) {
      toast({ tone: 'error', title: getApiErrorDetail(err) ?? 'Cập nhật thất bại.' });
    } finally {
      setTogglingId(null);
    }
  };

  const columns: DataTableColumn<ContentHistoryItem>[] = [
    { key: 'title', label: 'Tên', render: (row) => row.title },
    {
      key: 'item_type',
      label: 'Loại',
      render: (row) => (row.item_type === 'document' ? 'Học liệu' : 'Đề thi'),
    },
    {
      key: 'created_at',
      label: 'Ngày tạo',
      render: (row) => new Date(row.created_at).toLocaleString('vi-VN'),
    },
    {
      key: 'attempt_count',
      label: 'Số lượt làm',
      render: (row) => (row.item_type === 'exam' ? row.attempt_count ?? '—' : '—'),
    },
    {
      key: 'avg_score',
      label: 'Điểm TB',
      render: (row) => (row.item_type === 'exam' ? row.avg_score ?? '—' : '—'),
    },
    {
      key: 'allow_retake',
      label: 'Cho làm lại',
      render: (row) =>
        row.item_type === 'exam' ? (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={row.allow_retake ?? false}
              disabled={togglingId === row.id}
              onChange={() => handleToggleRetake(row)}
            />
          </label>
        ) : (
          '—'
        ),
    },
    {
      key: 'actions',
      label: 'Hành động',
      render: (row) => (
        <div style={{ display: 'flex', gap: 8 }}>
          {row.item_type === 'document' && row.cloudinary_url && (
            <a href={row.cloudinary_url} target="_blank" rel="noreferrer" className="btn-secondary">
              <ExternalLink size={16} /> Xem
            </a>
          )}
          {row.item_type === 'exam' && row.blueprint_id && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => navigate(`/exam-blueprints/${row.blueprint_id}`)}
            >
              <Pencil size={16} /> Sửa
            </button>
          )}
          <button type="button" className="btn-danger" onClick={() => setPendingDelete(row)}>
            <Trash2 size={16} /> Xóa
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="page">
      <div className="page-wide">
        <PageHeader
          eyebrow="Giảng viên"
          title="Lịch sử học liệu & đề thi"
          description="Xem, sửa, xóa và theo dõi thống kê sử dụng."
        />

        <Tabs
          items={TABS}
          value={type}
          onChange={(id) => {
            setType(id as ContentHistoryType);
            setPage(1);
          }}
          ariaLabel="Lọc theo loại nội dung"
        />

        <FilterBar>
          <Input
            placeholder="Tìm theo tên..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </FilterBar>

        {error && <Alert tone="error">{error}</Alert>}

        {!loading && items.length === 0 && (
          <EmptyState
            title="Không có học liệu hoặc đề thi nào"
            description="Thử tìm kiếm hoặc thay đổi bộ lọc."
          />
        )}

        {items.length > 0 && (
          <>
            <DataTable
              columns={columns}
              data={items}
              rowKey={(row) => row.id}
            />

            <Pagination
              page={page}
              totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
              total={total}
              onPageChange={setPage}
              label="mục"
            />
          </>
        )}

        <ConfirmDialog
          open={pendingDelete !== null}
          onClose={() => setPendingDelete(null)}
          onConfirm={handleDelete}
          title="Xóa khỏi lịch sử?"
          description={pendingDelete ? `"${pendingDelete.title}" sẽ bị xóa khỏi danh sách quản lý.` : undefined}
          confirmLabel="Xóa"
          confirmVariant="danger"
          busy={deleting}
        />
      </div>
    </div>
  );
}
