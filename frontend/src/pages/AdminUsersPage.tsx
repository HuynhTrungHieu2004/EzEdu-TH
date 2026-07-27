import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminUsersApi } from '../api/adminUsersApi';
import { authApi } from '../api/authApi';
import type { UserResponse } from '../types/auth';
import type {
  AdminRole,
  AdminUserCreatePayload,
  AdminUserDetail,
  AdminUserListParams,
  AdminUserListResponse,
  AdminUserStatisticsResponse,
  AdminUserStatus,
} from '../types/adminUsers';
import { hasPermission, permissionsForRole } from '../utils/adminPermissions';
import './AdminUsersPage.css';

type LoadState = 'loading' | 'error' | 'ok';
type ActionKind = 'lock' | 'unlock' | 'delete' | 'restore' | 'forceLogout' | 'resetPassword' | 'role' | 'quota';

const ROLES: AdminRole[] = ['super_admin', 'admin', 'moderator', 'support', 'analyst', 'lecturer', 'student', 'user'];
const ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  moderator: 'Moderator',
  support: 'Support',
  analyst: 'Analyst',
  lecturer: 'Giảng viên',
  student: 'Học sinh',
  user: 'Người dùng',
};
const STATUS_LABELS: Record<AdminUserStatus, string> = {
  active: 'Hoạt động',
  locked: 'Đã khóa',
  deleted: 'Đã xóa',
};

function fmtNumber(value: number | undefined) {
  return (value ?? 0).toLocaleString('vi-VN');
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return 'Không có dữ liệu';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short', hour12: false });
}

function toIsoDateStart(value: string) {
  return value ? new Date(`${value}T00:00:00+07:00`).toISOString() : undefined;
}

function toIsoDateEnd(value: string) {
  return value ? new Date(`${value}T23:59:59.999+07:00`).toISOString() : undefined;
}

function isObjectId(value: string) {
  return /^[a-f\d]{24}$/i.test(value.trim());
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="admin-user-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
    </div>
  );
}

function EmptyData({ title, text }: { title: string; text: string }) {
  return (
    <div className="admin-user-empty">
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

interface ConfirmState {
  kind: ActionKind;
  user: AdminUserDetail;
  nextRole?: AdminRole;
  quotaText?: string;
}

function ConfirmModal({
  state,
  busy,
  reason,
  onReasonChange,
  onRoleChange,
  onQuotaChange,
  onCancel,
  onConfirm,
  roleOptions,
}: {
  state: ConfirmState;
  busy: boolean;
  reason: string;
  onReasonChange: (value: string) => void;
  onRoleChange: (value: AdminRole) => void;
  onQuotaChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  roleOptions: AdminRole[];
}) {
  const reasonRequired = ['lock', 'delete', 'role', 'quota'].includes(state.kind);
  const labels: Record<ActionKind, string> = {
    lock: 'Khóa tài khoản',
    unlock: 'Mở khóa tài khoản',
    delete: 'Xóa mềm tài khoản',
    restore: 'Khôi phục tài khoản',
    forceLogout: 'Buộc đăng xuất',
    resetPassword: 'Đặt lại mật khẩu',
    role: 'Thay đổi vai trò',
    quota: 'Điều chỉnh quota',
  };

  return (
    <div className="admin-user-modal-backdrop" role="presentation">
      <section className="admin-user-modal" role="dialog" aria-modal="true" aria-labelledby="admin-user-confirm-title">
        <h3 id="admin-user-confirm-title">{labels[state.kind]}</h3>
        <p>
          Người dùng bị ảnh hưởng: <strong>{state.user.full_name}</strong>
          <span className="admin-user-muted"> · {state.user.email}</span>
        </p>

        {state.kind === 'role' && (
          <label className="admin-user-field">
            <span>Vai trò mới</span>
            <select value={state.nextRole} onChange={(event) => onRoleChange(event.target.value as AdminRole)}>
              {roleOptions.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
            </select>
          </label>
        )}

        {state.kind === 'quota' && (
          <label className="admin-user-field">
            <span>Quota JSON</span>
            <textarea value={state.quotaText || '{}'} onChange={(event) => onQuotaChange(event.target.value)} rows={6} />
          </label>
        )}

        {reasonRequired && (
          <label className="admin-user-field">
            <span>Lý do</span>
            <textarea value={reason} onChange={(event) => onReasonChange(event.target.value)} rows={3} placeholder="Nhập lý do thao tác" />
          </label>
        )}

        {state.kind === 'resetPassword' && (
          <p className="admin-user-warning">Mật khẩu tạm sẽ chỉ hiển thị một lần sau khi đặt lại.</p>
        )}

        <div className="admin-user-modal-actions">
          <button type="button" className="admin-action-btn" onClick={onCancel} disabled={busy}>Hủy</button>
          <button
            type="button"
            className="admin-action-btn admin-action-btn--danger"
            onClick={onConfirm}
            disabled={busy || (reasonRequired && !reason.trim())}
          >
            {busy ? 'Đang xử lý...' : 'Xác nhận'}
          </button>
        </div>
      </section>
    </div>
  );
}

function EditUserModal({
  user,
  busy,
  onCancel,
  onSubmit,
}: {
  user: AdminUserDetail;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (payload: { full_name: string; email: string; email_verified: boolean }) => void;
}) {
  const [fullName, setFullName] = useState(user.full_name);
  const [email, setEmail] = useState(user.email);
  const [verified, setVerified] = useState(user.email_verified);

  return (
    <div className="admin-user-modal-backdrop" role="presentation">
      <form
        className="admin-user-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-user-edit-title"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit({ full_name: fullName.trim(), email: email.trim(), email_verified: verified });
        }}
      >
        <h3 id="admin-user-edit-title">Chỉnh sửa người dùng</h3>
        <label className="admin-user-field">
          <span>Họ tên</span>
          <input value={fullName} onChange={(event) => setFullName(event.target.value)} required />
        </label>
        <label className="admin-user-field">
          <span>Email</span>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label className="admin-user-check">
          <input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} />
          <span>Email đã xác minh</span>
        </label>
        <div className="admin-user-modal-actions">
          <button type="button" className="admin-action-btn" onClick={onCancel} disabled={busy}>Hủy</button>
          <button type="submit" className="admin-action-btn admin-action-btn--primary" disabled={busy}>Lưu</button>
        </div>
      </form>
    </div>
  );
}

function CreateUserModal({
  busy,
  roleOptions,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  roleOptions: AdminRole[];
  onCancel: () => void;
  onSubmit: (payload: AdminUserCreatePayload) => void;
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AdminRole>(roleOptions.includes('user') ? 'user' : roleOptions[0]);
  const [password, setPassword] = useState('');
  const [verified, setVerified] = useState(false);

  return (
    <div className="admin-user-modal-backdrop" role="presentation">
      <form
        className="admin-user-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-user-create-title"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit({
            full_name: fullName.trim(),
            email: email.trim(),
            role,
            temporary_password: password.trim(),
            email_verified: verified,
          });
        }}
      >
        <h3 id="admin-user-create-title">Tạo người dùng</h3>
        <label className="admin-user-field">
          <span>Họ tên</span>
          <input value={fullName} onChange={(event) => setFullName(event.target.value)} required />
        </label>
        <label className="admin-user-field">
          <span>Email</span>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label className="admin-user-field">
          <span>Vai trò</span>
          <select value={role} onChange={(event) => setRole(event.target.value as AdminRole)}>
            {roleOptions.map((option) => <option key={option} value={option}>{ROLE_LABELS[option]}</option>)}
          </select>
        </label>
        <label className="admin-user-field">
          <span>Mật khẩu tạm</span>
          <input
            type="password"
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        <label className="admin-user-check">
          <input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} />
          <span>Email đã xác minh</span>
        </label>
        <div className="admin-user-modal-actions">
          <button type="button" className="admin-action-btn" onClick={onCancel} disabled={busy}>Hủy</button>
          <button type="submit" className="admin-action-btn admin-action-btn--primary" disabled={busy}>Tạo</button>
        </div>
      </form>
    </div>
  );
}

export default function AdminUsersPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>('loading');
  const [stats, setStats] = useState<AdminUserStatisticsResponse | null>(null);
  const [list, setList] = useState<AdminUserListResponse | null>(null);
  const [rowDetails, setRowDetails] = useState<Record<string, AdminUserDetail>>({});
  const [currentUser, setCurrentUser] = useState<UserResponse | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [editUser, setEditUser] = useState<AdminUserDetail | null>(null);
  const [createUser, setCreateUser] = useState(false);
  const [reason, setReason] = useState('');
  const [passwordResult, setPasswordResult] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    search: '',
    role: 'all',
    status: 'all',
    created_from: '',
    created_to: '',
    last_login_from: '',
    last_login_to: '',
    sort_by: 'created_at',
    sort_order: 'desc',
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const permissions = useMemo(
    () => permissionsForRole(currentUser?.role, currentUser?.permissions_override || []),
    [currentUser],
  );

  const can = useCallback((permission: Parameters<typeof hasPermission>[1]) => permissions.has(permission), [permissions]);
  const roleOptions = useMemo(
    () => (currentUser?.role === 'super_admin' ? ROLES : ROLES.filter((role) => role !== 'super_admin')),
    [currentUser?.role],
  );

  const load = useCallback(() => {
    const ctrl = new AbortController();
    setState('loading');
    setError(null);
    setPasswordResult(null);

    Promise.all([
      authApi.getMe(),
      adminUsersApi.statistics(ctrl.signal),
      isObjectId(appliedFilters.search)
        ? adminUsersApi.detail(appliedFilters.search.trim(), ctrl.signal).then((detail) => ({
          items: [detail],
          total: 1,
          page: 1,
          page_size: pageSize,
          total_pages: 1,
          generated_at: new Date().toISOString(),
        }))
        : adminUsersApi.list({
          page,
          page_size: pageSize,
          search: appliedFilters.search.trim() || undefined,
          role: appliedFilters.role === 'all' ? undefined : appliedFilters.role as AdminRole,
          status: appliedFilters.status === 'all' ? undefined : appliedFilters.status as AdminUserStatus,
          created_from: toIsoDateStart(appliedFilters.created_from),
          created_to: toIsoDateEnd(appliedFilters.created_to),
          last_login_from: toIsoDateStart(appliedFilters.last_login_from),
          last_login_to: toIsoDateEnd(appliedFilters.last_login_to),
          sort_by: appliedFilters.sort_by as AdminUserListParams['sort_by'],
          sort_order: appliedFilters.sort_order as AdminUserListParams['sort_order'],
        }, ctrl.signal),
    ])
      .then(([me, statsData, listData]) => {
        setCurrentUser(me);
        setStats(statsData);
        setList(listData);
        setState('ok');
        return Promise.allSettled(listData.items.map((item) => adminUsersApi.detail(item.id, ctrl.signal)));
      })
      .then((details) => {
        const next: Record<string, AdminUserDetail> = {};
        details.forEach((item) => {
          if (item.status === 'fulfilled') next[item.value.id] = item.value;
        });
        setRowDetails(next);
      })
      .catch((err) => {
        if (err?.name === 'CanceledError') return;
        setState('error');
        setError('Không thể tải danh sách người dùng.');
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

  const canTouch = (user: AdminUserDetail) => {
    if (!currentUser) return false;
    if (user.role === 'super_admin' && currentUser.role !== 'super_admin') return false;
    return true;
  };

  const dangerousSelf = (user: AdminUserDetail, kind: ActionKind) => {
    return user.id === currentUser?.id && ['lock', 'delete'].includes(kind);
  };

  const openConfirm = (kind: ActionKind, user: AdminUserDetail) => {
    setReason('');
    setNotice(null);
    setPasswordResult(null);
    setConfirm({
      kind,
      user,
      nextRole: user.role,
      quotaText: JSON.stringify(user.current_quota || {}, null, 2),
    });
  };

  const runConfirm = async () => {
    if (!confirm) return;
    setBusy(true);
    setNotice(null);
    setPasswordResult(null);
    try {
      if (confirm.kind === 'lock') await adminUsersApi.lock(confirm.user.id, reason.trim());
      else if (confirm.kind === 'unlock') await adminUsersApi.unlock(confirm.user.id);
      else if (confirm.kind === 'delete') await adminUsersApi.softDelete(confirm.user.id, reason.trim());
      else if (confirm.kind === 'restore') await adminUsersApi.restore(confirm.user.id);
      else if (confirm.kind === 'forceLogout') await adminUsersApi.forceLogout(confirm.user.id);
      else if (confirm.kind === 'resetPassword') {
        const result = await adminUsersApi.resetPassword(confirm.user.id);
        setPasswordResult(result.temporary_password);
      } else if (confirm.kind === 'role' && confirm.nextRole) {
        await adminUsersApi.changeRole(confirm.user.id, confirm.nextRole, reason.trim());
      } else if (confirm.kind === 'quota') {
        const parsed = JSON.parse(confirm.quotaText || '{}') as Record<string, unknown>;
        await adminUsersApi.updateQuota(confirm.user.id, { current_quota: parsed, reason: reason.trim() });
      }
      setNotice(`Đã thực hiện thao tác cho ${confirm.user.email}.`);
      setConfirm(null);
      load();
    } catch {
      setError('Thao tác không thành công. Vui lòng kiểm tra quyền hoặc dữ liệu nhập.');
    } finally {
      setBusy(false);
    }
  };

  const submitEdit = async (payload: { full_name: string; email: string; email_verified: boolean }) => {
    if (!editUser) return;
    setBusy(true);
    try {
      await adminUsersApi.update(editUser.id, payload);
      setNotice(`Đã cập nhật ${payload.email}.`);
      setEditUser(null);
      load();
    } catch {
      setError('Không thể cập nhật người dùng.');
    } finally {
      setBusy(false);
    }
  };

  const submitCreate = async (payload: AdminUserCreatePayload) => {
    setBusy(true);
    try {
      await adminUsersApi.create(payload);
      setNotice(`Đã tạo người dùng ${payload.email}.`);
      setCreateUser(false);
      setPage(1);
      load();
    } catch {
      setError('Không thể tạo người dùng. Vui lòng kiểm tra email, vai trò hoặc quyền truy cập.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-users-page">
      <header className="admin-header admin-users-heading">
        <div>
          <h1>Quản lý người dùng</h1>
          <p className="admin-subtitle">Tìm kiếm, hỗ trợ và quản trị tài khoản theo RBAC.</p>
        </div>
        {can('users.create') && (
          <button type="button" className="admin-action-btn admin-action-btn--primary" onClick={() => setCreateUser(true)}>
            Tạo người dùng
          </button>
        )}
      </header>

      {stats && (
        <section className="admin-user-stat-grid" aria-label="Thống kê người dùng">
          <StatTile label="Tổng người dùng" value={fmtNumber(stats.total_users)} />
          <StatTile label="Hoạt động 24 giờ" value={fmtNumber(stats.active_last_24_hours)} />
          <StatTile label="Người dùng mới 7 ngày" value={fmtNumber(stats.users_created_last_7_days)} />
          <StatTile label="Tài khoản bị khóa" value={fmtNumber(stats.locked_users)} />
          <StatTile label="Tài khoản đã xóa" value={fmtNumber(stats.deleted_users)} />
        </section>
      )}

      <section className="admin-users-panel">
        <form className="admin-user-filters" onSubmit={submitFilters}>
          <label>
            <span>Tìm kiếm</span>
            <input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Tên, email hoặc ID" />
          </label>
          <label>
            <span>Role</span>
            <select value={filters.role} onChange={(event) => { setPage(1); setFilters({ ...filters, role: event.target.value }); }}>
              <option value="all">Tất cả</option>
              {ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
            </select>
          </label>
          <label>
            <span>Trạng thái</span>
            <select value={filters.status} onChange={(event) => { setPage(1); setFilters({ ...filters, status: event.target.value }); }}>
              <option value="all">Tất cả</option>
              <option value="active">Hoạt động</option>
              <option value="locked">Đã khóa</option>
              <option value="deleted">Đã xóa</option>
            </select>
          </label>
          <label>
            <span>Đăng ký từ</span>
            <input type="date" value={filters.created_from} onChange={(event) => setFilters({ ...filters, created_from: event.target.value })} />
          </label>
          <label>
            <span>Đăng ký đến</span>
            <input type="date" value={filters.created_to} onChange={(event) => setFilters({ ...filters, created_to: event.target.value })} />
          </label>
          <label>
            <span>Login từ</span>
            <input type="date" value={filters.last_login_from} onChange={(event) => setFilters({ ...filters, last_login_from: event.target.value })} />
          </label>
          <label>
            <span>Login đến</span>
            <input type="date" value={filters.last_login_to} onChange={(event) => setFilters({ ...filters, last_login_to: event.target.value })} />
          </label>
          <label>
            <span>Sắp xếp</span>
            <select value={filters.sort_by} onChange={(event) => setFilters({ ...filters, sort_by: event.target.value })}>
              <option value="created_at">Ngày đăng ký</option>
              <option value="last_login_at">Đăng nhập gần nhất</option>
              <option value="email">Email</option>
              <option value="full_name">Họ tên</option>
              <option value="role">Vai trò</option>
              <option value="status">Trạng thái</option>
            </select>
          </label>
          <label>
            <span>Thứ tự</span>
            <select value={filters.sort_order} onChange={(event) => setFilters({ ...filters, sort_order: event.target.value })}>
              <option value="desc">Giảm dần</option>
              <option value="asc">Tăng dần</option>
            </select>
          </label>
          <button type="submit" className="admin-action-btn admin-action-btn--primary">Lọc</button>
        </form>

        {notice && <p className="admin-inline-notice" role="status">{notice}</p>}
        {passwordResult && (
          <p className="admin-user-password-result" role="status">
            Mật khẩu tạm: <strong>{passwordResult}</strong>
          </p>
        )}
        {error && <div className="panel-error" role="alert">{error}</div>}

        {state === 'loading' && <p className="panel-loading">Đang tải người dùng...</p>}
        {state === 'error' && <EmptyData title="Không tải được dữ liệu" text="Vui lòng thử lại hoặc kiểm tra quyền truy cập." />}
        {state === 'ok' && list && list.items.length === 0 && <EmptyData title="Không có người dùng phù hợp" text="Thử thay đổi bộ lọc hoặc khoảng thời gian." />}

        {state === 'ok' && list && list.items.length > 0 && (
          <>
            <div className="admin-users-table-wrap">
              <table className="admin-users-table">
                <thead>
                  <tr>
                    <th>Họ tên</th>
                    <th>Email</th>
                    <th>Vai trò</th>
                    <th>Trạng thái</th>
                    <th>Ngày đăng ký</th>
                    <th>Đăng nhập gần nhất</th>
                    <th>Tài liệu</th>
                    <th>Câu hỏi</th>
                    <th>AI usage</th>
                    <th>Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {list.items.map((item) => {
                    const detail = rowDetails[item.id];
                    const row = detail || item;
                    return (
                      <tr key={item.id}>
                        <td data-label="Họ tên"><strong>{row.full_name}</strong><small>{row.id}</small></td>
                        <td data-label="Email">{row.email}</td>
                        <td data-label="Vai trò">{ROLE_LABELS[row.role] || row.role}</td>
                        <td data-label="Trạng thái">
                          <span className={`admin-user-status admin-user-status--${row.status}`}>{STATUS_LABELS[row.status]}</span>
                        </td>
                        <td data-label="Ngày đăng ký">{fmtDateTime(row.created_at)}</td>
                        <td data-label="Đăng nhập gần nhất">{fmtDateTime(row.last_login_at)}</td>
                        <td data-label="Tài liệu">{detail ? fmtNumber(detail.document_count) : '...'}</td>
                        <td data-label="Câu hỏi">{detail ? fmtNumber(detail.question_count) : '...'}</td>
                        <td data-label="AI usage">{detail ? `${fmtNumber(detail.ai_request_count)} req` : '...'}</td>
                        <td data-label="Hành động">
                          <div className="admin-user-actions">
                            <button type="button" className="admin-action-btn" onClick={() => navigate(`/admin/users/${item.id}`)}>Xem</button>
                            {detail && can('users.update') && canTouch(detail) && (
                              <button type="button" className="admin-action-btn" onClick={() => setEditUser(detail)}>Sửa</button>
                            )}
                            {detail && can('users.lock') && canTouch(detail) && !dangerousSelf(detail, detail.status === 'locked' ? 'unlock' : 'lock') && detail.status !== 'deleted' && (
                              <button type="button" className="admin-action-btn" onClick={() => openConfirm(detail.status === 'locked' ? 'unlock' : 'lock', detail)}>
                                {detail.status === 'locked' ? 'Mở khóa' : 'Khóa'}
                              </button>
                            )}
                            {detail && can('users.change_role') && canTouch(detail) && (
                              <button type="button" className="admin-action-btn" onClick={() => openConfirm('role', detail)}>Role</button>
                            )}
                            {detail && can('users.manage_quota') && canTouch(detail) && (
                              <button type="button" className="admin-action-btn" onClick={() => openConfirm('quota', detail)}>Quota</button>
                            )}
                            {detail && can('users.reset_password') && canTouch(detail) && detail.status !== 'deleted' && (
                              <button type="button" className="admin-action-btn" onClick={() => openConfirm('resetPassword', detail)}>Reset MK</button>
                            )}
                            {detail && can('users.update') && canTouch(detail) && detail.status !== 'deleted' && (
                              <button type="button" className="admin-action-btn" onClick={() => openConfirm('forceLogout', detail)}>Logout</button>
                            )}
                            {detail && can('users.delete') && canTouch(detail) && detail.status !== 'deleted' && !dangerousSelf(detail, 'delete') && (
                              <button type="button" className="admin-action-btn admin-action-btn--danger" onClick={() => openConfirm('delete', detail)}>Xóa</button>
                            )}
                            {detail && can('users.restore') && canTouch(detail) && detail.status === 'deleted' && (
                              <button type="button" className="admin-action-btn admin-action-btn--success" onClick={() => openConfirm('restore', detail)}>Khôi phục</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="admin-user-pagination">
              <span>Trang {list.page}/{Math.max(list.total_pages, 1)} · {fmtNumber(list.total)} người dùng</span>
              <div>
                <button type="button" className="admin-action-btn" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Trước</button>
                <button type="button" className="admin-action-btn" disabled={page >= list.total_pages} onClick={() => setPage((value) => value + 1)}>Sau</button>
              </div>
            </div>
          </>
        )}
      </section>

      {confirm && (
        <ConfirmModal
          state={confirm}
          busy={busy}
          reason={reason}
          onReasonChange={setReason}
          onRoleChange={(nextRole) => setConfirm({ ...confirm, nextRole })}
          onQuotaChange={(quotaText) => setConfirm({ ...confirm, quotaText })}
          onCancel={() => setConfirm(null)}
          onConfirm={runConfirm}
          roleOptions={roleOptions}
        />
      )}
      {editUser && (
        <EditUserModal user={editUser} busy={busy} onCancel={() => setEditUser(null)} onSubmit={submitEdit} />
      )}
      {createUser && (
        <CreateUserModal busy={busy} roleOptions={roleOptions} onCancel={() => setCreateUser(false)} onSubmit={submitCreate} />
      )}
    </div>
  );
}
