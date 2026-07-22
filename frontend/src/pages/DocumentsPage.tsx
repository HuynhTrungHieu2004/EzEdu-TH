import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { documentApi } from '../api/documentApi';
import type { DocumentResponse } from '../api/documentApi';
import FileUpload from '../components/FileUpload';
import { getApiErrorDetail, isUnauthorizedError } from '../api/errors';

const DocumentsPage = () => {
  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clusters, setClusters] = useState<Array<{
    cluster_id: number;
    label: string;
    size: number;
    documents: Array<{ id: string; name: string }>;
  }>>([]);
  const [clusterLoading, setClusterLoading] = useState(false);
  const [clusterMessage, setClusterMessage] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleDelete = async (doc: DocumentResponse) => {
    const confirmed = window.confirm(
      `Bạn có chắc chắn muốn xoá tài liệu "${doc.original_filename}"?\n\nHành động này sẽ xoá vĩnh viễn tài liệu, nội dung trích xuất, các bộ câu hỏi liên quan và không thể khôi phục.`
    );
    if (!confirmed) return;

    setDeletingId(doc.id);
    setError(null);
    try {
      await documentApi.delete(doc.id);
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (err: unknown) {
      const detail = getApiErrorDetail(err);
      setError(detail ?? 'Xoá tài liệu thất bại. Vui lòng thử lại.');
    } finally {
      setDeletingId(null);
    }
  };

  const fetchDocuments = useCallback(async () => {
    setError(null);

    try {
      const docs = await documentApi.list();
      setDocuments(docs);
    } catch (err: unknown) {
      if (isUnauthorizedError(err)) {
        localStorage.removeItem('access_token');
        navigate('/login');
        return;
      }

      const detail = getApiErrorDetail(err);
      setError(
        detail ?? 'Không thể tải danh sách tài liệu. Vui lòng thử lại sau.'
      );
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      navigate('/login');
      return;
    }

    void Promise.resolve().then(fetchDocuments);
  }, [fetchDocuments, navigate]);

  const fetchClusters = async () => {
    setClusterLoading(true);
    setClusterMessage(null);
    try {
      const result = await documentApi.getClusters();
      setClusters(result.clusters || []);
      setClusterMessage(result.message);
    } catch {
      setClusterMessage('Không thể phân cụm tài liệu.');
    } finally {
      setClusterLoading(false);
    }
  };

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
        return { label: 'Đã tải lên', background: 'var(--accent-2-bg)', color: 'var(--accent-2)' };
      case 'processed':
        return { label: 'Đã xử lý', background: 'var(--success-bg)', color: 'var(--success)' };
      case 'transcribing':
        return { label: 'Đang tạo transcript', background: 'var(--warning-bg)', color: 'var(--warning)' };
      case 'transcribed':
        return { label: 'Đã có transcript', background: 'var(--accent-bg)', color: 'var(--accent)' };
      case 'indexed':
        return { label: 'Đã lập chỉ mục', background: 'var(--success-bg)', color: 'var(--success)' };
      case 'index_failed':
      case 'failed':
        return { label: status === 'index_failed' ? 'Lỗi lập chỉ mục' : 'Lỗi xử lý', background: 'var(--danger-bg)', color: 'var(--danger)' };
      default:
        return { label: status || 'Không xác định', background: 'var(--surface-muted)', color: 'var(--muted)' };
    }
  };

  if (loading) {
    return (
      <div className="loading-state">
        <div className="loading-stack">
          <span className="spinner" />
          <p>Đang tải danh sách tài liệu...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-wide">
        <div className="page-header">
          <div>
            <p className="eyebrow">Kho học liệu</p>
            <h2 className="section-title">Quản lý học liệu điện tử</h2>
            <p className="section-subtitle">
              Tải lên và quản lý tài liệu PDF, DOCX, PPTX cùng video MP4, MOV, WEBM, MKV.
            </p>
          </div>
          <button type="button" onClick={() => navigate('/dashboard')} className="btn-secondary">
            Quay lại Dashboard
          </button>
        </div>

        <FileUpload onUploadSuccess={fetchDocuments} />

        {error && <div className="alert alert-error">{error}</div>}

        <section className="table-card">
          <div className="table-card-header">
            <h3 className="table-title">Danh sách tài liệu của bạn</h3>
            <span className="tag">{documents.length} mục</span>
          </div>

          {documents.length === 0 ? (
            <div className="empty-state">
              Bạn chưa tải lên học liệu nào. Hãy chọn file PDF, DOCX, PPTX hoặc video ở phần trên để bắt đầu.
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Tên tài liệu</th>
                    <th>Loại file</th>
                    <th>Dung lượng</th>
                    <th>Trạng thái</th>
                    <th>Thời gian upload</th>
                    <th style={{ textAlign: 'right' }}>Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc) => {
                    const isVideo = doc.media_kind === 'video';
                    const statusMeta = getStatusMeta(doc.status);

                    return (
                      <tr key={doc.id}>
                        <td>
                          <button
                            type="button"
                            onClick={() => navigate(`/documents/${doc.id}`)}
                            className="document-link"
                          >
                            <span className="doc-kind">{isVideo ? 'VID' : 'DOC'}</span>
                            {doc.original_filename}
                          </button>
                        </td>
                        <td>
                          <span className="tag">
                            {isVideo ? 'Video' : 'Tài liệu'} ({doc.file_type.toUpperCase()})
                          </span>
                        </td>
                        <td>{formatSize(doc.file_size)}</td>
                        <td>
                          <span
                            className="tag"
                            style={{ background: statusMeta.background, color: statusMeta.color }}
                          >
                            {statusMeta.label}
                          </span>
                        </td>
                        <td>{new Date(doc.created_at).toLocaleString('vi-VN')}</td>
                        <td>
                          <div className="row-actions">
                            <button
                              type="button"
                              onClick={() => navigate(`/documents/${doc.id}`)}
                              className="btn-secondary"
                            >
                              Xem chi tiết
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(doc)}
                              disabled={deletingId === doc.id}
                              className="btn-danger"
                            >
                              {deletingId === doc.id ? 'Đang xoá...' : 'Xoá'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* K-Means Clustering Section */}
        <section className="table-card" style={{ marginTop: '24px' }}>
          <div className="table-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 className="table-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>🔬</span> Phân cụm tài liệu (K-Means)
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '4px 0 0' }}>
                Tự động nhóm tài liệu theo chủ đề dựa trên vector embeddings
              </p>
            </div>
            <button
              type="button"
              onClick={fetchClusters}
              disabled={clusterLoading}
              className="btn-secondary"
              style={{ whiteSpace: 'nowrap' }}
            >
              {clusterLoading ? 'Đang phân cụm...' : '🔄 Phân cụm'}
            </button>
          </div>

          {clusterMessage && (
            <p style={{ padding: '0 20px', fontSize: '13px', color: 'var(--muted)', marginBottom: '8px' }}>
              {clusterMessage}
            </p>
          )}

          {clusters.length > 0 ? (
            <div style={{ padding: '0 20px 20px', display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
              {clusters.map((cluster) => (
                <div key={cluster.cluster_id} style={{
                  padding: '16px',
                  borderRadius: '12px',
                  background: 'var(--surface-muted)',
                  border: '1px solid var(--border)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <span style={{
                      fontWeight: 600,
                      fontSize: '14px',
                      color: 'var(--accent)',
                    }}>
                      📁 {cluster.label}
                    </span>
                    <span className="tag" style={{ fontSize: '11px' }}>{cluster.size} tài liệu</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {cluster.documents.map((doc) => (
                      <button
                        key={doc.id}
                        type="button"
                        onClick={() => navigate(`/documents/${doc.id}`)}
                        className="document-link"
                        style={{ fontSize: '12px', textAlign: 'left', padding: '4px 0' }}
                      >
                        📄 {doc.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : !clusterLoading && (
            <div className="empty-state" style={{ padding: '20px' }}>
              Nhấn "Phân cụm" để AI tự động nhóm tài liệu theo chủ đề. Cần ít nhất 2 tài liệu đã được lập chỉ mục.
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default DocumentsPage;
