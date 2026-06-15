import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api/authApi';
import type { UserResponse } from '../types/auth';

const DashboardPage: React.FC = () => {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      navigate('/login');
      return;
    }

    const fetchUser = async () => {
      try {
        const userData = await authApi.getMe();
        setUser(userData);
      } catch (err: any) {
        setError('Không tải được thông tin người dùng. Vui lòng đăng nhập lại.');
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    navigate('/login');
  };

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p style={{ marginTop: '16px', color: 'var(--text)' }}>Đang tải thông tin hệ thống...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.errorAlert}>{error}</div>
        <button onClick={handleLogout} style={styles.logoutButton}>Quay lại Đăng nhập</button>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.logoGroup}>
          <div style={styles.logoBadge}>AI</div>
          <div>
            <h1 style={styles.headerTitle}>Hệ Thống Sinh Câu Hỏi</h1>
            <p style={styles.headerSubtitle}>Đánh giá năng lực tự động từ học liệu điện tử</p>
          </div>
        </div>

        {user && (
          <div style={styles.userSection}>
            <div style={styles.userInfo}>
              <span style={styles.userName}>{user.full_name}</span>
              <span style={styles.userEmail}>{user.email}</span>
            </div>
            <button onClick={handleLogout} style={styles.logoutButton}>
              Đăng Xuất
            </button>
          </div>
        )}
      </header>

      {/* Main Content Dashboard */}
      <main style={styles.mainContent}>
        {/* Welcome Section */}
        <section style={styles.welcomeCard}>
          <h2 style={styles.cardTitle}>Chào mừng trở lại, {user?.full_name}!</h2>
          <p style={styles.cardText}>
            Hệ thống đã sẵn sàng giúp bạn phân tích các tài liệu học tập điện tử (PDF, DOCX, ePub...) và tự động tạo ra các bộ câu hỏi trắc nghiệm, tự luận đánh giá năng lực một cách nhanh chóng bằng trí tuệ nhân tạo.
          </p>
        </section>

        {/* Feature Grid */}
        <div style={styles.grid}>
          <div style={styles.featureCard}>
            <div style={styles.iconContainer}>📄</div>
            <h3 style={styles.featureTitle}>Tải lên Học liệu</h3>
            <p style={styles.featureDescription}>
              Tải lên các tài liệu học tập, sách giáo khoa điện tử hoặc các bài báo khoa học định dạng PDF, Text, Word.
            </p>
            <button onClick={() => navigate('/documents')} style={styles.actionButton}>Bắt đầu tải lên</button>
          </div>

          <div style={styles.featureCard}>
            <div style={styles.iconContainer}>⚙️</div>
            <h3 style={styles.featureTitle}>Cấu hình Ma trận đề</h3>
            <p style={styles.featureDescription}>
              Thiết lập độ khó (Nhận biết, Thông hiểu, Vận dụng, Vận dụng cao) và cấu trúc số lượng câu hỏi cần sinh.
            </p>
            <button onClick={() => navigate('/documents')} style={styles.actionButton}>Thiết lập ngay</button>
          </div>

          <div style={styles.featureCard}>
            <div style={styles.iconContainer}>✨</div>
            <h3 style={styles.featureTitle}>Sinh Câu hỏi Tự động</h3>
            <p style={styles.featureDescription}>
              Sử dụng mô hình ngôn ngữ lớn để phân tích văn bản và tạo các câu hỏi trắc nghiệm kèm đáp án và giải thích chi tiết.
            </p>
            <button onClick={() => navigate('/documents')} style={{ ...styles.actionButton, backgroundColor: 'var(--accent)' }}>Bắt đầu sinh câu hỏi</button>
          </div>

          <div style={styles.featureCard}>
            <div style={styles.iconContainer}>📚</div>
            <h3 style={styles.featureTitle}>Quản lý Kho câu hỏi</h3>
            <p style={styles.featureDescription}>
              Xem, chỉnh sửa, lưu trữ hoặc xuất bản các bộ câu hỏi đã sinh ra dưới định dạng PDF, Excel hoặc Word.
            </p>
            <button onClick={() => navigate('/documents')} style={styles.actionButton}>Xem kho câu hỏi</button>
          </div>

        </div>
      </main>

      <footer style={styles.footer}>
        <p>© 2026 AI Question Generator. Hệ thống hỗ trợ giảng dạy và đánh giá năng lực thế hệ mới.</p>
      </footer>
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    minHeight: '100svh',
    backgroundColor: 'var(--bg)',
    width: '100%',
    boxSizing: 'border-box' as const,
    textAlign: 'left' as const,
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    justifyContent: 'center',
    alignItems: 'center',
    flexGrow: 1,
    backgroundColor: 'var(--bg)',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '4px solid var(--border)',
    borderTop: '4px solid var(--accent)',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  errorAlert: {
    padding: '16px',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    color: '#ef4444',
    borderRadius: '8px',
    marginBottom: '20px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 40px',
    borderBottom: '1px solid var(--border)',
    backgroundColor: 'var(--bg)',
    flexWrap: 'wrap' as const,
    gap: '16px',
  },
  logoGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
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
    fontSize: '13px',
    color: 'var(--text)',
    margin: 0,
  },
  userSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
  },
  userInfo: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-end',
  },
  userName: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--text-h)',
  },
  userEmail: {
    fontSize: '12px',
    color: 'var(--text)',
  },
  logoutButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: '500',
    color: 'var(--text)',
    backgroundColor: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    outline: 'none',
  },
  mainContent: {
    flexGrow: 1,
    padding: '40px',
    maxWidth: '1200px',
    margin: '0 auto',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  welcomeCard: {
    padding: '32px',
    borderRadius: '16px',
    background: 'var(--accent-bg)',
    border: '1px solid var(--accent-border)',
    marginBottom: '40px',
  },
  cardTitle: {
    fontSize: '22px',
    fontWeight: '600',
    color: 'var(--text-h)',
    margin: '0 0 12px 0',
  },
  cardText: {
    fontSize: '16px',
    lineHeight: '1.6',
    color: 'var(--text)',
    margin: 0,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '24px',
  },
  featureCard: {
    padding: '28px',
    borderRadius: '12px',
    border: '1px solid var(--border)',
    backgroundColor: 'var(--bg)',
    boxShadow: 'var(--shadow)',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-start',
    transition: 'all 0.2s ease',
  },
  iconContainer: {
    fontSize: '32px',
    marginBottom: '16px',
  },
  featureTitle: {
    fontSize: '18px',
    fontWeight: '600',
    margin: '0 0 10px 0',
    color: 'var(--text-h)',
  },
  featureDescription: {
    fontSize: '14px',
    lineHeight: '1.5',
    color: 'var(--text)',
    marginBottom: '20px',
    flexGrow: 1,
  },
  actionButton: {
    padding: '10px 16px',
    fontSize: '14px',
    fontWeight: '600',
    color: '#fff',
    backgroundColor: '#3b82f6',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    width: '100%',
    textAlign: 'center' as const,
  },
  footer: {
    padding: '24px 40px',
    borderTop: '1px solid var(--border)',
    textAlign: 'center' as const,
    fontSize: '14px',
    color: 'var(--text)',
    backgroundColor: 'var(--bg)',
  },
};

export default DashboardPage;
