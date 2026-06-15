import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { documentApi } from '../api/documentApi';
import type { DocumentResponse, SearchResultItem } from '../api/documentApi';
import { authApi } from '../api/authApi';
import type { UserResponse } from '../types/auth';

import ChatBox from '../components/ChatBox';

const DocumentDetailPage: React.FC = () => {
  const { documentId } = useParams<{ documentId: string }>();
  const [document, setDocument] = useState<DocumentResponse | null>(null);
  const [user, setUser] = useState<UserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [indexLoading, setIndexLoading] = useState(false);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const fetchDocument = async () => {
    if (!documentId) return;
    try {
      const doc = await documentApi.get(documentId);
      setDocument(doc);
    } catch (err: any) {
      if (err.response?.status === 401) {
        localStorage.removeItem('access_token');
        navigate('/login');
      } else {
        setError('Không tải được thông tin tài liệu. Có thể tài liệu đã bị xóa hoặc bạn không có quyền truy cập.');
      }
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      navigate('/login');
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      await fetchDocument();
      try {
        const userData = await authApi.getMe();
        setUser(userData);
      } catch (err) {
        console.error('Failed to load user info:', err);
      }
      setLoading(false);
    };

    fetchData();
  }, [documentId, navigate]);

  const handleIndex = async () => {
    if (!documentId) return;
    setIndexLoading(true);
    setError(null);
    try {
      await documentApi.index(documentId);
      await fetchDocument(); // Refresh document status
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(
        typeof detail === 'string'
          ? detail
          : 'Lập chỉ mục vector thất bại. Hãy chắc chắn máy chủ và khóa API AI của bạn hoạt động.'
      );
    } finally {
      setIndexLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!documentId || !searchQuery.trim()) return;

    setSearchLoading(true);
    setSearchError(null);
    setSearchResults([]);

    try {
      const results = await documentApi.search(documentId, searchQuery, 4);
      setSearchResults(results);
      if (results.length === 0) {
        setSearchError('Không tìm thấy đoạn ngữ cảnh nào phù hợp trong tài liệu.');
      }
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setSearchError(
        typeof detail === 'string'
          ? detail
          : 'Tìm kiếm thất bại. Hãy chắc chắn tài liệu của bạn đã được Index.'
      );
    } finally {
      setSearchLoading(false);
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
        <p style={{ marginTop: '16px', color: 'var(--text)' }}>Đang tải chi tiết học liệu...</p>
      </div>
    );
  }

  if (error && !document) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.errorAlert}>{error}</div>
        <button onClick={() => navigate('/documents')} style={styles.backButton}>
          Quay lại danh sách tài liệu
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
        {/* Breadcrumb / Navigation */}
        <div style={styles.navigation}>
          <button onClick={() => navigate('/documents')} style={styles.backButton}>
            ← Quay lại danh sách tài liệu
          </button>
          {document && (
            <button
              onClick={() => navigate(`/documents/${document.id}/questions`)}
              disabled={document.status !== 'indexed'}
              style={{
                ...styles.primaryButton,
                opacity: document.status === 'indexed' ? 1 : 0.6,
                cursor: document.status === 'indexed' ? 'pointer' : 'not-allowed',
              }}
            >
              ✍️ Sinh Câu Hỏi Đánh Giá Năng Lực
            </button>
          )}
        </div>

        {error && <div style={styles.errorAlert}>{error}</div>}

        {document && (
          <div style={styles.layout}>
            {/* Left Side: Metadata and Vector Console */}
            <div style={styles.leftColumn}>
              {/* Metadata Card */}
              <div style={styles.card}>
                <h3 style={styles.cardTitle}>Thông Tin Học Liệu</h3>
                <div style={styles.metaGrid}>
                  <div style={styles.metaItem}>
                    <strong>Tên tệp:</strong>
                    <span>{document.original_filename}</span>
                  </div>
                  <div style={styles.metaItem}>
                    <strong>Định dạng:</strong>
                    <span>{document.file_type.toUpperCase()}</span>
                  </div>
                  <div style={styles.metaItem}>
                    <strong>Kích thước:</strong>
                    <span>{(document.file_size / (1024 * 1024)).toFixed(2)} MB</span>
                  </div>
                  <div style={styles.metaItem}>
                    <strong>Trạng thái:</strong>
                    <span style={{ fontWeight: 'bold', color: document.status === 'indexed' ? '#3b82f6' : '#22c55e' }}>
                      {document.status === 'indexed'
                        ? 'Đã lập chỉ mục (Indexed)'
                        : document.status === 'processed'
                        ? 'Đã trích xuất (Processed)'
                        : 'Chờ xử lý'}
                    </span>
                  </div>
                  <div style={styles.metaItem}>
                    <strong>Cloud URL:</strong>
                    <a href={document.cloudinary_url} target="_blank" rel="noreferrer" style={styles.link}>
                      Link tài liệu gốc
                    </a>
                  </div>
                </div>

                {/* Index Button */}
                {document.status === 'processed' && (
                  <button onClick={handleIndex} disabled={indexLoading} style={styles.indexButton}>
                    {indexLoading ? 'Đang phân tích & lập chỉ mục...' : '⚡ Lập Chỉ Mục Vector (Index Chunks)'}
                  </button>
                )}

                {document.status === 'indexed' && (
                  <div style={styles.indexedSuccessBox}>
                    ✓ Tài liệu đã được cắt phân đoạn (chunking) và lập chỉ mục nhúng (embeddings) thành công vào cơ sở dữ liệu vector.
                  </div>
                )}
              </div>

              {/* Semantic RAG Search Console */}
              <div style={styles.card}>
                <h3 style={styles.cardTitle}>Thử nghiệm Truy vấn Semantic (RAG Search)</h3>
                <p style={styles.cardSubtitle}>
                  Tìm kiếm trực tiếp các đoạn nội dung liên quan nhất trong tài liệu bằng vector nhúng.
                </p>

                <form onSubmit={handleSearch} style={styles.searchForm}>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Nhập nội dung cần truy vấn..."
                    disabled={searchLoading}
                    style={styles.searchInput}
                  />
                  <button type="submit" disabled={searchLoading || !searchQuery.trim()} style={styles.searchButton}>
                    {searchLoading ? 'Đang tìm...' : 'Tìm kiếm'}
                  </button>
                </form>

                {searchError && <div style={styles.searchErrorAlert}>{searchError}</div>}

                {searchResults.length > 0 && (
                  <div style={styles.resultsList}>
                    <h4 style={styles.resultsTitle}>Đoạn tài liệu liên quan nhất:</h4>
                    {searchResults.map((item) => (
                      <div key={item.id} style={styles.resultItem}>
                        <div style={styles.resultMeta}>
                          <strong>Trích đoạn {item.metadata.chunk_index + 1}</strong>
                          <span style={styles.distanceScore}>
                            Độ khớp: {((1 - item.distance) * 100).toFixed(1)}%
                          </span>
                        </div>
                        <p style={styles.resultText}>"{item.text}"</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Side: RAG ChatBox Component */}
            <div style={styles.rightColumn}>
              <ChatBox documentId={document.id} />
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
  primaryButton: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: '600',
    color: '#fff',
    backgroundColor: 'var(--accent)',
    border: 'none',
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
    gridTemplateColumns: '1fr 1fr',
    gap: '30px',
    alignItems: 'start',
  },
  leftColumn: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '24px',
  },
  rightColumn: {
    position: 'sticky' as const,
    top: '20px',
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
    margin: '0 0 16px 0',
  },
  cardSubtitle: {
    fontSize: '13px',
    color: 'var(--text)',
    margin: '0 0 16px 0',
  },
  metaGrid: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
    fontSize: '14px',
    marginBottom: '20px',
  },
  metaItem: {
    display: 'flex',
    justifyContent: 'space-between',
    borderBottom: '1px solid var(--border)',
    paddingBottom: '8px',
  },
  link: {
    color: 'var(--accent)',
    textDecoration: 'underline',
  },
  indexButton: {
    width: '100%',
    padding: '12px',
    fontSize: '14px',
    fontWeight: '600',
    color: '#fff',
    backgroundColor: '#3b82f6',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  indexedSuccessBox: {
    padding: '12px',
    backgroundColor: 'rgba(59, 130, 246, 0.05)',
    border: '1px solid rgba(59, 130, 246, 0.2)',
    color: '#3b82f6',
    borderRadius: '6px',
    fontSize: '13px',
    lineHeight: '1.4',
  },
  searchForm: {
    display: 'flex',
    gap: '10px',
  },
  searchInput: {
    flexGrow: 1,
    padding: '10px 14px',
    fontSize: '14px',
    borderRadius: '6px',
    border: '1px solid var(--border)',
    backgroundColor: 'var(--bg)',
    color: 'var(--text-h)',
    outline: 'none',
  },
  searchButton: {
    padding: '10px 16px',
    fontSize: '14px',
    fontWeight: '600',
    color: '#fff',
    backgroundColor: 'var(--text-h)',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  searchErrorAlert: {
    marginTop: '12px',
    color: 'var(--text)',
    fontSize: '13px',
    fontStyle: 'italic',
  },
  resultsList: {
    marginTop: '20px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  resultsTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--text-h)',
    margin: 0,
  },
  resultItem: {
    padding: '12px',
    borderRadius: '6px',
    border: '1px solid var(--border)',
    backgroundColor: 'var(--code-bg)',
  },
  resultMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '12px',
    marginBottom: '6px',
  },
  distanceScore: {
    color: '#3b82f6',
    fontWeight: '600',
  },
  resultText: {
    fontSize: '13px',
    lineHeight: '1.4',
    color: 'var(--text)',
    margin: 0,
    fontStyle: 'italic',
  },
};

export default DocumentDetailPage;
