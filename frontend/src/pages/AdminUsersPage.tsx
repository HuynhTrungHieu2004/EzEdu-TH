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
  AdminUserSummary,
} from '../types/adminUsers';
import { hasPermission, permissionsForRole } from '../utils/adminPermissions';
import { fmtDateTime, fmtNumber, dateStart, dateEnd, ROLE_LABELS, USER_STATUS_LABELS } from '../utils/adminUtils';
import {
  Alert,
  Badge,
  Button,
  Card, CardBody,
  Checkbox,
  DataTable,
  Dialog,
  EmptyState, ErrorState,
  FilterBar,
  FormField,
  Input,
  PageHeader,
  Pagination,
  Select,
  SkeletonText,
  StatGrid, StatTile,
  Textarea,
} from '../components/ui';
import type { DataTableColumn } from '../components/ui';

type LoadState = 'loading' | 'error' | 'ok';
type ActionKind = 'lock' | 'unlock' | 'delete' | 'restore' | 'forceLogout' | 'resetPassword' | 'role' | 'quota';

const ROLES: AdminRole[] = ['super_admin', 'admin', 'moderator', 'support', 'analyst', 'lecturer', 'student', 'user'];

const ACTION_LABELS: Record<ActionKind, string> = {
  lock: 'Khóa tài khoản',
  unlock: 'Mở khóa tài khoản',
  delete: 'Xóa mềm tài khoản',
  restore: 'Khôi phục tài khoản',
  forceLogout: 'Buộc đăng xuất',
  resetPassword: 'Đặt lại mật khẩu',
  role: 'Thay đổi vai trò',
  quota: 'Điều chỉnh quota',
};

const STATUS_BADGE_MAP: Record<AdminUserStatus, 'success' | 'warning' | 'error'> = {
  active: 'success',
  locked: 'warning',
  deleted: 'error',
};

function isObjectId(value: string) {
  return /^[a-f\d]{24}$/i.test(value.trim());
}

/* ── Modals ────────────────────────────────────────────────────────────── */

interface ConfirmState {
  kind: ActionKind;
  /** Đủ dùng cho hộp thoại: các số đếm chỉ nằm ở cột riêng, không nằm trong hộp thoại. */
  user: AdminUserSummary;
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
  const typedConfirmationRequired = ['delete', 'resetPassword'].includes(state.kind);
  const [typedConfirmation, setTypedConfirmation] = useState('');
  const typedConfirmationMatches = !typedConfirmationRequired || typedConfirmation === state.user.email;

  return (
    <Dialog
      open
      onClose={busy ? () => undefined : onCancel}
      title={ACTION_LABELS[state.kind]}
      description={`${state.user.full_name} · ${state.user.email}. ${state.kind === 'delete'
        ? 'Tài khoản sẽ bị vô hiệu hóa và chỉ quản trị viên có quyền mới khôi phục được.'
        : state.kind === 'resetPassword'
          ? 'Mật khẩu hiện tại sẽ ngừng hoạt động và không thể khôi phục.'
          : 'Thao tác được áp dụng ngay và ghi vào nhật ký quản trị.'}`}
      closeOnOverlayClick={!busy}
      footer={
        <>
          <Button variant="outline" disabled={busy} onClick={onCancel}>Hủy</Button>
          <Button
            variant="danger"
            disabled={busy || (reasonRequired && !reason.trim()) || !typedConfirmationMatches}
            loading={busy}
            onClick={onConfirm}
          >
            Xác nhận
          </Button>
        </>
      }
    >
      {state.kind === 'role' && (
        <FormField label="Vai trò mới">
          <Select
            value={state.nextRole}
            onChange={(event) => onRoleChange(event.target.value as AdminRole)}
          >
            {roleOptions.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
          </Select>
        </FormField>
      )}

      {state.kind === 'quota' && (
        <FormField label="Quota JSON">
          <Textarea
            value={state.quotaText || '{}'}
            onChange={(event) => onQuotaChange(event.target.value)}
            rows={6}
          />
        </FormField>
      )}

      {reasonRequired && (
        <FormField label="Lý do">
          <Textarea
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            rows={3}
            placeholder="Nhập lý do thao tác"
          />
        </FormField>
      )}

      {state.kind === 'resetPassword' && (
        <Alert tone="warning">Mật khẩu tạm sẽ chỉ hiển thị một lần sau khi đặt lại.</Alert>
      )}

      {typedConfirmationRequired && (
        <FormField
          label="Nhập email người dùng để xác nhận"
          error={typedConfirmation && !typedConfirmationMatches ? 'Email xác nhận chưa khớp.' : undefined}
        >
          <Input
            value={typedConfirmation}
            onChange={(event) => setTypedConfirmation(event.target.value)}
            autoComplete="off"
            invalid={Boolean(typedConfirmation && !typedConfirmationMatches)}
          />
        </FormField>
      )}
    </Dialog>
  );
}

function EditUserModal({
  user,
  busy,
  onCancel,
  onSubmit,
}: {
  user: AdminUserSummary;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (payload: { full_name: string; email: string; email_verified: boolean }) => void;
}) {
  const [fullName, setFullName] = useState(user.full_name);
  const [email, setEmail] = useState(user.email);
  const [verified, setVerified] = useState(user.email_verified);

  return (
    <Dialog
      open
      onClose={onCancel}
      title="Chỉnh sửa người dùng"
      closeOnOverlayClick={!busy}
      footer={
        <>
          <Button variant="outline" disabled={busy} onClick={onCancel}>Hủy</Button>
          <Button
            variant="primary"
            disabled={busy || !fullName.trim() || !email.trim()}
            loading={busy}
            onClick={() => onSubmit({ full_name: fullName.trim(), email: email.trim(), email_verified: verified })}
          >
            Lưu
          </Button>
        </>
      }
    >
      <FormField label="Họ tên" required>
        <Input value={fullName} onChange={(event) => setFullName(event.target.value)} />
      </FormField>
      <FormField label="Email" required>
        <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
      </FormField>
      <Checkbox
        checked={verified}
        onChange={(event) => setVerified(event.target.checked)}
        label="Email đã xác minh"
      />
    </Dialog>
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

  const handleSubmit = () => {
    onSubmit({
      full_name: fullName.trim(),
      email: email.trim(),
      role,
      temporary_password: password.trim(),
      email_verified: verified,
    });
  };

  return (
    <Dialog
      open
      onClose={onCancel}
      title="Tạo người dùng"
      closeOnOverlayClick={!busy}
      footer={
        <>
          <Button variant="outline" disabled={busy} onClick={onCancel}>Hủy</Button>
          <Button
            variant="primary"
            disabled={busy || !fullName.trim() || !email.trim() || password.trim().length < 6}
            loading={busy}
            onClick={handleSubmit}
          >
            Tạo
          </Button>
        </>
      }
    >
      <FormField label="Họ tên" required>
        <Input value={fullName} onChange={(event) => setFullName(event.target.value)} />
      </FormField>
      <FormField label="Email" required>
        <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
      </FormField>
      <FormField label="Vai trò">
        <Select value={role} onChange={(event) => setRole(event.target.value as AdminRole)}>
          {roleOptions.map((option) => <option key={option} value={option}>{ROLE_LABELS[option]}</option>)}
        </Select>
      </FormField>
      <FormField label="Mật khẩu tạm" required hint="Ít nhất 6 ký tự">
        <Input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </FormField>
      <Checkbox
        checked={verified}
        onChange={(event) => setVerified(event.target.checked)}
        label="Email đã xác minh"
      />
    </Dialog>
  );
}

/* ── Main page ─────────────────────────────────────────────────────────── */

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
  const [editUser, setEditUser] = useState<AdminUserSummary | null>(null);
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
          created_from: dateStart(appliedFilters.created_from),
          created_to: dateEnd(appliedFilters.created_to),
          last_login_from: dateStart(appliedFilters.last_login_from),
          last_login_to: dateEnd(appliedFilters.last_login_to),
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

  const canTouch = useCallback((user: AdminUserSummary) => {
    if (!currentUser) return false;
    if (user.role === 'super_admin' && currentUser.role !== 'super_admin') return false;
    return true;
  }, [currentUser]);

  const dangerousSelf = useCallback((user: AdminUserSummary, kind: ActionKind) => {
    return user.id === currentUser?.id && ['lock', 'delete'].includes(kind);
  }, [currentUser?.id]);

  const openConfirm = useCallback((kind: ActionKind, user: AdminUserSummary) => {
    setReason('');
    setNotice(null);
    setPasswordResult(null);
    setConfirm({
      kind,
      user,
      nextRole: user.role,
      quotaText: JSON.stringify(user.current_quota || {}, null, 2),
    });
  }, []);

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

  /* ── Table columns definition ─────────────────────────────────────────── */

  type RowItem = AdminUserListResponse['items'][number];

  const columns: DataTableColumn<RowItem>[] = useMemo(() => [
    {
      key: 'full_name',
      label: 'Họ tên',
      render: (item: RowItem) => {
        const row = rowDetails[item.id] || item;
        return (
          <div className="ez-datatable-cell-title">
            <strong>{row.full_name}</strong>
            <span className="ez-muted">{row.id}</span>
          </div>
        );
      },
    },
    { key: 'email', label: 'Email', render: (item: RowItem) => (rowDetails[item.id] || item).email },
    { key: 'role', label: 'Vai trò', render: (item: RowItem) => { const r = (rowDetails[item.id] || item).role; return ROLE_LABELS[r] || r; } },
    {
      key: 'status',
      label: 'Trạng thái',
      render: (item: RowItem) => {
        const row = rowDetails[item.id] || item;
        return <Badge variant={STATUS_BADGE_MAP[row.status]}>{USER_STATUS_LABELS[row.status]}</Badge>;
      },
    },
    { key: 'created_at', label: 'Ngày đăng ký', render: (item: RowItem) => fmtDateTime((rowDetails[item.id] || item).created_at) },
    { key: 'last_login_at', label: 'Đăng nhập gần nhất', render: (item: RowItem) => fmtDateTime((rowDetails[item.id] || item).last_login_at) },
    { key: 'documents', label: 'Tài liệu', render: (item: RowItem) => { const d = rowDetails[item.id]; return d ? fmtNumber(d.document_count) : '...'; } },
    { key: 'questions', label: 'Câu hỏi', render: (item: RowItem) => { const d = rowDetails[item.id]; return d ? fmtNumber(d.question_count) : '...'; } },
    { key: 'ai_usage', label: 'AI usage', render: (item: RowItem) => { const d = rowDetails[item.id]; return d ? `${fmtNumber(d.ai_request_count)} req` : '...'; } },
    {
      key: 'actions',
      label: 'Hành động',
      render: (item: RowItem) => {
        // Dòng danh sách đã đủ để quyết định nút nào hiện; chờ `rowDetails` thì
        // với backend thật cả cột "Hành động" trống cho tới khi request từng
        // dòng về (stub trả tức thì nên trước đây không thấy).
        const detail = rowDetails[item.id] ?? item;
        return (
          <div className="ez-datatable-cell-actions">
            <Button variant="outline" size="sm" onClick={() => navigate(`/admin/users/${item.id}`)}>Xem</Button>
            {can('users.update') && canTouch(detail) && (
              <Button variant="outline" size="sm" onClick={() => setEditUser(detail)}>Sửa</Button>
            )}
            {can('users.lock') && canTouch(detail) && !dangerousSelf(detail, detail.status === 'locked' ? 'unlock' : 'lock') && detail.status !== 'deleted' && (
              <Button variant="outline" size="sm" onClick={() => openConfirm(detail.status === 'locked' ? 'unlock' : 'lock', detail)}>
                {detail.status === 'locked' ? 'Mở khóa' : 'Khóa'}
              </Button>
            )}
            {can('users.change_role') && canTouch(detail) && (
              <Button variant="outline" size="sm" onClick={() => openConfirm('role', detail)}>Role</Button>
            )}
            {can('users.manage_quota') && canTouch(detail) && (
              <Button variant="outline" size="sm" onClick={() => openConfirm('quota', detail)}>Quota</Button>
            )}
            {can('users.reset_password') && canTouch(detail) && detail.status !== 'deleted' && (
              <Button variant="outline" size="sm" onClick={() => openConfirm('resetPassword', detail)}>Reset MK</Button>
            )}
            {can('users.update') && canTouch(detail) && detail.status !== 'deleted' && (
              <Button variant="outline" size="sm" onClick={() => openConfirm('forceLogout', detail)}>Logout</Button>
            )}
            {can('users.delete') && canTouch(detail) && detail.status !== 'deleted' && !dangerousSelf(detail, 'delete') && (
              <Button variant="danger" size="sm" onClick={() => openConfirm('delete', detail)}>Xóa</Button>
            )}
            {can('users.restore') && canTouch(detail) && detail.status === 'deleted' && (
              <Button variant="secondary" size="sm" onClick={() => openConfirm('restore', detail)}>Khôi phục</Button>
            )}
          </div>
        );
      },
    },
  ], [rowDetails, can, canTouch, dangerousSelf, navigate, openConfirm]);

  return (
    <div className="ez-admin-page">
      <PageHeader
        title="Quản lý người dùng"
        description="Tìm kiếm, hỗ trợ và quản trị tài khoản theo RBAC."
        actions={
          can('users.create') ? (
            <Button variant="primary" onClick={() => setCreateUser(true)}>Tạo người dùng</Button>
          ) : undefined
        }
      />

      {stats && (
        <StatGrid aria-label="Thống kê người dùng">
          <StatTile label="Tổng người dùng" value={fmtNumber(stats.total_users)} />
          <StatTile label="Hoạt động 24 giờ" value={fmtNumber(stats.active_last_24_hours)} />
          <StatTile label="Người dùng mới 7 ngày" value={fmtNumber(stats.users_created_last_7_days)} />
          <StatTile label="Tài khoản bị khóa" value={fmtNumber(stats.locked_users)} />
          <StatTile label="Tài khoản đã xóa" value={fmtNumber(stats.deleted_users)} />
        </StatGrid>
      )}

      <Card>
        <CardBody>
          <FilterBar columns={5} onSubmit={submitFilters}>
            <FormField label="Tìm kiếm">
              <Input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Tên, email hoặc ID" />
            </FormField>
            <FormField label="Role">
              <Select value={filters.role} onChange={(event) => { setPage(1); setFilters({ ...filters, role: event.target.value }); }}>
                <option value="all">Tất cả</option>
                {ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
              </Select>
            </FormField>
            <FormField label="Trạng thái">
              <Select value={filters.status} onChange={(event) => { setPage(1); setFilters({ ...filters, status: event.target.value }); }}>
                <option value="all">Tất cả</option>
                <option value="active">Hoạt động</option>
                <option value="locked">Đã khóa</option>
                <option value="deleted">Đã xóa</option>
              </Select>
            </FormField>
            <FormField label="Đăng ký từ">
              <Input type="date" value={filters.created_from} onChange={(event) => setFilters({ ...filters, created_from: event.target.value })} />
            </FormField>
            <FormField label="Đăng ký đến">
              <Input type="date" value={filters.created_to} onChange={(event) => setFilters({ ...filters, created_to: event.target.value })} />
            </FormField>
            <FormField label="Login từ">
              <Input type="date" value={filters.last_login_from} onChange={(event) => setFilters({ ...filters, last_login_from: event.target.value })} />
            </FormField>
            <FormField label="Login đến">
              <Input type="date" value={filters.last_login_to} onChange={(event) => setFilters({ ...filters, last_login_to: event.target.value })} />
            </FormField>
            <FormField label="Sắp xếp">
              <Select value={filters.sort_by} onChange={(event) => setFilters({ ...filters, sort_by: event.target.value })}>
                <option value="created_at">Ngày đăng ký</option>
                <option value="last_login_at">Đăng nhập gần nhất</option>
                <option value="email">Email</option>
                <option value="full_name">Họ tên</option>
                <option value="role">Vai trò</option>
                <option value="status">Trạng thái</option>
              </Select>
            </FormField>
            <FormField label="Thứ tự">
              <Select value={filters.sort_order} onChange={(event) => setFilters({ ...filters, sort_order: event.target.value })}>
                <option value="desc">Giảm dần</option>
                <option value="asc">Tăng dần</option>
              </Select>
            </FormField>
            <Button type="submit" variant="primary">Lọc</Button>
          </FilterBar>

          {notice && <Alert tone="success" role="status">{notice}</Alert>}
          {passwordResult && (
            <Alert tone="success" role="status">
              Mật khẩu tạm: <strong style={{ fontFamily: 'var(--ez-font-mono)' }}>{passwordResult}</strong>
            </Alert>
          )}
          {error && <Alert tone="error" role="alert">{error}</Alert>}

          {state === 'loading' && <SkeletonText lines={5} />}
          {state === 'error' && (
            <ErrorState
              title="Không tải được dữ liệu"
              description="Vui lòng thử lại hoặc kiểm tra quyền truy cập."
              onRetry={load}
            />
          )}
          {state === 'ok' && list && list.items.length === 0 && (
            <EmptyState
              title="Không có người dùng phù hợp"
              description="Thử thay đổi bộ lọc hoặc khoảng thời gian."
            />
          )}

          {state === 'ok' && list && list.items.length > 0 && (
            <>
              <DataTable
                columns={columns}
                data={list.items}
                rowKey={(item) => item.id}
                minWidth={1020}
              />
              <Pagination
                page={list.page}
                totalPages={list.total_pages}
                total={list.total}
                onPageChange={setPage}
                label="người dùng"
              />
            </>
          )}
        </CardBody>
      </Card>

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
