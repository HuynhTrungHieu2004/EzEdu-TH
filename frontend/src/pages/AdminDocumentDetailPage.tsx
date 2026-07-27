import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { adminContentApi } from '../api/adminContentApi';
import type { AdminDocumentDetail } from '../types/adminContent';
import { Badge, EmptyState, fmtDateTime, fmtFileSize, fmtNumber, renderObjectRows } from './AdminContentShared';
import { apiErrorMessage, isCanceledError } from '../utils/apiError';
import './AdminContentPages.css';

export default function AdminDocumentDetailPage() {
  const { documentId = '' } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState<AdminDocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      setLoading(true);
      adminContentApi.documentDetail(documentId, controller.signal)
        .then(setItem)
        .catch((err) => {
          if (!isCanceledError(err)) setError(apiErrorMessage(err, 'Không tải được chi tiết tài liệu.'));
        })
        .finally(() => setLoading(false));
    });
    return () => controller.abort();
  }, [documentId]);

  if (loading) return <main className="admin-content-page"><EmptyState title="Đang tải" text="Đang lấy chi tiết tài liệu." /></main>;
  if (error || !item) return <main className="admin-content-page"><EmptyState title="Có lỗi" text={error || 'Không tìm thấy tài liệu.'} /></main>;

  return (
    <main className="admin-content-page">
      <header className="admin-content-header">
        <div>
          <h1>{item.original_filename}</h1>
          <p>{item.id}</p>
        </div>
        <button type="button" className="admin-content-btn" onClick={() => navigate('/admin/documents')}>Quay lại</button>
      </header>

      <section className="admin-content-detail">
        <div className="admin-content-detail-grid">
          <div className="admin-content-kv"><span>Chủ sở hữu</span><strong>{item.owner.full_name || item.owner.email || item.owner.id || 'Không có dữ liệu'}</strong></div>
          <div className="admin-content-kv"><span>Loại file</span><strong>{item.file_type || 'Không rõ'} · {fmtFileSize(item.file_size)}</strong></div>
          <div className="admin-content-kv"><span>Trạng thái</span><strong><Badge tone={item.deleted_at || item.is_quarantined ? 'danger' : 'info'}>{item.deleted_at ? 'deleted' : item.is_quarantined ? 'quarantined' : item.processing_status}</Badge></strong></div>
          <div className="admin-content-kv"><span>Ngày upload</span><strong>{fmtDateTime(item.uploaded_at)}</strong></div>
          <div className="admin-content-kv"><span>Trang</span><strong>{item.page_count ?? 'Không có dữ liệu'}</strong></div>
          <div className="admin-content-kv"><span>Chunk / câu hỏi</span><strong>{fmtNumber(item.chunk_count)} / {fmtNumber(item.question_count)}</strong></div>
          <div className="admin-content-kv"><span>Kiểm tra kiến thức</span><strong>{item.knowledge_verification_status || 'Không có dữ liệu'}</strong></div>
          <div className="admin-content-kv"><span>Lỗi gần nhất</span><strong>{item.latest_error || 'Không có dữ liệu'}</strong></div>
          <div className="admin-content-kv"><span>Media</span><strong>{item.media_kind || 'document'} / {item.cloudinary_resource_type || 'Không có dữ liệu'}</strong></div>
        </div>
      </section>

      <section className="admin-content-panel">
        <h2>Lịch sử xử lý</h2>
        {item.processing_history.length ? renderObjectRows(item.processing_history) : <p className="admin-content-muted">Chưa có activity log xử lý tài liệu.</p>}
      </section>

      <section className="admin-content-panel">
        <h2>Nội dung riêng tư</h2>
        <p className="admin-content-muted">Backend admin hiện không trả toàn bộ nội dung tài liệu. Nếu cần mở nội dung, phải bổ sung permission riêng, nhập lý do và ghi Admin Audit Log.</p>
      </section>
    </main>
  );
}
