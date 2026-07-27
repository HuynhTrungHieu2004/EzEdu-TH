import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { authApi } from '../api/authApi';
import { questionApi } from '../api/questionApi';
import { hasPermission, isAdminAreaRole } from '../utils/adminPermissions';
import ThemeToggle from './ThemeToggle';


interface AppLayoutProps {
  children: ReactNode;
}

const AppLayout = ({ children }: AppLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const token = localStorage.getItem('access_token');
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentRole, setCurrentRole] = useState<'student' | 'lecturer' | 'analyst' | 'support' | 'moderator' | 'admin' | 'super_admin' | 'user'>('student');
  const [permissionOverride, setPermissionOverride] = useState<string[]>([]);
  const [currentName, setCurrentName] = useState('');
  const [pendingExamCount, setPendingExamCount] = useState(0);

  useEffect(() => {
    if (!token) {
      return; // token absence handled by state reset below
    }
    let cancelled = false;
    authApi.getMe()
      .then((u) => {
        if (!cancelled) {
          setIsAdmin(isAdminAreaRole(u.role));
          setCurrentRole(u.role || 'student');
          setPermissionOverride(u.permissions_override || []);
          setCurrentName(u.full_name);
          if (u.role === 'student' && !u.student_profile_completed && location.pathname !== '/student-onboarding') {
            navigate('/student-onboarding', { replace: true });
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsAdmin(false);
          setCurrentRole('student');
          setPermissionOverride([]);
        }
      });
    return () => { cancelled = true; };
  }, [token, location.pathname, navigate]);

  useEffect(() => {
    if (!token || currentRole !== 'student' || !currentName) return;
    let cancelled = false;
    questionApi.pendingPublishedCount()
      .then((count) => { if (!cancelled) setPendingExamCount(count); })
      .catch(() => { if (!cancelled) setPendingExamCount(0); });
    return () => { cancelled = true; };
  }, [token, currentRole, currentName, location.pathname]);

  // Reset admin state synchronously when token is removed
  const derivedIsAdmin = token ? isAdmin : false;
  const isLecturerRole = token ? ['lecturer', 'admin', 'super_admin', 'user'].includes(currentRole) : false;
  const isStudentRole = token ? currentRole === 'student' : false;
  const canViewUsers = token ? hasPermission(currentRole, 'users.view', permissionOverride) : false;
  const canViewDashboard = token
    ? hasPermission(currentRole, 'analytics.view', permissionOverride) || hasPermission(currentRole, 'system_health.view', permissionOverride)
    : false;
  const canViewActivityLogs = token ? hasPermission(currentRole, 'activity_logs.view', permissionOverride) : false;
  const canViewAuditLogs = token ? hasPermission(currentRole, 'admin_audit_logs.view', permissionOverride) : false;
  const canViewDocuments = token ? hasPermission(currentRole, 'documents.view', permissionOverride) : false;
  const canViewQuestions = token ? hasPermission(currentRole, 'questions.view', permissionOverride) : false;
  const canViewAI = token ? hasPermission(currentRole, 'ai_usage.view', permissionOverride) : false;
  const canViewWebsiteContent = token ? hasPermission(currentRole, 'website_content.view', permissionOverride) : false;
  const canViewSettings = token ? hasPermission(currentRole, 'system_settings.view', permissionOverride) : false;
  const canManageNotifications = token ? hasPermission(currentRole, 'notifications.manage', permissionOverride) : false;
  const canExportReports = token ? hasPermission(currentRole, 'reports.export', permissionOverride) : false;

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    navigate('/login');
  };

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  return (
    <div className="app-shell">
      {/* ── Crystal Sidebar ── */}
      <aside className="app-sidebar">
        <button type="button" className="sidebar-brand" onClick={() => navigate('/')}>
          <span className="sidebar-brand-icon" translate="no">Ez</span>
          <span className="sidebar-brand-text">
            <h1>EzEdu AI</h1>
            <p>Biến học liệu thành đề thi</p>
          </span>
        </button>

        <div className="sidebar-divider" />

        {token ? (
          <>
            <span className="sidebar-label">Tổng quan</span>
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className={isActive('/dashboard') ? 'nav-item-active' : 'nav-item'}
            >
              <span className="nav-icon">📊</span>
              <span className="nav-label">Dashboard</span>
            </button>

            {isLecturerRole && (
              <>
                <span className="sidebar-label">Giảng viên</span>
                <button
                  type="button"
                  onClick={() => navigate('/documents')}
                  className={isActive('/documents') ? 'nav-item-active' : 'nav-item'}
                >
                  <span className="nav-icon">📚</span>
                  <span className="nav-label">Học liệu &amp; Upload</span>
                </button>

                <button
                  type="button"
                  onClick={() => navigate('/chat-advanced')}
                  className={isActive('/chat-advanced') ? 'nav-item-active' : 'nav-item'}
                >
                  <span className="nav-icon">💬</span>
                  <span className="nav-label">Hỏi đáp AI</span>
                </button>

                <button
                  type="button"
                  onClick={() => navigate('/question-history')}
                  className={isActive('/question-history') ? 'nav-item-active' : 'nav-item'}
                >
                  <span className="nav-icon">📋</span>
                  <span className="nav-label">Ngân hàng câu hỏi</span>
                </button>

                <button
                  type="button"
                  onClick={() => navigate('/classes')}
                  className={isActive('/classes') ? 'nav-item-active' : 'nav-item'}
                >
                  <span className="nav-icon">🏫</span>
                  <span className="nav-label">Lớp học của tôi</span>
                </button>
              </>
            )}

            {isStudentRole && (
              <>
                <span className="sidebar-label">Học sinh</span>
                <button
                  type="button"
                  onClick={() => navigate('/published-questions')}
                  className={isActive('/published-questions') ? 'nav-item-active' : 'nav-item'}
                >
                  <span className="nav-icon">📝</span>
                  <span className="nav-label">Bài thi của bạn</span>
                  {pendingExamCount > 0 && (
                    <span
                      aria-label={`${pendingExamCount} bài thi chưa hoàn thành`}
                      title={`${pendingExamCount} bài thi chưa hoàn thành`}
                      style={{ marginLeft: 'auto', minWidth: '20px', height: '20px', padding: '0 6px', borderRadius: '999px', background: '#ef4444', color: '#fff', fontSize: '11px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      {pendingExamCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/learning-history')}
                  className={isActive('/learning-history') ? 'nav-item-active' : 'nav-item'}
                >
                  <span className="nav-icon">🕘</span>
                  <span className="nav-label">Lịch sử học tập</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/personalization')}
                  className={isActive('/personalization') ? 'nav-item-active' : 'nav-item'}
                >
                  <span className="nav-icon">🎯</span>
                  <span className="nav-label">Cá nhân hóa</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/student-statistics')}
                  className={isActive('/student-statistics') ? 'nav-item-active' : 'nav-item'}
                >
                  <span className="nav-icon">📈</span>
                  <span className="nav-label">Thống kê kết quả</span>
                </button>
              </>
            )}

            <div className="sidebar-divider" />

            {derivedIsAdmin && (
              <>
                <span className="sidebar-label">Quản trị</span>
                {canViewDashboard && (
                  <button
                    type="button"
                    onClick={() => navigate('/admin/dashboard')}
                    className={isActive('/admin/dashboard') ? 'nav-item-active' : 'nav-item'}
                  >
                    <span className="nav-icon">🛡️</span>
                    <span className="nav-label">Dashboard</span>
                  </button>
                )}
                {canViewUsers && (
                  <button
                    type="button"
                    onClick={() => navigate('/admin/users')}
                    className={isActive('/admin/users') ? 'nav-item-active' : 'nav-item'}
                  >
                    <span className="nav-icon">👥</span>
                    <span className="nav-label">Người dùng</span>
                  </button>
                )}
                {canViewDocuments && (
                  <button
                    type="button"
                    onClick={() => navigate('/admin/documents')}
                    className={isActive('/admin/documents') ? 'nav-item-active' : 'nav-item'}
                  >
                    <span className="nav-icon">📄</span>
                    <span className="nav-label">Tài liệu</span>
                  </button>
                )}
                {canViewQuestions && (
                  <>
                    <button
                      type="button"
                      onClick={() => navigate('/admin/questions')}
                      className={isActive('/admin/questions') ? 'nav-item-active' : 'nav-item'}
                    >
                      <span className="nav-icon">❓</span>
                      <span className="nav-label">Câu hỏi</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/admin/exams')}
                      className={isActive('/admin/exams') ? 'nav-item-active' : 'nav-item'}
                    >
                      <span className="nav-icon">📝</span>
                      <span className="nav-label">Đề thi</span>
                    </button>
                  </>
                )}
                {canViewAI && (
                  <button
                    type="button"
                    onClick={() => navigate('/admin/ai')}
                    className={isActive('/admin/ai') ? 'nav-item-active' : 'nav-item'}
                  >
                    <span className="nav-icon">⚡</span>
                    <span className="nav-label">AI</span>
                  </button>
                )}
                {canViewWebsiteContent && (
                  <button
                    type="button"
                    onClick={() => navigate('/admin/website-content')}
                    className={isActive('/admin/website-content') ? 'nav-item-active' : 'nav-item'}
                  >
                    <span className="nav-icon">🌐</span>
                    <span className="nav-label">Website CMS</span>
                  </button>
                )}
                {canViewSettings && (
                  <>
                    <button
                      type="button"
                      onClick={() => navigate('/admin/settings')}
                      className={isActive('/admin/settings') ? 'nav-item-active' : 'nav-item'}
                    >
                      <span className="nav-icon">⚙️</span>
                      <span className="nav-label">Cấu hình</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/admin/feature-flags')}
                      className={isActive('/admin/feature-flags') ? 'nav-item-active' : 'nav-item'}
                    >
                      <span className="nav-icon">🚦</span>
                      <span className="nav-label">Feature Flags</span>
                    </button>
                  </>
                )}
                {canManageNotifications && (
                  <button
                    type="button"
                    onClick={() => navigate('/admin/notifications')}
                    className={isActive('/admin/notifications') ? 'nav-item-active' : 'nav-item'}
                  >
                    <span className="nav-icon">🔔</span>
                    <span className="nav-label">Thông báo</span>
                  </button>
                )}
                {canExportReports && (
                  <button
                    type="button"
                    onClick={() => navigate('/admin/reports')}
                    className={isActive('/admin/reports') ? 'nav-item-active' : 'nav-item'}
                  >
                    <span className="nav-icon">📤</span>
                    <span className="nav-label">Reports</span>
                  </button>
                )}
                {canViewActivityLogs && (
                  <button
                    type="button"
                    onClick={() => navigate('/admin/activity-logs')}
                    className={isActive('/admin/activity-logs') ? 'nav-item-active' : 'nav-item'}
                  >
                    <span className="nav-icon">🕘</span>
                    <span className="nav-label">Nhật ký hoạt động</span>
                  </button>
                )}
                {canViewAuditLogs && (
                  <button
                    type="button"
                    onClick={() => navigate('/admin/audit-logs')}
                    className={isActive('/admin/audit-logs') ? 'nav-item-active' : 'nav-item'}
                  >
                    <span className="nav-icon">🧾</span>
                    <span className="nav-label">Nhật ký quản trị</span>
                  </button>
                )}
              </>
            )}

            {isLecturerRole && (
              <button
                type="button"
                onClick={() => navigate('/generate')}
                className="nav-item-primary"
              >
                <span className="nav-icon" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}>✨</span>
                <span className="nav-label">Sinh đề nhanh</span>
              </button>
            )}

            <div className="sidebar-spacer" />
            <div className="sidebar-divider" />

            <div className="nav-item" aria-label="Hồ sơ hiện tại" style={{ cursor: 'default' }}>
              <span className="nav-icon">👤</span>
              <span className="nav-label">
                <strong style={{ display: 'block' }}>{currentName || 'Người dùng'}</strong>
                <small>{currentRole === 'student' ? 'Học sinh' : derivedIsAdmin ? 'Quản trị' : 'Giảng viên'}</small>
              </span>
            </div>

            <ThemeToggle />

            <div className="sidebar-divider" />

            <button type="button" onClick={handleLogout} className="nav-item-danger">
              <span className="nav-icon" style={{ background: 'rgba(239,68,68,0.08)', color: 'var(--danger)' }}>🚪</span>
              <span className="nav-label">Đăng xuất</span>
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => navigate('/login')}
              className={isActive('/login') ? 'nav-item-active' : 'nav-item'}
            >
              <span className="nav-icon">🔑</span>
              <span className="nav-label">Đăng nhập</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/register')}
              className={isActive('/register') ? 'nav-item-active' : 'nav-item'}
            >
              <span className="nav-icon">📝</span>
              <span className="nav-label">Đăng ký</span>
            </button>
          </>
        )}
      </aside>

      {/* ── Main Content ── */}
      <main className="app-main">{children}</main>
    </div>
  );
};

export default AppLayout;
