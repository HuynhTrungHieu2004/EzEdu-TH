import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminContentApi } from '../api/adminContentApi';
import { authApi } from '../api/authApi';
import type { AdminDocumentListParams, AdminDocumentListResponse, AdminDocumentSummary, ContentStatus } from '../types/adminContent';
import { hasPermission } from '../utils/adminPermissions';
import { Badge, EmptyState, Pagination, ReasonModal, dateEnd, dateStart, fmtDateTime, fmtFileSize, fmtNumber } from './AdminContentShared';
import { apiErrorMessage, isCanceledError } from '../utils/apiError';
import './AdminContentPages.css';

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

  return (
    <main className="admin-content-page">
      <header className="admin-content-header">
        <div>
          <h1>Quản lý tài liệu</h1>
          <p>Kiểm tra trạng thái xử lý, lỗi, chunk và câu hỏi liên quan mà không mở nội dung riêng tư.</p>
        </div>
      </header>

      <section className="admin-content-toolbar">
        <label className="admin-content-field"><span>Tìm kiếm</span><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Tên tài liệu" /></label>
        <label className="admin-content-field"><span>User ID</span><input value={userId} onChange={(event) => { setUserId(event.target.value); setPage(1); }} placeholder="ObjectId người sở hữu" /></label>
        <label className="admin-content-field"><span>Loại file</span><input value={fileType} onChange={(event) => { setFileType(event.target.value); setPage(1); }} placeholder="pdf, docx..." /></label>
        <label className="admin-content-field"><span>Trạng thái xử lý</span><input value={processingStatus} onChange={(event) => { setProcessingStatus(event.target.value); setPage(1); }} placeholder="uploaded, failed..." /></label>
        <label className="admin-content-field"><span>Trạng thái</span><select value={status} onChange={(event) => { setStatus(event.target.value as ContentStatus); setPage(1); }}><option value="active">Đang hoạt động</option><option value="quarantined">Cách ly</option><option value="deleted">Đã xóa</option><option value="all">Tất cả</option></select></label>
        <label className="admin-content-field"><span>Có lỗi</span><select value={hasError} onChange={(event) => { setHasError(event.target.value); setPage(1); }}><option value="">Tất cả</option><option value="true">Có lỗi</option><option value="false">Không lỗi</option></select></label>
        <label className="admin-content-field"><span>Từ ngày</span><input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} /></label>
        <label className="admin-content-field"><span>Đến ngày</span><input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} /></label>
      </section>

      {error && <EmptyState title="Có lỗi" text={error} />}
      {loading && <EmptyState title="Đang tải" text="Đang lấy dữ liệu tài liệu từ backend." />}
      {!loading && data && data.items.length === 0 && <EmptyState title="Chưa có tài liệu phù hợp" text="Không có dữ liệu giả để hiển thị." />}

      {!loading && data && data.items.length > 0 && (
        <>
          <div className="admin-content-table-wrap">
            <table className="admin-content-table">
              <thead><tr><th>Tài liệu</th><th>Chủ sở hữu</th><th>File</th><th>Upload</th><th>Xử lý</th><th>Trang/chunk/câu hỏi</th><th>Kiểm tra kiến thức</th><th>Lỗi gần nhất</th><th>Hành động</th></tr></thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td data-label="Tài liệu"><div className="admin-content-title-cell"><strong>{item.original_filename}</strong><span className="admin-content-muted">{item.id}</span></div></td>
                    <td data-label="Chủ sở hữu">{item.owner.full_name || item.owner.email || item.owner.id || 'Không có dữ liệu'}</td>
                    <td data-label="File">{item.file_type || 'Không rõ'}<br /><span className="admin-content-muted">{fmtFileSize(item.file_size)}</span></td>
                    <td data-label="Upload">{fmtDateTime(item.uploaded_at)}</td>
                    <td data-label="Xử lý"><Badge tone={item.deleted_at || item.is_quarantined ? 'danger' : 'info'}>{item.deleted_at ? 'deleted' : item.is_quarantined ? 'quarantined' : item.processing_status}</Badge></td>
                    <td data-label="Trang/chunk/câu hỏi">{item.page_count ?? 'Không có dữ liệu'} / {fmtNumber(item.chunk_count)} / {fmtNumber(item.question_count)}</td>
                    <td data-label="Kiểm tra kiến thức">{item.knowledge_verification_status || 'Không có dữ liệu'}</td>
                    <td data-label="Lỗi gần nhất">{item.latest_error || 'Không có dữ liệu'}</td>
                    <td data-label="Hành động">
                      <div className="admin-content-actions">
                        <button className="admin-content-btn" type="button" onClick={() => navigate(`/admin/documents/${item.id}`)}>Xem</button>
                        {canReprocess && !item.deleted_at && <button className="admin-content-btn" type="button" onClick={() => setModal({ kind: 'reprocess', item })}>Xử lý lại</button>}
                        {canUpdate && !item.deleted_at && !item.is_quarantined && <button className="admin-content-btn" type="button" onClick={() => setModal({ kind: 'quarantine', item })}>Cách ly</button>}
                        {canUpdate && !item.deleted_at && item.is_quarantined && <button className="admin-content-btn" type="button" disabled={busy} onClick={() => unquarantine(item)}>Bỏ cách ly</button>}
                        {canDelete && !item.deleted_at && <button className="admin-content-btn admin-content-btn--danger" type="button" onClick={() => setModal({ kind: 'delete', item })}>Xóa mềm</button>}
                        {canUpdate && item.deleted_at && <button className="admin-content-btn" type="button" disabled={busy} onClick={() => restore(item)}>Khôi phục</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} totalPages={data.total_pages} total={data.total} onPage={setPage} />
        </>
      )}

      {modal && (
        <ReasonModal
          title={modal.kind === 'delete' ? 'Xóa mềm tài liệu' : modal.kind === 'quarantine' ? 'Cách ly tài liệu' : 'Xử lý lại tài liệu'}
          target={modal.item.original_filename}
          reason={reason}
          busy={busy}
          onReason={setReason}
          onCancel={() => { setModal(null); setReason(''); }}
          onConfirm={runAction}
        />
      )}
    </main>
  );
}
