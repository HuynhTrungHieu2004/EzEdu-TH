import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import axios from 'axios';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import DocumentsPage from './pages/DocumentsPage';
import DocumentDetailPage from './pages/DocumentDetailPage';
import QuestionGeneratePage from './pages/QuestionGeneratePage';
import QuestionSetDetailPage from './pages/QuestionSetDetailPage';
import AppLayout from './components/AppLayout';
import ProtectedRoute from './components/ProtectedRoute';
import { buildApiUrl, isApiBaseUrlConfigured } from './config/api';

// Welcome landing page retaining original check logic but styled nicely
function WelcomeScreen() {
  const [backendStatus, setBackendStatus] = useState('Đang kết nối...');
  const [isConnected, setIsConnected] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const navigate = useNavigate();

  useEffect(() => {
    if (!isApiBaseUrlConfigured) {
      setBackendStatus('Thiếu cấu hình VITE_API_BASE_URL');
      setIsConnected('disconnected');
      return;
    }

    axios
      .get(buildApiUrl('/health'))
      .then((res) => {
        setBackendStatus(`Kết nối backend thành công (Trạng thái: ${res.data.status})`);
        setIsConnected('connected');
      })
      .catch((error) => {
        console.error(error);
        setBackendStatus('Lỗi: Không kết nối được tới máy chủ backend');
        setIsConnected('disconnected');
      });
  }, []);

  const hasToken = !!localStorage.getItem('access_token');

  return (
    <main style={styles.main}>
      <div style={styles.heroGroup}>
        <div style={styles.logoBadge}>AI</div>
        <h1 style={styles.title}>AI Question Generator</h1>
        <p style={styles.subtitle}>
          Hệ thống sinh câu hỏi đánh giá năng lực tự động từ học liệu điện tử bằng mô hình ngôn ngữ lớn (LLM)
        </p>
      </div>

      <div style={styles.statusCard}>
        <span className={`status-indicator ${isConnected}`} style={styles.indicator}></span>
        <span style={{ color: 'var(--text-h)', fontWeight: '500' }}>{backendStatus}</span>
      </div>

      <div style={styles.actionGroup}>
        {hasToken ? (
          <button onClick={() => navigate('/dashboard')} style={styles.primaryButton}>
            Vào Trang Quản Trị (Dashboard)
          </button>
        ) : (
          <>
            <button onClick={() => navigate('/login')} style={styles.primaryButton}>
              Đăng Nhập Hệ Thống
            </button>
            <button onClick={() => navigate('/register')} style={styles.secondaryButton}>
              Đăng Ký Tài Khoản
            </button>
          </>
        )}
      </div>

      <div style={styles.featuresPreview}>
        <h3 style={styles.previewTitle}>Tính năng cốt lõi hệ thống:</h3>
        <ul style={styles.previewList}>
          <li>⚡ Đọc hiểu tài liệu PDF/Word thông minh</li>
          <li>📊 Tự động phân loại theo ma trận độ khó</li>
          <li>🧠 Sinh câu hỏi trắc nghiệm khách quan đa dạng</li>
          <li>💾 Xuất dữ liệu phục vụ kiểm tra đánh giá</li>
        </ul>
      </div>
    </main>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppLayout>
        <Routes>
          <Route path="/" element={<WelcomeScreen />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          
          {/* Protected routes */}
          <Route 
            path="/dashboard" 
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/documents" 
            element={
              <ProtectedRoute>
                <DocumentsPage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/documents/:documentId" 
            element={
              <ProtectedRoute>
                <DocumentDetailPage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/documents/:documentId/questions" 
            element={
              <ProtectedRoute>
                <QuestionGeneratePage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/question-sets/:questionSetId" 
            element={
              <ProtectedRoute>
                <QuestionSetDetailPage />
              </ProtectedRoute>
            } 
          />
          
          <Route path="*" element={<WelcomeScreen />} />
        </Routes>
      </AppLayout>
    </BrowserRouter>
  );
}


const styles = {
  main: {
    padding: '60px 24px',
    maxWidth: '800px',
    margin: '0 auto',
    textAlign: 'center' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '32px',
    flexGrow: 1,
    justifyContent: 'center',
  },
  heroGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '12px',
  },
  logoBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '64px',
    height: '64px',
    borderRadius: '16px',
    backgroundColor: 'var(--accent-bg)',
    color: 'var(--accent)',
    fontSize: '24px',
    fontWeight: 'bold',
    border: '1px solid var(--accent-border)',
    boxShadow: 'var(--shadow)',
  },
  title: {
    fontSize: '36px',
    fontWeight: '700',
    margin: 0,
    color: 'var(--text-h)',
    letterSpacing: '-1px',
  },
  subtitle: {
    fontSize: '16px',
    color: 'var(--text)',
    maxWidth: '580px',
    lineHeight: '1.5',
    margin: 0,
  },
  statusCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 24px',
    borderRadius: '12px',
    border: '1px solid var(--border)',
    backgroundColor: 'var(--code-bg)',
    fontSize: '15px',
  },
  indicator: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    display: 'inline-block',
  },
  actionGroup: {
    display: 'flex',
    gap: '16px',
    marginTop: '8px',
  },
  primaryButton: {
    padding: '14px 28px',
    fontSize: '16px',
    fontWeight: '600',
    color: '#fff',
    backgroundColor: 'var(--accent)',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: 'var(--shadow)',
  },
  secondaryButton: {
    padding: '14px 28px',
    fontSize: '16px',
    fontWeight: '600',
    color: 'var(--text-h)',
    backgroundColor: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  featuresPreview: {
    marginTop: '24px',
    textAlign: 'left' as const,
    borderTop: '1px solid var(--border)',
    paddingTop: '32px',
    width: '100%',
  },
  previewTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: 'var(--text-h)',
    marginBottom: '16px',
  },
  previewList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '16px',
    padding: 0,
    margin: 0,
    listStyle: 'none',
    fontSize: '14px',
    color: 'var(--text)',
  },
};

export default App;
