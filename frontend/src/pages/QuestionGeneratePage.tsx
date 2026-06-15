import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { questionApi } from '../api/questionApi';
import type { QuestionSetResponse } from '../api/questionApi';
import { documentApi } from '../api/documentApi';
import type { DocumentResponse } from '../api/documentApi';
import { authApi } from '../api/authApi';
import type { UserResponse } from '../types/auth';

const QuestionGeneratePage: React.FC = () => {
  const { documentId } = useParams<{ documentId: string }>();
  const [document, setDocument] = useState<DocumentResponse | null>(null);
  const [user, setUser] = useState<UserResponse | null>(null);
  const [historySets, setHistorySets] = useState<QuestionSetResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState('medium');
  const [type, setType] = useState('multiple_choice');

  const navigate = useNavigate();

  const fetchHistory = async () => {
    if (!documentId) return;
    try {
      const history = await questionApi.listByDocument(documentId);
      setHistorySets(history);
    } catch (err) {
      console.error('Failed to load question sets history:', err);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      navigate('/login');
      return;
    }

    const fetchData = async () => {
      if (!documentId) return;
      setLoading(true);
      try {
        const doc = await documentApi.get(documentId);
        setDocument(doc);
        
        await fetchHistory();
        
        const userData = await authApi.getMe();
        setUser(userData);
      } catch (err: any) {
        if (err.response?.status === 401) {
          localStorage.removeItem('access_token');
          navigate('/login');
        } else {
          setError('Không tải được thông tin học liệu hoặc lịch sử sinh đề.');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [documentId, navigate]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!documentId || generating) return;

    setGenerating(true);
    setError(null);

    try {
      const response = await questionApi.generate(documentId, count, difficulty, type);
      navigate(`/question-sets/${response.id}`);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(
        typeof detail === 'string'
          ? detail
          : 'Sinh câu hỏi thất bại. Vui lòng kiểm tra lại cấu hình hoặc thử lại sau.'
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    navigate('/login');
  };

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p style={{ marginTop: '16px', color: 'var(--text)' }}>Đang tải cấu hình sinh câu hỏi...</p>
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
        {/* Navigation */}
        <div style={styles.navigation}>
          <button onClick={() => navigate(`/documents/${documentId}`)} style={styles.backButton}>
            ← Quay lại Chi tiết học liệu
          </button>
        </div>

        {error && <div style={styles.errorAlert}>{error}</div>}

        {document && (
          <div style={styles.layout}>
            {/* Form Section */}
            <div style={styles.formColumn}>
              <div style={styles.card}>
                <h3 style={styles.cardTitle}>Cấu hình Ma trận đề thi</h3>
                <p style={styles.cardSubtitle}>
                  Tạo các câu hỏi kiểm tra năng lực bám sát nội dung của tài liệu: <strong>{document.original_filename}</strong>.
                </p>

                <form onSubmit={handleGenerate} style={styles.form}>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Số lượng câu hỏi</label>
                    <select
                      value={count}
                      onChange={(e) => setCount(Number(e.target.value))}
                      disabled={generating}
                      style={styles.select}
                    >
                      <option value={3}>3 câu hỏi</option>
                      <option value={5}>5 câu hỏi</option>
                      <option value={10}>10 câu hỏi</option>
                      <option value={15}>15 câu hỏi</option>
                    </select>
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.label}>Mức độ nhận thức (Độ khó)</label>
                    <select
                      value={difficulty}
                      onChange={(e) => setDifficulty(e.target.value)}
                      disabled={generating}
                      style={styles.select}
                    >
                      <option value="easy">Nhận biết & Thông hiểu (Dễ)</option>
                      <option value="medium">Vận dụng thấp (Trung bình)</option>
                      <option value="hard">Vận dụng cao (Khó)</option>
                    </select>
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.label}>Dạng câu hỏi</label>
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value)}
                      disabled={generating}
                      style={styles.select}
                    >
                      <option value="multiple_choice">Trắc nghiệm 4 lựa chọn (Multiple Choice)</option>
                      <option value="true_false">Đúng / Sai (True / False)</option>
                      <option value="short_answer">Điền khuyết / Tự luận ngắn (Short Answer)</option>
                    </select>
                  </div>

                  <button type="submit" disabled={generating} style={styles.generateButton}>
                    {generating ? '🤖 AI Đang đọc và tạo câu hỏi (Mất 10-20s)...' : '✨ Bắt Đầu Sinh Câu Hỏi Bằng AI'}
                  </button>
                </form>
              </div>
            </div>

            {/* History Section */}
            <div style={styles.historyColumn}>
              <div style={styles.card}>
                <h3 style={styles.cardTitle}>Lịch sử Đề thi đã sinh</h3>
                
                {historySets.length === 0 ? (
                  <div style={styles.emptyHistory}>
                    Tài liệu này chưa từng được sinh câu hỏi nào.
                  </div>
                ) : (
                  <div style={styles.historyList}>
                    {historySets.map((set) => {
                      const typeLabel = 
                        set.question_type === 'multiple_choice' ? 'Trắc nghiệm' : 
                        set.question_type === 'true_false' ? 'Đúng/Sai' : 'Tự luận ngắn';
                        
                      const difficultyLabel = 
                        set.difficulty === 'easy' ? 'Dễ' : 
                        set.difficulty === 'medium' ? 'Trung bình' : 'Khó';

                      return (
                        <div
                          key={set.id}
                          onClick={() => navigate(`/question-sets/${set.id}`)}
                          style={styles.historyItem}
                        >
                          <div style={styles.historyItemHeader}>
                            <strong>Bộ đề {set.question_count} câu ({typeLabel})</strong>
                            <span style={styles.historyDate}>
                              {new Date(set.created_at).toLocaleDateString('vi-VN')}
                            </span>
                          </div>
                          <div style={styles.historyItemMeta}>
                            <span>Độ khó: {difficultyLabel}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
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
    maxWidth: '1200px',
    margin: '0 auto',
    width: '100%',
    boxSizing: 'border-box' as const,
    textAlign: 'left' as const,
  },
  navigation: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
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
  errorAlert: {
    padding: '12px 16px',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    color: '#ef4444',
    borderRadius: '8px',
    fontSize: '14px',
    marginBottom: '20px',
  },
  layout: {
    display: 'grid',
    gridTemplateColumns: '7fr 5fr',
    gap: '30px',
    alignItems: 'start',
  },
  formColumn: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
  historyColumn: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
  card: {
    padding: '24px',
    borderRadius: '12px',
    border: '1px solid var(--border)',
    backgroundColor: 'var(--bg)',
    boxShadow: 'var(--shadow)',
  },
  cardTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: 'var(--text-h)',
    margin: '0 0 10px 0',
  },
  cardSubtitle: {
    fontSize: '14px',
    color: 'var(--text)',
    margin: '0 0 20px 0',
    lineHeight: '1.4',
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '20px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  label: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--text-h)',
  },
  select: {
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    backgroundColor: 'var(--bg)',
    color: 'var(--text-h)',
    outline: 'none',
    fontSize: '14px',
  },
  generateButton: {
    padding: '14px',
    fontSize: '15px',
    fontWeight: '600',
    color: '#fff',
    backgroundColor: 'var(--accent)',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    marginTop: '10px',
  },
  emptyHistory: {
    padding: '20px',
    textAlign: 'center' as const,
    color: 'var(--text)',
    fontSize: '13px',
    fontStyle: 'italic',
    backgroundColor: 'var(--code-bg)',
    borderRadius: '8px',
  },
  historyList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  historyItem: {
    padding: '14px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    backgroundColor: 'var(--bg)',
    ':hover': {
      borderColor: 'var(--accent)',
      backgroundColor: 'var(--code-bg)',
    },
  },
  historyItemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '14px',
    color: 'var(--text-h)',
    marginBottom: '6px',
  },
  historyDate: {
    fontSize: '12px',
    color: 'var(--text)',
  },
  historyItemMeta: {
    fontSize: '12px',
    color: 'var(--text)',
  },
};

export default QuestionGeneratePage;
