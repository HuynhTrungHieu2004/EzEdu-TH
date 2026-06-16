import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { documentApi } from '../api/documentApi';
import type { DocumentResponse } from '../api/documentApi';
import FileUpload from '../components/FileUpload';

const DocumentsPage: React.FC = () => {
  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const fetchDocuments = async () => {
    setError(null);

    try {
      const docs = await documentApi.list();
      setDocuments(docs);
    } catch (err: any) {
      if (err.response?.status === 401) {
        localStorage.removeItem('access_token');
        navigate('/login');
        return;
      }

      const detail = err.response?.data?.detail;
      setError(
        typeof detail === 'string'
          ? detail
          : 'Không thể tải danh sách tài liệu. Vui lòng thử lại sau.'
      );
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

    fetchDocuments();
  }, [navigate]);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';

    const units = ['Bytes', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, index);
    return `${value.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
  };

  const getStatusMeta = (status: string) => {
    switch (status) {
      case 'uploaded':
        return {
          label: 'Đã tải lên',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          color: '#3b82f6',
        };
      case 'processed':
        return {
          label: 'Đã xử lý',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          color: '#22c55e',
        };
      case 'indexed':
        return {
          label: 'Đã lập chỉ mục',
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
          color: '#6366f1',
        };
      case 'failed':
        return {
          label: 'Lỗi xử lý',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          color: '#ef4444',
        };
      default:
        return {
          label: status || 'Không xác định',
          backgroundColor: 'rgba(148, 163, 184, 0.12)',
          color: '#64748b',
        };
    }
  };

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p style={styles.loadingText}>Đang tải danh sách tài liệu...</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <main style={styles.mainContent}>
        <div style={styles.pageHeader}>
          <div>
            <h2 style={styles.pageTitle}>Quản lý Học liệu Điện tử</h2>
            <p style={styles.pageSubtitle}>Tải lên và quản lý các tài liệu PDF, DOCX, PPTX của riêng bạn.</p>
          </div>
          <button onClick={() => navigate('/dashboard')} style={styles.backButton}>
            ← Quay lại Dashboard
          </button>
        </div>

        <FileUpload onUploadSuccess={fetchDocuments} />

        {error && <div style={styles.errorAlert}>{error}</div>}

        <div style={styles.tableCard}>
          <h3 style={styles.tableTitle}>Danh sách tài liệu của bạn</h3>

          {documents.length === 0 ? (
            <div style={styles.emptyState}>
              Bạn chưa tải lên tài liệu nào. Hãy chọn file PDF, DOCX hoặc PPTX ở phần trên để bắt đầu.
            </div>
          ) : (
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.thRow}>
                    <th style={styles.th}>Tên tài liệu</th>
                    <th style={styles.th}>Loại file</th>
                    <th style={styles.th}>Dung lượng</th>
                    <th style={styles.th}>Trạng thái</th>
                    <th style={styles.th}>Thời gian upload</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc) => {
                    const statusMeta = getStatusMeta(doc.status);

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
                          <span
                            style={{
                              ...styles.statusTag,
                              backgroundColor: statusMeta.backgroundColor,
                              color: statusMeta.color,
                            }}
                          >
                            {statusMeta.label}
                          </span>
                        </td>
                        <td style={styles.td}>{new Date(doc.created_at).toLocaleString('vi-VN')}</td>
                        <td style={styles.tdActions}>
                          <button
                            onClick={() => navigate(`/documents/${doc.id}`)}
                            style={styles.detailButton}
                          >
                            Xem chi tiết
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
  loadingText: {
    marginTop: '16px',
    color: 'var(--text)',
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
  },
  td: {
    padding: '16px',
    color: 'var(--text)',
    verticalAlign: 'middle' as const,
  },
  tdName: {
    padding: '16px',
    fontWeight: '600',
    color: 'var(--accent)',
    cursor: 'pointer',
    textDecoration: 'underline',
    verticalAlign: 'middle' as const,
  },
  typeTag: {
    fontSize: '11px',
    fontWeight: '700',
    backgroundColor: 'var(--code-bg)',
    padding: '4px 8px',
    borderRadius: '999px',
    border: '1px solid var(--border)',
  },
  statusTag: {
    fontSize: '12px',
    fontWeight: '600',
    padding: '5px 10px',
    borderRadius: '999px',
    display: 'inline-block',
  },
  tdActions: {
    padding: '16px',
    textAlign: 'right' as const,
    whiteSpace: 'nowrap' as const,
  },
  detailButton: {
    padding: '8px 14px',
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--text-h)',
    backgroundColor: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    cursor: 'pointer',
  },
};

export default DocumentsPage;
