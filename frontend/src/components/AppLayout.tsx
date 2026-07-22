import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { authApi } from '../api/authApi';
import { questionApi } from '../api/questionApi';
import ThemeToggle from './ThemeToggle';


interface AppLayoutProps {
  children: ReactNode;
}

const AppLayout = ({ children }: AppLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const token = localStorage.getItem('access_token');
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentRole, setCurrentRole] = useState<'student' | 'lecturer' | 'admin' | 'user'>('student');
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
          setIsAdmin(u.role === 'admin');
          setCurrentRole(u.role || 'student');
          setCurrentName(u.full_name);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsAdmin(false);
          setCurrentRole('student');
        }
      });
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (!token || currentRole !== 'student' || !currentName) return;
    let cancelled = false;
    Promise.all([questionApi.listPublished(), questionApi.listMyLearningHistory()])
      .then(([published, attempts]) => {
        if (cancelled) return;
        const completedIds = new Set(attempts.map((item) => item.question_set_id));
        setPendingExamCount(published.items.filter((item) => !completedIds.has(item.id)).length);
      })
      .catch(() => { if (!cancelled) setPendingExamCount(0); });
    return () => { cancelled = true; };
  }, [token, currentRole, currentName, location.pathname]);

  // Reset admin state synchronously when token is removed
  const derivedIsAdmin = token ? isAdmin : false;
  const isLecturerRole = token ? ['lecturer', 'admin', 'user'].includes(currentRole) : false;
  const isStudentRole = token ? currentRole === 'student' : false;

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
          <span className="sidebar-brand-icon" translate="no">AI</span>
          <span className="sidebar-brand-text">
            <h1>AI Quiz Studio</h1>
            <p>Sinh đề thông minh</p>
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
              </>
            )}

            {isStudentRole && (
              <>
                <span className="sidebar-label">Sinh viên</span>
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
                <button
                  type="button"
                  onClick={() => navigate('/admin/dashboard')}
                  className={isActive('/admin/dashboard') ? 'nav-item-active' : 'nav-item'}
                >
                  <span className="nav-icon">🛡️</span>
                  <span className="nav-label">Admin Dashboard</span>
                </button>
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
                <small>{currentRole === 'student' ? 'Sinh viên' : currentRole === 'admin' ? 'Quản trị viên' : 'Giảng viên'}</small>
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
