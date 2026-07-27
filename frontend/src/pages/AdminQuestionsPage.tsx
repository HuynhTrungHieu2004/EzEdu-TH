import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminContentApi } from '../api/adminContentApi';
import { authApi } from '../api/authApi';
import type { AdminQuestionListParams, AdminQuestionListResponse, AdminQuestionSummary, ContentStatus } from '../types/adminContent';
import { hasPermission } from '../utils/adminPermissions';
import { Badge, EmptyState, Pagination, ReasonModal, dateEnd, dateStart, fmtDateTime } from './AdminContentShared';
import { apiErrorMessage, isCanceledError } from '../utils/apiError';
import './AdminContentPages.css';

export default function AdminQuestionsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<AdminQuestionListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [role, setRole] = useState<string>();
  const [overrides, setOverrides] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ContentStatus>('active');
  const [userId, setUserId] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [questionType, setQuestionType] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [moderationStatus, setModerationStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<AdminQuestionSummary | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const canUpdate = hasPermission(role, 'questions.update', overrides);
  const canDelete = hasPermission(role, 'questions.delete', overrides);
  const canRegenerate = hasPermission(role, 'questions.regenerate', overrides);

  useEffect(() => {
    authApi.getMe().then((user) => {
      setRole(user.role);
      setOverrides(user.permissions_override || []);
    }).catch(() => undefined);
  }, []);

  const params = useMemo<AdminQuestionListParams>(() => ({
    page,
    page_size: 20,
    search: search || undefined,
    user_id: userId || undefined,
    document_id: documentId || undefined,
    question_type: questionType || undefined,
    difficulty: difficulty || undefined,
    moderation_status: moderationStatus || undefined,
    status,
    created_from: dateStart(from),
    created_to: dateEnd(to),
    sort_order: 'desc',
  }), [difficulty, documentId, from, moderationStatus, page, questionType, search, status, to, userId]);

  const load = useCallback((signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    adminContentApi.listQuestions(params, signal)
      .then(setData)
      .catch((err) => {
        if (!isCanceledError(err)) setError(apiErrorMessage(err, 'Không tải được danh sách câu hỏi.'));
      })
      .finally(() => setLoading(false));
  }, [params]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => load(controller.signal));
    return () => controller.abort();
  }, [load]);

  const deleteQuestion = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await adminContentApi.deleteQuestion(deleteTarget.id, reason);
      setDeleteTarget(null);
      setReason('');
      load();
    } catch (err: unknown) {
      setError(apiErrorMessage(err, 'Không xóa được câu hỏi.'));
    } finally {
      setBusy(false);
    }
  };

  const restoreQuestion = async (item: AdminQuestionSummary) => {
    setBusy(true);
    try {
      await adminContentApi.restoreQuestion(item.id);
      load();
    } catch (err: unknown) {
      setError(apiErrorMessage(err, 'Không khôi phục được câu hỏi.'));
    } finally {
      setBusy(false);
    }
  };

  const moderate = async (item: AdminQuestionSummary) => {
    setBusy(true);
    try {
      await adminContentApi.moderateQuestion(item.id, 'approved');
      load();
    } catch (err: unknown) {
      setError(apiErrorMessage(err, 'Không cập nhật kiểm duyệt.'));
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async (item: AdminQuestionSummary) => {
    setBusy(true);
    try {
      await adminContentApi.regenerateQuestion(item.id, 'Admin requested regeneration');
      load();
    } catch (err: unknown) {
      setError(apiErrorMessage(err, 'Backend hiện chưa hỗ trợ sinh lại câu hỏi đơn lẻ.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="admin-content-page">
      <header className="admin-content-header">
        <div>
          <h1>Quản lý câu hỏi</h1>
          <p>Kiểm duyệt, chỉnh sửa và theo dõi nguồn dẫn chứng của câu hỏi đã sinh.</p>
        </div>
      </header>

      <section className="admin-content-toolbar">
        <label className="admin-content-field"><span>Tìm kiếm</span><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Nội dung câu hỏi" /></label>
        <label className="admin-content-field"><span>User ID</span><input value={userId} onChange={(event) => { setUserId(event.target.value); setPage(1); }} /></label>
        <label className="admin-content-field"><span>Document ID</span><input value={documentId} onChange={(event) => { setDocumentId(event.target.value); setPage(1); }} /></label>
        <label className="admin-content-field"><span>Loại câu hỏi</span><input value={questionType} onChange={(event) => { setQuestionType(event.target.value); setPage(1); }} placeholder="multiple_choice..." /></label>
        <label className="admin-content-field"><span>Độ khó</span><input value={difficulty} onChange={(event) => { setDifficulty(event.target.value); setPage(1); }} placeholder="easy, medium, hard" /></label>
        <label className="admin-content-field"><span>Kiểm duyệt</span><input value={moderationStatus} onChange={(event) => { setModerationStatus(event.target.value); setPage(1); }} placeholder="draft, approved..." /></label>
        <label className="admin-content-field"><span>Trạng thái</span><select value={status} onChange={(event) => { setStatus(event.target.value as ContentStatus); setPage(1); }}><option value="active">Đang hoạt động</option><option value="deleted">Đã xóa</option><option value="all">Tất cả</option></select></label>
        <label className="admin-content-field"><span>Từ ngày</span><input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} /></label>
        <label className="admin-content-field"><span>Đến ngày</span><input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} /></label>
      </section>

      {error && <EmptyState title="Có lỗi" text={error} />}
      {loading && <EmptyState title="Đang tải" text="Đang lấy dữ liệu câu hỏi từ backend." />}
      {!loading && data && data.items.length === 0 && <EmptyState title="Chưa có câu hỏi phù hợp" text="Không có dữ liệu giả để hiển thị." />}

      {!loading && data && data.items.length > 0 && (
        <>
          <div className="admin-content-table-wrap">
            <table className="admin-content-table">
              <thead><tr><th>Câu hỏi</th><th>Loại/độ khó</th><th>Môn/chủ đề</th><th>Nguồn</th><th>Chủ sở hữu</th><th>Citation</th><th>Rủi ro</th><th>Kiểm duyệt</th><th>Ngày tạo</th><th>Hành động</th></tr></thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td data-label="Câu hỏi"><div className="admin-content-title-cell"><strong>{item.question_preview || 'Không có nội dung'}</strong><span className="admin-content-muted">{item.id}</span></div></td>
                    <td data-label="Loại/độ khó">{item.question_type || 'Không có dữ liệu'}<br /><span className="admin-content-muted">{item.difficulty || 'Không có dữ liệu'}</span></td>
                    <td data-label="Môn/chủ đề">{item.subject || 'Không có dữ liệu'}<br /><span className="admin-content-muted">{item.topic || 'Không có dữ liệu'}</span></td>
                    <td data-label="Nguồn">{item.source_document_name || item.source_document_id || 'Không có dữ liệu'}</td>
                    <td data-label="Chủ sở hữu">{item.owner.full_name || item.owner.email || item.owner.id || 'Không có dữ liệu'}</td>
                    <td data-label="Citation">{item.citation_status || 'Không có dữ liệu'}</td>
                    <td data-label="Rủi ro">{item.hallucination_risk || 'Không có dữ liệu'}</td>
                    <td data-label="Kiểm duyệt"><Badge tone={item.deleted_at ? 'danger' : item.moderation_status === 'approved' ? 'ok' : 'info'}>{item.deleted_at ? 'deleted' : item.moderation_status}</Badge></td>
                    <td data-label="Ngày tạo">{fmtDateTime(item.created_at)}</td>
                    <td data-label="Hành động"><div className="admin-content-actions">
                      <button className="admin-content-btn" type="button" onClick={() => navigate(`/admin/questions/${encodeURIComponent(item.id)}`)}>Xem</button>
                      {canUpdate && !item.deleted_at && <button className="admin-content-btn" type="button" disabled={busy} onClick={() => moderate(item)}>Đã kiểm duyệt</button>}
                      {canRegenerate && !item.deleted_at && <button className="admin-content-btn" type="button" disabled={busy} onClick={() => regenerate(item)}>Sinh lại</button>}
                      {canDelete && !item.deleted_at && <button className="admin-content-btn admin-content-btn--danger" type="button" onClick={() => setDeleteTarget(item)}>Xóa mềm</button>}
                      {canUpdate && item.deleted_at && <button className="admin-content-btn" type="button" disabled={busy} onClick={() => restoreQuestion(item)}>Khôi phục</button>}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} totalPages={data.total_pages} total={data.total} onPage={setPage} />
        </>
      )}

      {deleteTarget && (
        <ReasonModal
          title="Xóa mềm câu hỏi"
          target={deleteTarget.question_preview || deleteTarget.id}
          reason={reason}
          busy={busy}
          onReason={setReason}
          onCancel={() => { setDeleteTarget(null); setReason(''); }}
          onConfirm={deleteQuestion}
        />
      )}
    </main>
  );
}
