import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { questionApi } from '../api/questionApi';
import type { QuestionSetResponse } from '../api/questionApi';
import { authApi } from '../api/authApi';
import type { UserResponse } from '../types/auth';
import QuestionCard from '../components/QuestionCard';

const QuestionSetDetailPage: React.FC = () => {
  const { questionSetId } = useParams<{ questionSetId: string }>();
  const [questionSet, setQuestionSet] = useState<QuestionSetResponse | null>(null);
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

    const fetchData = async () => {
      if (!questionSetId) return;
      setLoading(true);
      try {
        const response = await questionApi.get(questionSetId);
        setQuestionSet(response);
        
        const userData = await authApi.getMe();
        setUser(userData);
      } catch (err: any) {
        if (err.response?.status === 401) {
          localStorage.removeItem('access_token');
          navigate('/login');
        } else {
          setError('Không tải được chi tiết bộ câu hỏi. Bộ câu hỏi có thể đã bị xóa hoặc không thuộc quyền sở hữu của bạn.');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [questionSetId, navigate]);

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    navigate('/login');
  };

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p style={{ marginTop: '16px', color: 'var(--text)' }}>Đang tải bộ đề câu hỏi...</p>
      </div>
    );
  }

  if (error && !questionSet) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.errorAlert}>{error}</div>
        <button onClick={() => navigate('/documents')} style={styles.backButton}>
          Quay lại Danh sách tài liệu
        </button>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div onClick={() => navigate('/dashboard')} style={{ ...styles.logoGroup, cursor: 'pointer' }}>
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

      {/* Main Content */}
      <main style={styles.mainContent}>
        {/* Navigation / Actions Bar */}
        {questionSet && (
          <div style={styles.actionBar}>
            <button onClick={() => navigate(`/documents/${questionSet.document_id}`)} style={styles.backButton}>
              ← Quay lại Chi tiết học liệu
            </button>

            <div style={styles.exportButtons}>
              <a
                href={questionApi.exportDocxUrl(questionSet.id)}
                target="_blank"
                rel="noreferrer"
                style={{ ...styles.exportLink, backgroundColor: '#2b6cb0' }}
              >
                📥 Tải xuống đề Microsoft Word (.docx)
              </a>
              
              <a
                href={questionApi.exportPdfUrl(questionSet.id)}
                target="_blank"
                rel="noreferrer"
                style={{ ...styles.exportLink, backgroundColor: '#c53030' }}
              >
                📥 Tải xuống đề PDF (.pdf)
              </a>
            </div>
          </div>
        )}

        {/* Metadata Header */}
        {questionSet && (
          <div style={styles.metaCard}>
            <h2 style={styles.metaTitle}>Bộ đề đánh giá năng lực của tài liệu</h2>
            <p style={styles.documentName}>📄 {questionSet.document_name}</p>
            
            <div style={styles.metaGrid}>
              <div style={styles.metaBadge}>
                <strong>Độ khó:</strong>{' '}
                {questionSet.difficulty === 'easy' ? 'Dễ' : questionSet.difficulty === 'medium' ? 'Trung bình' : 'Khó'}
              </div>
              <div style={styles.metaBadge}>
                <strong>Dạng câu hỏi:</strong>{' '}
                {questionSet.question_type === 'multiple_choice'
                  ? 'Trắc nghiệm khách quan'
                  : questionSet.question_type === 'true_false'
                  ? 'Đúng/Sai'
                  : 'Tự luận ngắn'}
              </div>
              <div style={styles.metaBadge}>
                <strong>Tổng số câu hỏi:</strong> {questionSet.question_count} câu
              </div>
            </div>
          </div>
        )}

        {/* Questions Render List */}
        {questionSet && (
          <div style={styles.questionsList}>
            {questionSet.questions.map((q, qIdx) => (
              <QuestionCard key={qIdx} question={q} index={qIdx + 1} />
            ))}
          </div>
        )}
      </main>
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
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 40px',
    borderBottom: '1px solid var(--border)',
    backgroundColor: 'var(--bg)',
    flexWrap: 'wrap' as const,
    gap: '16px',
    textAlign: 'left' as const,
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
  },
  mainContent: {
    flexGrow: 1,
    padding: '40px',
    maxWidth: '860px',
    margin: '0 auto',
    width: '100%',
    boxSizing: 'border-box' as const,
    textAlign: 'left' as const,
  },
  actionBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '28px',
    flexWrap: 'wrap' as const,
    gap: '16px',
  },
  backButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: '500',
    color: 'var(--text)',
    backgroundColor: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  exportButtons: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap' as const,
  },
  exportLink: {
    padding: '10px 16px',
    fontSize: '13px',
    fontWeight: '600',
    color: '#fff',
    borderRadius: '6px',
    textDecoration: 'none',
    display: 'inline-block',
  },
  errorAlert: {
    padding: '12px 16px',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    color: '#ef4444',
    borderRadius: '8px',
    fontSize: '14px',
    marginBottom: '20px',
  },
  metaCard: {
    padding: '28px 24px',
    borderRadius: '12px',
    border: '1px solid var(--border)',
    backgroundColor: 'var(--bg)',
    boxShadow: 'var(--shadow)',
    marginBottom: '32px',
  },
  metaTitle: {
    fontSize: '15px',
    fontWeight: '600',
    color: 'var(--text)',
    margin: '0 0 6px 0',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  documentName: {
    fontSize: '22px',
    fontWeight: '600',
    color: 'var(--text-h)',
    margin: '0 0 16px 0',
  },
  metaGrid: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap' as const,
  },
  metaBadge: {
    fontSize: '13px',
    backgroundColor: 'var(--code-bg)',
    border: '1px solid var(--border)',
    color: 'var(--text-h)',
    padding: '6px 12px',
    borderRadius: '6px',
  },
  questionsList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '24px',
  },
};

export default QuestionSetDetailPage;
