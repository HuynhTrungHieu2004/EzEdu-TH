import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { activityLogsApi } from '../api/activityLogsApi';
import { adminUsersApi } from '../api/adminUsersApi';
import { authApi } from '../api/authApi';
import type { UserActivityLogListResponse } from '../types/activityLogs';
import type { AdminUserDetail, AdminUserStatus } from '../types/adminUsers';
import { hasPermission } from '../utils/adminPermissions';
import { activityActionLabel, activityCategoryLabel, activityStatusLabel } from '../utils/activityLogsUi';
import './AdminActivityLogsPage.css';
import './AdminUsersPage.css';

type LoadState = 'loading' | 'denied' | 'error' | 'ok';
type DetailTab = 'overview' | 'activity' | 'documents' | 'questions' | 'ai' | 'sessions';

const TAB_LABELS: Record<DetailTab, string> = {
  overview: 'Tổng quan',
  activity: 'Hoạt động',
  documents: 'Tài liệu',
  questions: 'Câu hỏi',
  ai: 'Sử dụng AI',
  sessions: 'Phiên đăng nhập',
};

const STATUS_LABELS: Record<AdminUserStatus, string> = {
  active: 'Hoạt động',
  locked: 'Đã khóa',
  deleted: 'Đã xóa',
};

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  moderator: 'Moderator',
  support: 'Support',
  analyst: 'Analyst',
  lecturer: 'Giảng viên',
  student: 'Học sinh',
  user: 'Người dùng',
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

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="admin-user-detail-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function UnsupportedTab({ label }: { label: string }) {
  return (
    <div className="admin-user-empty">
      <strong>{label} chưa có API backend</strong>
      <p>EzEdu AI chưa cung cấp endpoint riêng cho tab này, nên giao diện không hiển thị dữ liệu giả.</p>
    </div>
  );
}

export default function AdminUserDetailPage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>('loading');
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [tab, setTab] = useState<DetailTab>('overview');
  const [activityState, setActivityState] = useState<LoadState>('loading');
  const [activityLogs, setActivityLogs] = useState<UserActivityLogListResponse | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    queueMicrotask(() => {
      setState('loading');
      authApi.getMe()
        .then((me) => {
          if (!hasPermission(me.role, 'users.view', me.permissions_override || [])) {
            setState('denied');
            return null;
          }
          if (!userId) {
            setState('error');
            return null;
          }
          return adminUsersApi.detail(userId, ctrl.signal);
        })
        .then((detail) => {
          if (!detail) return;
          setUser(detail);
          setState('ok');
        })
        .catch((error: unknown) => {
          if (typeof error === 'object' && error !== null && 'name' in error && error.name === 'CanceledError') return;
          setState('error');
        });
    });

    return () => ctrl.abort();
  }, [userId]);

  const quotaText = useMemo(() => JSON.stringify(user?.current_quota || {}, null, 2), [user?.current_quota]);

  useEffect(() => {
    if (tab !== 'activity' || !userId) return;
    const ctrl = new AbortController();
    queueMicrotask(() => {
      setActivityState('loading');
      activityLogsApi.userActivity(userId, { page: 1, page_size: 20 }, ctrl.signal)
        .then((response) => {
          setActivityLogs(response);
          setActivityState('ok');
        })
        .catch((error: unknown) => {
          if (typeof error === 'object' && error !== null && 'name' in error && error.name === 'CanceledError') return;
          setActivityState('error');
        });
    });
    return () => ctrl.abort();
  }, [tab, userId]);

  return (
    <div className="admin-users-page">
      <header className="admin-header admin-users-heading">
        <div>
          <button type="button" className="admin-user-link" onClick={() => navigate('/admin/users')}>
            Quay lại danh sách
          </button>
          <h1>Chi tiết người dùng</h1>
          {user && <p className="admin-subtitle">{user.full_name} · {user.email}</p>}
        </div>
      </header>

      {state === 'loading' && <p className="panel-loading">Đang tải chi tiết người dùng...</p>}
      {state === 'denied' && (
        <div className="admin-users-panel">
          <div className="admin-user-empty">
            <strong>Không có quyền xem người dùng</strong>
            <p>Tài khoản hiện tại không có permission users.view.</p>
          </div>
        </div>
      )}
      {state === 'error' && (
        <div className="admin-users-panel">
          <div className="panel-error" role="alert">Không thể tải chi tiết người dùng.</div>
        </div>
      )}

      {state === 'ok' && user && (
        <>
          <section className="admin-user-profile">
            <div>
              <span className={`admin-user-status admin-user-status--${user.status}`}>{STATUS_LABELS[user.status]}</span>
              <h2>{user.full_name}</h2>
              <p>{user.email}</p>
            </div>
            <dl>
              <div>
                <dt>Vai trò</dt>
                <dd>{ROLE_LABELS[user.role] || user.role}</dd>
              </div>
              <div>
                <dt>ID</dt>
                <dd>{user.id}</dd>
              </div>
            </dl>
          </section>

          <nav className="admin-user-tabs" aria-label="User detail tabs">
            {(Object.keys(TAB_LABELS) as DetailTab[]).map((item) => (
              <button
                key={item}
                type="button"
                className={tab === item ? 'admin-user-tab admin-user-tab--active' : 'admin-user-tab'}
                onClick={() => setTab(item)}
              >
                {TAB_LABELS[item]}
              </button>
            ))}
          </nav>

          <section className="admin-users-panel">
            {tab === 'overview' ? (
              <>
                <div className="admin-user-detail-grid">
                  <DetailMetric label="Tài liệu" value={fmtNumber(user.document_count)} />
                  <DetailMetric label="Câu hỏi" value={fmtNumber(user.question_count)} />
                  <DetailMetric label="Hội thoại" value={fmtNumber(user.conversation_count)} />
                  <DetailMetric label="AI requests" value={fmtNumber(user.ai_request_count)} />
                  <DetailMetric label="Tổng token" value={fmtNumber(user.token_usage.total_tokens)} />
                  <DetailMetric label="Email xác minh" value={user.email_verified ? 'Có' : 'Chưa'} />
                </div>

                <div className="admin-user-detail-sections">
                  <section>
                    <h3>Thông tin tài khoản</h3>
                    <dl className="admin-user-kv">
                      <div><dt>Ngày đăng ký</dt><dd>{fmtDateTime(user.created_at)}</dd></div>
                      <div><dt>Cập nhật</dt><dd>{fmtDateTime(user.updated_at)}</dd></div>
                      <div><dt>Đăng nhập gần nhất</dt><dd>{fmtDateTime(user.last_login_at)}</dd></div>
                      <div><dt>Xóa mềm</dt><dd>{fmtDateTime(user.deleted_at)}</dd></div>
                      <div><dt>Đang hoạt động</dt><dd>{user.is_active ? 'Có' : 'Không'}</dd></div>
                    </dl>
                  </section>

                  <section>
                    <h3>Quota hiện tại</h3>
                    <pre className="admin-user-json">{quotaText}</pre>
                  </section>
                </div>
              </>
            ) : tab === 'activity' ? (
              <>
                {activityState === 'loading' && <p className="panel-loading">Đang tải hoạt động...</p>}
                {activityState === 'error' && (
                  <div className="admin-user-empty">
                    <strong>Không tải được hoạt động</strong>
                    <p>Vui lòng kiểm tra quyền activity_logs.view hoặc thử lại.</p>
                  </div>
                )}
                {activityState === 'ok' && activityLogs && activityLogs.items.length === 0 && (
                  <div className="admin-user-empty">
                    <strong>Chưa có hoạt động</strong>
                    <p>Người dùng này chưa có activity log được ghi nhận.</p>
                  </div>
                )}
                {activityState === 'ok' && activityLogs && activityLogs.items.length > 0 && (
                  <div className="activity-table-wrap">
                    <table className="activity-table">
                      <thead>
                        <tr>
                          <th>Thời gian</th>
                          <th>Action</th>
                          <th>Category</th>
                          <th>Status</th>
                          <th>Resource</th>
                          <th>Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activityLogs.items.map((item) => (
                          <tr key={item.id}>
                            <td data-label="Thời gian">{fmtDateTime(item.timestamp)}</td>
                            <td data-label="Action">{activityActionLabel(item.action)}</td>
                            <td data-label="Category">{activityCategoryLabel(item.category)}</td>
                            <td data-label="Status">
                              <span className={`activity-status activity-status--${item.status}`}>{activityStatusLabel(item.status)}</span>
                            </td>
                            <td data-label="Resource">{item.resource_type || '-'}<small>{item.resource_id || ''}</small></td>
                            <td data-label="Error">{item.error_code || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : (
              <UnsupportedTab label={TAB_LABELS[tab]} />
            )}
          </section>
        </>
      )}
    </div>
  );
}
