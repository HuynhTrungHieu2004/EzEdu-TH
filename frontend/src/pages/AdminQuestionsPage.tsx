import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminContentApi } from '../api/adminContentApi';
import { authApi } from '../api/authApi';
import type { AdminQuestionListParams, AdminQuestionListResponse, AdminQuestionSummary, ContentStatus } from '../types/adminContent';
import { hasPermission } from '../utils/adminPermissions';
import { Badge, EmptyState, Pagination, ReasonModal, dateEnd, dateStart, fmtDateTime } from './AdminContentShared';
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
  const [regenerateTarget, setRegenerateTarget] = useState<AdminQuestionSummary | null>(null);
  const [reason, setReason] = useState('');
  const [regenerateReason, setRegenerateReason] = useState('');
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

  const regenerate = async () => {
    if (!regenerateTarget || busy) return;
    setBusy(true);
    try {
      await adminContentApi.regenerateQuestion(regenerateTarget.id, regenerateReason.trim());
      setRegenerateTarget(null);
      setRegenerateReason('');
      load();
    } catch (err: unknown) {
      setError(apiErrorMessage(err, 'Backend hiện chưa hỗ trợ sinh lại câu hỏi đơn lẻ.'));
    } finally {
      setBusy(false);
    }
  };

  const columns: DataTableColumn<AdminQuestionSummary>[] = [
    {
      key: 'question',
      label: 'Câu hỏi',
      render: (item) => (
        <div className="ez-datatable-cell-title">
          <strong>{item.question_preview || 'Không có nội dung'}</strong>
          <span className="ez-muted">{item.id}</span>
        </div>
      ),
    },
    {
      key: 'type_difficulty',
      label: 'Loại/độ khó',
      render: (item) => <>{item.question_type || 'Không có dữ liệu'}<br /><span className="ez-muted">{item.difficulty || 'Không có dữ liệu'}</span></>,
    },
    {
      key: 'subject_topic',
      label: 'Môn/chủ đề',
      render: (item) => <>{item.subject || 'Không có dữ liệu'}<br /><span className="ez-muted">{item.topic || 'Không có dữ liệu'}</span></>,
    },
    { key: 'source', label: 'Nguồn', render: (item) => item.source_document_name || item.source_document_id || 'Không có dữ liệu' },
    { key: 'owner', label: 'Chủ sở hữu', render: (item) => item.owner.full_name || item.owner.email || item.owner.id || 'Không có dữ liệu' },
    { key: 'citation', label: 'Citation', render: (item) => item.citation_status || 'Không có dữ liệu' },
    { key: 'risk', label: 'Rủi ro', render: (item) => item.hallucination_risk || 'Không có dữ liệu' },
    {
      key: 'moderation',
      label: 'Kiểm duyệt',
      render: (item) => (
        <Badge tone={item.deleted_at ? 'danger' : item.moderation_status === 'approved' ? 'ok' : 'info'}>
          {item.deleted_at ? 'deleted' : item.moderation_status}
        </Badge>
      ),
    },
    { key: 'created_at', label: 'Ngày tạo', render: (item) => fmtDateTime(item.created_at) },
    {
      key: 'actions',
      label: 'Hành động',
      render: (item) => (
        <div className="ez-datatable-cell-actions">
          <Button variant="outline" size="sm" onClick={() => navigate(`/admin/questions/${encodeURIComponent(item.id)}`)}>Xem</Button>
          {canUpdate && !item.deleted_at && <Button variant="outline" size="sm" disabled={busy} onClick={() => moderate(item)}>Đã kiểm duyệt</Button>}
          {canRegenerate && !item.deleted_at && <Button variant="outline" size="sm" disabled={busy} onClick={() => setRegenerateTarget(item)}>Sinh lại</Button>}
          {canDelete && !item.deleted_at && <Button variant="danger" size="sm" onClick={() => setDeleteTarget(item)}>Xóa mềm</Button>}
          {canUpdate && item.deleted_at && <Button variant="outline" size="sm" disabled={busy} onClick={() => restoreQuestion(item)}>Khôi phục</Button>}
        </div>
      ),
    },
  ];

  return (
    <div className="ez-admin-page">
      <PageHeader
        title="Quản lý câu hỏi"
        description="Kiểm duyệt, chỉnh sửa và theo dõi nguồn dẫn chứng của câu hỏi đã sinh."
      />

      <Card>
        <CardBody>
          <FilterBar columns={5}>
            <FormField label="Tìm kiếm">
              <Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Nội dung câu hỏi" />
            </FormField>
            <FormField label="User ID">
              <Input value={userId} onChange={(event) => { setUserId(event.target.value); setPage(1); }} />
            </FormField>
            <FormField label="Document ID">
              <Input value={documentId} onChange={(event) => { setDocumentId(event.target.value); setPage(1); }} />
            </FormField>
            <FormField label="Loại câu hỏi">
              <Input value={questionType} onChange={(event) => { setQuestionType(event.target.value); setPage(1); }} placeholder="multiple_choice..." />
            </FormField>
            <FormField label="Độ khó">
              <Input value={difficulty} onChange={(event) => { setDifficulty(event.target.value); setPage(1); }} placeholder="easy, medium, hard" />
            </FormField>
            <FormField label="Kiểm duyệt">
              <Input value={moderationStatus} onChange={(event) => { setModerationStatus(event.target.value); setPage(1); }} placeholder="draft, approved..." />
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
          {loading && <EmptyState title="Đang tải" text="Đang lấy dữ liệu câu hỏi từ backend." />}
          {!loading && data && data.items.length === 0 && <EmptyState title="Chưa có câu hỏi phù hợp" text="Không có dữ liệu giả để hiển thị." />}

          {!loading && data && data.items.length > 0 && (
            <>
              <DataTable columns={columns} data={data.items} rowKey={(item) => item.id} minWidth={1200} />
              <Pagination page={data.page} totalPages={data.total_pages} total={data.total} onPage={setPage} />
            </>
          )}
        </CardBody>
      </Card>

      {deleteTarget && (
        <ReasonModal
          title="Xóa mềm câu hỏi"
          target={deleteTarget.question_preview || deleteTarget.id}
          reason={reason}
          busy={busy}
          consequence="Câu hỏi sẽ bị ẩn khỏi các luồng sử dụng cho tới khi được khôi phục."
          confirmationText="XÓA"
          onReason={setReason}
          onCancel={() => { setDeleteTarget(null); setReason(''); }}
          onConfirm={deleteQuestion}
        />
      )}
      {regenerateTarget && (
        <ReasonModal
          title="Sinh lại câu hỏi bằng AI"
          target={regenerateTarget.question_preview || regenerateTarget.id}
          reason={regenerateReason}
          busy={busy}
          consequence="Hệ thống sẽ gọi dịch vụ AI cho 1 câu hỏi và thay đổi nội dung hiện tại."
          reversible={false}
          onReason={setRegenerateReason}
          onCancel={() => { setRegenerateTarget(null); setRegenerateReason(''); }}
          onConfirm={regenerate}
        />
      )}
    </div>
  );
}
