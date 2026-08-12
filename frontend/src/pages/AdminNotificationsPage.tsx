import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, Send, XCircle } from 'lucide-react';
import { adminNotificationsApi } from '../api/adminNotificationsReportsApi';
import type {
  NotificationAudienceType,
  NotificationItem,
  NotificationPayload,
  NotificationPriority,
  NotificationStatisticsResponse,
  NotificationStatus,
  NotificationType,
} from '../types/adminNotificationsReports';
import { Badge, EmptyState, Pagination, dateEnd, dateStart, fmtDateTime, fmtNumber, ReasonModal } from './AdminContentShared';
import { apiErrorMessage, isCanceledError } from '../utils/apiError';
import { PageHeader } from '../components/ui';
import './AdminContentPages.css';

const TYPE_LABELS: Record<NotificationType, string> = {
  system: 'Toàn hệ thống',
  maintenance_banner: 'Banner bảo trì',
  new_feature: 'Tính năng mới',
  quota_warning: 'Cảnh báo quota',
  private: 'Thông báo riêng',
};

const STATUS_LABELS: Record<NotificationStatus, string> = {
  draft: 'Nháp',
  scheduled: 'Đã lên lịch',
  published: 'Đã xuất bản',
  expired: 'Hết hạn',
  cancelled: 'Đã hủy',
};

const ROLES = ['super_admin', 'admin', 'moderator', 'support', 'analyst', 'lecturer', 'student', 'user'];

function splitCsv(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function statusTone(status: NotificationStatus) {
  return status === 'published' ? 'ok' : status === 'cancelled' || status === 'expired' ? 'danger' : 'info';
}

function emptyForm(): NotificationPayload {
  return {
    title: '',
    content: '',
    type: 'system',
    audience_type: 'all',
    target_roles: [],
    target_user_ids: [],
    priority: 'normal',
    starts_at: null,
    expires_at: null,
    status: 'draft',
  };
}

export default function AdminNotificationsPage() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [stats, setStats] = useState<Partial<NotificationStatisticsResponse>>({});
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [form, setForm] = useState<NotificationPayload>(emptyForm());
  const [roleInput, setRoleInput] = useState('');
  const [userInput, setUserInput] = useState('');
  const [reasonAction, setReasonAction] = useState<{ kind: 'publish' | 'cancel'; item: NotificationItem } | null>(null);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const params = useMemo(() => ({
    page,
    page_size: 30,
    search: search || undefined,
    // Chuỗi rỗng ("Tất cả") phải bỏ hẳn khỏi query — backend khai báo Literal
    // nên nhận "" là 422 và cả danh sách không tải được.
    status: (status || undefined) as NotificationStatus | undefined,
    type: (type || undefined) as NotificationType | undefined,
    created_from: dateStart(from),
    created_to: dateEnd(to),
  }), [from, page, search, status, to, type]);

  const load = useCallback((signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    Promise.all([
      adminNotificationsApi.list(params, signal),
      adminNotificationsApi.statistics(signal),
    ])
      .then(([list, statistics]) => {
        setItems(list.items);
        setTotal(list.total);
        setTotalPages(list.total_pages);
        setStats(statistics);
      })
      .catch((err) => {
        if (!isCanceledError(err)) setError(apiErrorMessage(err, 'Không tải được Notification Center.'));
      })
      .finally(() => setLoading(false));
  }, [params]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => load(controller.signal));
    return () => controller.abort();
  }, [load]);

  const saveDraft = async () => {
    setBusy(true);
    setError('');
    try {
      await adminNotificationsApi.create({
        ...form,
        target_roles: form.audience_type === 'roles' ? splitCsv(roleInput) : [],
        target_user_ids: form.audience_type === 'users' ? splitCsv(userInput) : [],
        starts_at: form.starts_at || null,
        expires_at: form.expires_at || null,
      });
      setForm(emptyForm());
      setRoleInput('');
      setUserInput('');
      load();
    } catch (err: unknown) {
      setError(apiErrorMessage(err, 'Không tạo được thông báo.'));
    } finally {
      setBusy(false);
    }
  };

  const runReasonAction = async () => {
    if (!reasonAction) return;
    setBusy(true);
    setError('');
    try {
      if (reasonAction.kind === 'publish') await adminNotificationsApi.publish(reasonAction.item.id, reason);
      else await adminNotificationsApi.cancel(reasonAction.item.id, reason);
      setReasonAction(null);
      setReason('');
      load();
    } catch (err: unknown) {
      setError(apiErrorMessage(err, 'Không thực hiện được thao tác.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-content-page">
      <PageHeader
        title="Trung tâm thông báo"
        description="Tạo thông báo toàn hệ thống, theo vai trò hoặc theo danh sách người dùng; mọi lần xuất bản đều được ghi nhật ký."
      />

      <section className="admin-content-detail-grid">
        <div className="admin-content-kv"><span>Tổng thông báo</span><strong>{fmtNumber(stats.total)}</strong></div>
        <div className="admin-content-kv"><span>Đã xuất bản</span><strong>{fmtNumber(stats.published)}</strong></div>
        <div className="admin-content-kv"><span>Đã lên lịch</span><strong>{fmtNumber(stats.scheduled)}</strong></div>
        <div className="admin-content-kv"><span>Nháp</span><strong>{fmtNumber(stats.draft)}</strong></div>
        <div className="admin-content-kv"><span>Chưa đọc</span><strong>{fmtNumber(stats.unread_total)}</strong></div>
      </section>

      <section className="admin-content-panel">
        <h2>Tạo thông báo</h2>
        <div className="admin-content-toolbar">
          <label className="admin-content-field"><span>Tiêu đề</span><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
          <label className="admin-content-field"><span>Loại</span><select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as NotificationType })}>{Object.entries(TYPE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label className="admin-content-field"><span>Đối tượng</span><select value={form.audience_type} onChange={(event) => setForm({ ...form, audience_type: event.target.value as NotificationAudienceType })}><option value="all">Toàn hệ thống</option><option value="roles">Theo role</option><option value="users">Danh sách user</option></select></label>
          <label className="admin-content-field"><span>Ưu tiên</span><select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as NotificationPriority })}><option value="low">Thấp</option><option value="normal">Bình thường</option><option value="high">Cao</option><option value="urgent">Khẩn cấp</option></select></label>
          <label className="admin-content-field"><span>Bắt đầu</span><input type="datetime-local" value={form.starts_at || ''} onChange={(event) => setForm({ ...form, starts_at: event.target.value || null })} /></label>
          <label className="admin-content-field"><span>Hết hạn</span><input type="datetime-local" value={form.expires_at || ''} onChange={(event) => setForm({ ...form, expires_at: event.target.value || null })} /></label>
          {form.audience_type === 'roles' && <label className="admin-content-field"><span>Roles</span><input value={roleInput} onChange={(event) => setRoleInput(event.target.value)} placeholder={ROLES.join(', ')} /></label>}
          {form.audience_type === 'users' && <label className="admin-content-field"><span>User IDs</span><input value={userInput} onChange={(event) => setUserInput(event.target.value)} placeholder="id1, id2, id3" /></label>}
        </div>
        <label className="admin-content-field" style={{ marginTop: 12 }}><span>Nội dung</span><textarea rows={4} value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} /></label>
        <div className="admin-content-detail-grid" style={{ marginTop: 12 }}>
          <article className="admin-content-kv">
            <span>Preview</span>
            <strong>{form.title || 'Tiêu đề thông báo'}</strong>
            <small className="admin-content-muted">{form.content || 'Nội dung thông báo sẽ hiển thị ở đây.'}</small>
          </article>
          <article className="admin-content-kv">
            <span>Lịch xuất bản</span>
            <strong>{form.starts_at ? fmtDateTime(form.starts_at) : 'Chưa đặt lịch'}</strong>
            <small className="admin-content-muted">{form.expires_at ? `Hết hạn ${fmtDateTime(form.expires_at)}` : 'Không đặt hết hạn'}</small>
          </article>
        </div>
        <div className="admin-content-actions" style={{ marginTop: 12 }}>
          <button type="button" className="admin-content-btn admin-content-btn--primary" disabled={busy || !form.title.trim() || !form.content.trim()} onClick={saveDraft}>
            <Bell size={15} aria-hidden="true" /> Lưu nháp
          </button>
        </div>
      </section>

      <section className="admin-content-toolbar">
        <label className="admin-content-field"><span>Tìm kiếm</span><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
        <label className="admin-content-field"><span>Trạng thái</span><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">Tất cả</option>{Object.entries(STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="admin-content-field"><span>Loại</span><select value={type} onChange={(event) => { setType(event.target.value); setPage(1); }}><option value="">Tất cả</option>{Object.entries(TYPE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="admin-content-field"><span>Từ ngày</span><input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} /></label>
        <label className="admin-content-field"><span>Đến ngày</span><input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} /></label>
      </section>

      {error && <EmptyState title="Có lỗi" text={error} />}
      {loading && <EmptyState title="Đang tải" text="Đang đọc danh sách thông báo." />}
      {!loading && !items.length && <EmptyState title="Chưa có thông báo" text="Tạo bản nháp đầu tiên để bắt đầu." />}

      {!loading && items.length > 0 && (
        <>
          <div className="admin-content-table-wrap">
            <table className="admin-content-table">
              <thead><tr><th>Thông báo</th><th>Đối tượng</th><th>Ưu tiên</th><th>Lịch</th><th>Trạng thái</th><th>Read</th><th>Hành động</th></tr></thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td data-label="Thông báo"><div className="admin-content-title-cell"><strong>{item.title}</strong><span className="admin-content-muted">{TYPE_LABELS[item.type]}</span></div></td>
                    <td data-label="Đối tượng">{item.audience_type === 'roles' ? item.target_roles.join(', ') : item.audience_type === 'users' ? `${item.target_user_ids.length} user` : 'Toàn hệ thống'}</td>
                    <td data-label="Ưu tiên">{item.priority}</td>
                    <td data-label="Lịch">{fmtDateTime(item.starts_at)}<br /><span className="admin-content-muted">Hết hạn: {fmtDateTime(item.expires_at)}</span></td>
                    <td data-label="Trạng thái"><Badge tone={statusTone(item.status)}>{STATUS_LABELS[item.status]}</Badge></td>
                    <td data-label="Read">{fmtNumber(item.read_count)} đã đọc<br /><span className="admin-content-muted">{fmtNumber(item.unread_count)} chưa đọc / {fmtNumber(item.audience_count)}</span></td>
                    <td data-label="Hành động">
                      <div className="admin-content-actions">
                        {item.status !== 'published' && item.status !== 'cancelled' && item.status !== 'expired' && (
                          <button type="button" className="admin-content-btn" onClick={() => setReasonAction({ kind: 'publish', item })}><Send size={14} aria-hidden="true" /> Xuất bản</button>
                        )}
                        {item.status !== 'cancelled' && item.status !== 'expired' && (
                          <button type="button" className="admin-content-btn admin-content-btn--danger" onClick={() => setReasonAction({ kind: 'cancel', item })}><XCircle size={14} aria-hidden="true" /> Hủy</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} total={total} onPage={setPage} />
        </>
      )}

      {reasonAction && (
        <ReasonModal
          title={reasonAction.kind === 'publish' ? 'Xuất bản thông báo' : 'Hủy thông báo'}
          target={reasonAction.item.title}
          reason={reason}
          busy={busy}
          onReason={setReason}
          onCancel={() => { setReasonAction(null); setReason(''); }}
          onConfirm={runReasonAction}
        />
      )}
    </div>
  );
}
