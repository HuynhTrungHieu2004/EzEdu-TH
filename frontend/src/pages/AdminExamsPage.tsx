import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminContentApi } from '../api/adminContentApi';
import type { AdminExamListParams, AdminExamListResponse, ContentStatus } from '../types/adminContent';
import { Badge, EmptyState, Pagination, dateEnd, dateStart, fmtDateTime, fmtNumber } from './AdminContentShared';
import './AdminContentPages.css';

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

  return (
    <main className="admin-content-page">
      <header className="admin-content-header">
        <div>
          <h1>Quản lý đề thi</h1>
          <p>Danh sách đề thi được suy ra từ question_sets hiện có của hệ thống.</p>
        </div>
      </header>

      <section className="admin-content-toolbar">
        <label className="admin-content-field"><span>Tìm kiếm</span><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Tên đề hoặc tài liệu nguồn" /></label>
        <label className="admin-content-field"><span>User ID</span><input value={userId} onChange={(event) => { setUserId(event.target.value); setPage(1); }} /></label>
        <label className="admin-content-field"><span>Trạng thái</span><select value={status} onChange={(event) => { setStatus(event.target.value as ContentStatus); setPage(1); }}><option value="active">Đang hoạt động</option><option value="deleted">Đã xóa</option><option value="all">Tất cả</option></select></label>
        <label className="admin-content-field"><span>Từ ngày</span><input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} /></label>
        <label className="admin-content-field"><span>Đến ngày</span><input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} /></label>
      </section>

      {error && <EmptyState title="Có lỗi" text={error} />}
      {loading && <EmptyState title="Đang tải" text="Đang lấy dữ liệu đề thi từ backend." />}
      {!loading && data && data.items.length === 0 && <EmptyState title="Chưa có đề thi phù hợp" text="Không có dữ liệu giả để hiển thị." />}

      {!loading && data && data.items.length > 0 && (
        <>
          <div className="admin-content-table-wrap">
            <table className="admin-content-table">
              <thead><tr><th>Tên đề</th><th>Chủ sở hữu</th><th>Số câu</th><th>Ngày tạo</th><th>Lần xuất gần nhất</th><th>Trạng thái</th><th>Nguồn</th></tr></thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td data-label="Tên đề"><div className="admin-content-title-cell"><strong>{item.name}</strong><span className="admin-content-muted">{item.id}</span></div></td>
                    <td data-label="Chủ sở hữu">{item.owner.full_name || item.owner.email || item.owner.id || 'Không có dữ liệu'}</td>
                    <td data-label="Số câu">{fmtNumber(item.question_count)}</td>
                    <td data-label="Ngày tạo">{fmtDateTime(item.created_at)}</td>
                    <td data-label="Lần xuất gần nhất">{fmtDateTime(item.last_exported_at)}</td>
                    <td data-label="Trạng thái"><Badge tone={item.status === 'deleted' ? 'danger' : 'ok'}>{item.status}</Badge></td>
                    <td data-label="Nguồn">{item.source_document_name || item.source_document_id || 'Không có dữ liệu'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} totalPages={data.total_pages} total={data.total} onPage={setPage} />
        </>
      )}
    </main>
  );
}
