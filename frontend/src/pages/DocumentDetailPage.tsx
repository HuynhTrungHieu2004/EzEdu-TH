import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { documentApi } from '../api/documentApi';
import type { DocumentResponse } from '../api/documentApi';

const DocumentDetailPage: React.FC = () => {
  const { documentId } = useParams<{ documentId: string }>();
  const [document, setDocument] = useState<DocumentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      navigate('/login');
      return;
    }

    const fetchDocument = async () => {
      if (!documentId) {
        setError('Không tìm thấy mã tài liệu.');
        setLoading(false);
        return;
      }

      setError(null);

      try {
        const doc = await documentApi.get(documentId);
        setDocument(doc);
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
            : 'Không tải được thông tin tài liệu. Có thể tài liệu không tồn tại hoặc bạn không có quyền truy cập.'
        );
      } finally {
        setLoading(false);
      }
    };

    fetchDocument();
  }, [documentId, navigate]);

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
        return { label: 'Đã tải lên', color: '#3b82f6' };
      case 'processed':
        return { label: 'Đã xử lý', color: '#22c55e' };
      case 'indexed':
        return { label: 'Đã lập chỉ mục', color: '#6366f1' };
      case 'failed':
        return { label: 'Lỗi xử lý', color: '#ef4444' };
      default:
        return { label: status || 'Không xác định', color: '#64748b' };
    }
  };

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p style={styles.loadingText}>Đang tải chi tiết tài liệu...</p>
      </div>
    );
  }

  if (error || !document) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.errorAlert}>{error ?? 'Không tìm thấy tài liệu.'}</div>
        <button onClick={() => navigate('/documents')} style={styles.backButton}>
          ← Quay lại danh sách tài liệu
        </button>
      </div>
    );
  }

  const statusMeta = getStatusMeta(document.status);

  return (
    <div style={styles.container}>
      <main style={styles.mainContent}>
        <div style={styles.navigation}>
          <button onClick={() => navigate('/documents')} style={styles.backButton}>
            ← Quay lại danh sách tài liệu
          </button>
        </div>

        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <h2 style={styles.pageTitle}>Chi tiết tài liệu</h2>
              <p style={styles.pageSubtitle}>Metadata của tài liệu đã tải lên từ tài khoản hiện tại.</p>
            </div>
            <span
              style={{
                ...styles.statusBadge,
                color: statusMeta.color,
                borderColor: `${statusMeta.color}33`,
                backgroundColor: `${statusMeta.color}14`,
              }}
            >
              {statusMeta.label}
            </span>
          </div>

          <div style={styles.metaGrid}>
            <div style={styles.metaItem}>
              <strong>Tên file</strong>
              <span>{document.original_filename}</span>
            </div>
            <div style={styles.metaItem}>
              <strong>Loại file</strong>
              <span>{document.file_type.toUpperCase()}</span>
            </div>
            <div style={styles.metaItem}>
              <strong>Dung lượng</strong>
              <span>{formatSize(document.file_size)}</span>
            </div>
            <div style={styles.metaItem}>
              <strong>Thời gian upload</strong>
              <span>{new Date(document.created_at).toLocaleString('vi-VN')}</span>
            </div>
            <div style={styles.metaItem}>
              <strong>Cập nhật lần cuối</strong>
              <span>{new Date(document.updated_at).toLocaleString('vi-VN')}</span>
            </div>
            <div style={styles.metaItem}>
              <strong>Link Cloudinary</strong>
              {document.cloudinary_url ? (
                <a href={document.cloudinary_url} target="_blank" rel="noreferrer" style={styles.link}>
                  Mở tài liệu trên Cloudinary
                </a>
              ) : (
                <span style={styles.mutedText}>Chưa có link Cloudinary khả dụng.</span>
              )}
            </div>
          </div>
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
    gap: '16px',
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
    color: 'var(--text)',
    margin: 0,
  },
  mainContent: {
    flexGrow: 1,
    padding: '40px',
    maxWidth: '920px',
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
    flexWrap: 'wrap' as const,
    gap: '12px',
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
    maxWidth: '520px',
    textAlign: 'center' as const,
  },
  card: {
    padding: '28px',
    borderRadius: '16px',
    border: '1px solid var(--border)',
    backgroundColor: 'var(--bg)',
    boxShadow: 'var(--shadow)',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '16px',
    marginBottom: '24px',
    flexWrap: 'wrap' as const,
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
  statusBadge: {
    padding: '8px 14px',
    borderRadius: '999px',
    border: '1px solid transparent',
    fontSize: '13px',
    fontWeight: '600',
  },
  metaGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '16px',
  },
  metaItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    padding: '16px',
    borderRadius: '12px',
    backgroundColor: 'var(--code-bg)',
    border: '1px solid var(--border)',
    fontSize: '14px',
    color: 'var(--text)',
  },
  link: {
    color: 'var(--accent)',
    textDecoration: 'underline',
    wordBreak: 'break-word' as const,
  },
  mutedText: {
    color: 'var(--text)',
    opacity: 0.8,
  },
};

export default DocumentDetailPage;
