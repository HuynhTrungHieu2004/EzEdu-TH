import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { documentApi } from '../api/documentApi';
import type { DocumentResponse } from '../api/documentApi';
import { authApi } from '../api/authApi';
import type { UserResponse } from '../types/auth';
import FileUpload from '../components/FileUpload';

const DocumentsPage: React.FC = () => {
  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [user, setUser] = useState<UserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const fetchData = async () => {
    try {
      const docs = await documentApi.list();
      setDocuments(docs);
      
      const userData = await authApi.getMe();
      setUser(userData);
    } catch (err: any) {
      if (err.response?.status === 401) {
        localStorage.removeItem('access_token');
        navigate('/login');
      } else {
        setError('Không thể kết nối đến máy chủ. Vui lòng thử lại sau.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      navigate('/login');
      return;
    }
    fetchData();
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    navigate('/login');
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p style={{ marginTop: '16px', color: 'var(--text)' }}>Đang tải danh sách tài liệu...</p>
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
        <div style={styles.pageHeader}>
          <div>
            <h2 style={styles.pageTitle}>Quản lý Học liệu Điện tử</h2>
            <p style={styles.pageSubtitle}>Tải lên và chuẩn bị tài liệu phục vụ sinh câu hỏi tự động và hỏi đáp AI.</p>
          </div>
          <button onClick={() => navigate('/dashboard')} style={styles.backButton}>
            ← Quay lại Dashboard
          </button>
        </div>

        {/* File Upload Component */}
        <FileUpload onUploadSuccess={fetchData} />

        {error && <div style={styles.errorAlert}>{error}</div>}

        {/* Documents Table */}
        <div style={styles.tableCard}>
          <h3 style={styles.tableTitle}>Danh sách tài liệu học tập của bạn</h3>
          
          {documents.length === 0 ? (
            <div style={styles.emptyState}>
              Bạn chưa tải lên tài liệu nào. Vui lòng chọn tài liệu PDF/DOCX/PPTX phía trên để bắt đầu!
            </div>
          ) : (
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.thRow}>
                    <th style={styles.th}>Tên tài liệu</th>
                    <th style={styles.th}>Định dạng</th>
                    <th style={styles.th}>Dung lượng</th>
                    <th style={styles.th}>Trạng thái</th>
                    <th style={styles.th}>Ngày tải lên</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc) => {
                    const isIndexed = doc.status === 'indexed';
                    const isProcessed = doc.status === 'processed';
                    const isFailed = doc.status === 'failed';
                    
                    let statusLabel = 'Đang xử lý';
                    let statusBg = 'rgba(234, 179, 8, 0.1)';
                    let statusColor = '#eab308';
                    
                    if (isIndexed) {
                      statusLabel = 'Đã lập chỉ mục';
                      statusBg = 'rgba(59, 130, 246, 0.1)';
                      statusColor = '#3b82f6';
                    } else if (isProcessed) {
                      statusLabel = 'Đã trích xuất text';
                      statusBg = 'rgba(34, 197, 94, 0.1)';
                      statusColor = '#22c55e';
                    } else if (isFailed) {
                      statusLabel = 'Lỗi phân tích';
                      statusBg = 'rgba(239, 68, 68, 0.1)';
                      statusColor = '#ef4444';
                    }

                    return (
                      <tr key={doc.id} style={styles.tr}>
                        <td style={styles.tdName} onClick={() => navigate(`/documents/${doc.id}`)}>
                          📄 {doc.original_filename}
                        </td>
                        <td style={styles.td}>
                          <span style={styles.typeTag}>{doc.file_type.toUpperCase()}</span>
                        </td>
                        <td style={styles.td}>{formatSize(doc.file_size)}</td>
                        <td style={styles.td}>
                          <span style={{ ...styles.statusTag, backgroundColor: statusBg, color: statusColor }}>
                            {statusLabel}
                          </span>
                        </td>
                        <td style={styles.td}>
                          {new Date(doc.created_at).toLocaleDateString('vi-VN')}
                        </td>
                        <td style={styles.tdActions}>
                          <button
                            onClick={() => navigate(`/documents/${doc.id}`)}
                            style={styles.detailButton}
                          >
                            Chi tiết & RAG Q&A
                          </button>
                          
                          <button
                            onClick={() => navigate(`/documents/${doc.id}/questions`)}
                            disabled={!isIndexed}
                            style={{
                              ...styles.generateButton,
                              opacity: isIndexed ? 1 : 0.5,
                              cursor: isIndexed ? 'pointer' : 'not-allowed',
                            }}
                          >
                            Sinh Câu hỏi
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
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
    transition: 'all 0.2s ease',
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
  pageHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '28px',
    flexWrap: 'wrap' as const,
    gap: '16px',
  },
  pageTitle: {
    fontSize: '24px',
    fontWeight: '600',
    color: 'var(--text-h)',
    margin: '0 0 6px 0',
  },
  pageSubtitle: {
    fontSize: '14px',
    color: 'var(--text)',
    margin: 0,
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
  tableCard: {
    padding: '30px 24px',
    borderRadius: '12px',
    border: '1px solid var(--border)',
    backgroundColor: 'var(--bg)',
    boxShadow: 'var(--shadow)',
  },
  tableTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: 'var(--text-h)',
    margin: '0 0 20px 0',
  },
  emptyState: {
    padding: '40px',
    textAlign: 'center' as const,
    color: 'var(--text)',
    fontSize: '14px',
    backgroundColor: 'var(--code-bg)',
    borderRadius: '8px',
    border: '1px dashed var(--border)',
  },
  tableWrapper: {
    overflowX: 'auto' as const,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '14px',
  },
  thRow: {
    borderBottom: '2px solid var(--border)',
  },
  th: {
    padding: '12px 16px',
    fontWeight: '600',
    color: 'var(--text-h)',
    textAlign: 'left' as const,
  },
  tr: {
    borderBottom: '1px solid var(--border)',
    transition: 'background-color 0.2s ease',
    ':hover': {
      backgroundColor: 'var(--code-bg)',
    },
  },
  td: {
    padding: '16px',
    color: 'var(--text)',
  },
  tdName: {
    padding: '16px',
    fontWeight: '600',
    color: 'var(--accent)',
    cursor: 'pointer',
    textDecoration: 'underline',
  },
  typeTag: {
    fontSize: '11px',
    fontWeight: 'bold',
    backgroundColor: 'var(--code-bg)',
    padding: '4px 6px',
    borderRadius: '4px',
    border: '1px solid var(--border)',
  },
  statusTag: {
    fontSize: '12px',
    fontWeight: '500',
    padding: '4px 8px',
    borderRadius: '12px',
    display: 'inline-block',
  },
  tdActions: {
    padding: '16px',
    textAlign: 'right' as const,
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
  },
  detailButton: {
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--text-h)',
    backgroundColor: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  generateButton: {
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: '600',
    color: '#fff',
    backgroundColor: 'var(--accent)',
    border: 'none',
    borderRadius: '4px',
  },
};

export default DocumentsPage;
