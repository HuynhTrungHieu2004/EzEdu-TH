import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

interface AppLayoutProps {
  children: React.ReactNode;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const token = localStorage.getItem('access_token');

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    navigate('/login');
  };

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  return (
    <div style={styles.layoutContainer}>
      {/* Universal Header */}
      <header style={styles.header}>
        <div style={styles.logoGroup} onClick={() => navigate('/')}>
          <div style={styles.logoBadge}>AI</div>
          <div>
            <h1 style={styles.headerTitle}>AI Question Generator</h1>
            <p style={styles.headerSubtitle}>Sinh đề thi & Hỏi đáp từ học liệu tự động</p>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav style={styles.nav}>
          {token ? (
            <>
              <button
                onClick={() => navigate('/dashboard')}
                style={isActive('/dashboard') ? styles.navButtonActive : styles.navButton}
              >
                Dashboard
              </button>
              <button
                onClick={() => navigate('/documents')}
                style={isActive('/documents') ? styles.navButtonActive : styles.navButton}
              >
                Tài Liệu
              </button>
              <button onClick={handleLogout} style={styles.logoutButton}>
                Đăng Xuất
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => navigate('/login')}
                style={isActive('/login') ? styles.navButtonActive : styles.navButton}
              >
                Đăng Nhập
              </button>
              <button
                onClick={() => navigate('/register')}
                style={isActive('/register') ? styles.navButtonActive : styles.navButton}
              >
                Đăng Ký
              </button>
            </>
          )}
        </nav>
      </header>

      {/* Main Content Area */}
      <main style={styles.mainContent}>
        {children}
      </main>
    </div>
  );
};

const styles = {
  layoutContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    minHeight: '100svh',
    backgroundColor: 'var(--bg)',
    color: 'var(--text)',
    width: '100%',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 40px',
    borderBottom: '1px solid var(--border)',
    backgroundColor: 'var(--bg)',
    flexWrap: 'wrap' as const,
    gap: '16px',
    textAlign: 'left' as const,
  },
  logoGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    cursor: 'pointer',
  },
  logoBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '40px',
    height: '40px',
    borderRadius: '10px',
    backgroundColor: 'var(--accent-bg)',
    color: 'var(--accent)',
    fontSize: '18px',
    fontWeight: 'bold',
    border: '1px solid var(--accent-border)',
  },
  headerTitle: {
    fontSize: '18px',
    fontWeight: '600',
    margin: 0,
    color: 'var(--text-h)',
    lineHeight: '1.2',
  },
  headerSubtitle: {
    fontSize: '12px',
    color: 'var(--text)',
    margin: 0,
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  navButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: '500',
    color: 'var(--text)',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  navButtonActive: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--accent)',
    backgroundColor: 'var(--accent-bg)',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  logoutButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: '500',
    color: '#ef4444',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  mainContent: {
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    width: '100%',
    boxSizing: 'border-box' as const,
  },
};

export default AppLayout;
