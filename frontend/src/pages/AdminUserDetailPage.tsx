import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { activityLogsApi } from '../api/activityLogsApi';
import { adminUsersApi } from '../api/adminUsersApi';
import { authApi } from '../api/authApi';
import type { UserActivityLogListResponse } from '../types/activityLogs';
import type { AdminUserDetail, AdminUserStatus } from '../types/adminUsers';
import { hasPermission } from '../utils/adminPermissions';
import { activityActionLabel, activityCategoryLabel, activityStatusLabel } from '../utils/activityLogsUi';
import { fmtDateTime, fmtNumber, ROLE_LABELS, USER_STATUS_LABELS } from '../utils/adminUtils';
import {
  Badge,
  Card, CardBody,
  DataTable,
  EmptyState, ErrorState,
  PageHeader,
  PermissionDeniedState,
  SkeletonText,
  StatGrid, StatTile,
  Tabs,
} from '../components/ui';
import type { DataTableColumn, TabItem } from '../components/ui';

type LoadState = 'loading' | 'denied' | 'error' | 'ok';
type DetailTab = 'overview' | 'activity' | 'documents' | 'questions' | 'ai' | 'sessions';

const DETAIL_TABS: TabItem[] = [
  { id: 'overview', label: 'Tổng quan' },
  { id: 'activity', label: 'Hoạt động' },
  { id: 'documents', label: 'Tài liệu' },
  { id: 'questions', label: 'Câu hỏi' },
  { id: 'ai', label: 'Sử dụng AI' },
  { id: 'sessions', label: 'Phiên đăng nhập' },
];

const STATUS_BADGE_MAP: Record<AdminUserStatus, 'success' | 'warning' | 'error'> = {
  active: 'success',
  locked: 'warning',
  deleted: 'error',
};

export default function AdminUserDetailPage() {
  const { userId } = useParams();
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

  /* ── Activity table columns ─────────────────────────────────────────── */
  type ActivityItem = UserActivityLogListResponse['items'][number];

  const activityColumns: DataTableColumn<ActivityItem>[] = useMemo(() => [
    { key: 'timestamp', label: 'Thời gian', render: (item: ActivityItem) => fmtDateTime(item.timestamp) },
    { key: 'action', label: 'Action', render: (item: ActivityItem) => activityActionLabel(item.action) },
    { key: 'category', label: 'Category', render: (item: ActivityItem) => activityCategoryLabel(item.category) },
    {
      key: 'status',
      label: 'Status',
      render: (item: ActivityItem) => (
        <Badge variant={item.status === 'success' ? 'success' : item.status === 'failure' || item.status === 'denied' ? 'error' : 'warning'}>
          {activityStatusLabel(item.status)}
        </Badge>
      ),
    },
    { key: 'resource', label: 'Resource', render: (item: ActivityItem) => <>{item.resource_type || '-'}<small>{item.resource_id || ''}</small></> },
    { key: 'error', label: 'Error', render: (item: ActivityItem) => item.error_code || '-' },
  ], []);

  return (
    <div className="ez-admin-page">
      <PageHeader
        title="Chi tiết người dùng"
        description={user ? `${user.full_name} · ${user.email}` : undefined}
        backTo="/admin/users"
        backLabel="Quay lại danh sách"
      />

      {state === 'loading' && <SkeletonText lines={8} />}
      {state === 'denied' && (
        <PermissionDeniedState
          title="Không có quyền xem người dùng"
          description="Tài khoản hiện tại không có permission users.view."
        />
      )}
      {state === 'error' && (
        <ErrorState
          title="Không thể tải chi tiết người dùng"
          description="Vui lòng kiểm tra quyền hoặc thử lại."
        />
      )}

      {state === 'ok' && user && (
        <>
          {/* Profile card */}
          <Card>
            <CardBody>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <Badge variant={STATUS_BADGE_MAP[user.status]}>{USER_STATUS_LABELS[user.status]}</Badge>
                  <h2 style={{ margin: '0.5rem 0 0.2rem', fontSize: '1.45rem' }}>{user.full_name}</h2>
                  <p className="ez-muted" style={{ margin: 0 }}>{user.email}</p>
                </div>
                <dl className="ez-kv-grid" style={{ minWidth: 250 }}>
                  <div>
                    <dt>Vai trò</dt>
                    <dd>{ROLE_LABELS[user.role] || user.role}</dd>
                  </div>
                  <div>
                    <dt>ID</dt>
                    <dd>{user.id}</dd>
                  </div>
                </dl>
              </div>
            </CardBody>
          </Card>

          {/* Tabs */}
          <Tabs
            items={DETAIL_TABS}
            value={tab}
            onChange={(id) => setTab(id as DetailTab)}
            ariaLabel="Chi tiết người dùng"
          />

          <Card>
            <CardBody>
              {tab === 'overview' ? (
                <>
                  <StatGrid>
                    <StatTile label="Tài liệu" value={fmtNumber(user.document_count)} />
                    <StatTile label="Câu hỏi" value={fmtNumber(user.question_count)} />
                    <StatTile label="Hội thoại" value={fmtNumber(user.conversation_count)} />
                    <StatTile label="AI requests" value={fmtNumber(user.ai_request_count)} />
                    <StatTile label="Tổng token" value={fmtNumber(user.token_usage.total_tokens)} />
                    <StatTile label="Email xác minh" value={user.email_verified ? 'Có' : 'Chưa'} />
                  </StatGrid>

                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 0.8fr)', gap: '1rem', marginTop: '1rem' }}>
                    <Card>
                      <CardBody>
                        <h3 style={{ margin: '0 0 0.8rem' }}>Thông tin tài khoản</h3>
                        <dl className="ez-kv-grid">
                          <div><dt>Ngày đăng ký</dt><dd>{fmtDateTime(user.created_at)}</dd></div>
                          <div><dt>Cập nhật</dt><dd>{fmtDateTime(user.updated_at)}</dd></div>
                          <div><dt>Đăng nhập gần nhất</dt><dd>{fmtDateTime(user.last_login_at)}</dd></div>
                          <div><dt>Xóa mềm</dt><dd>{fmtDateTime(user.deleted_at)}</dd></div>
                          <div><dt>Đang hoạt động</dt><dd>{user.is_active ? 'Có' : 'Không'}</dd></div>
                        </dl>
                      </CardBody>
                    </Card>

                    <Card>
                      <CardBody>
                        <h3 style={{ margin: '0 0 0.8rem' }}>Quota hiện tại</h3>
                        <pre className="ez-pre">{quotaText}</pre>
                      </CardBody>
                    </Card>
                  </div>
                </>
              ) : tab === 'activity' ? (
                <>
                  {activityState === 'loading' && <SkeletonText lines={4} />}
                  {activityState === 'error' && (
                    <ErrorState
                      title="Không tải được hoạt động"
                      description="Vui lòng kiểm tra quyền activity_logs.view hoặc thử lại."
                      compact
                    />
                  )}
                  {activityState === 'ok' && activityLogs && activityLogs.items.length === 0 && (
                    <EmptyState
                      title="Chưa có hoạt động"
                      description="Người dùng này chưa có activity log được ghi nhận."
                      compact
                    />
                  )}
                  {activityState === 'ok' && activityLogs && activityLogs.items.length > 0 && (
                    <DataTable
                      columns={activityColumns}
                      data={activityLogs.items}
                      rowKey={(item) => item.id}
                      minWidth={800}
                    />
                  )}
                </>
              ) : (
                <EmptyState
                  title={`${DETAIL_TABS.find((t) => t.id === tab)?.label || tab} chưa có API backend`}
                  description="EzEdu AI chưa cung cấp endpoint riêng cho tab này, nên giao diện không hiển thị dữ liệu giả."
                  compact
                />
              )}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
