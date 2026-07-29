import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { adminContentApi } from '../api/adminContentApi';
import type { AdminDocumentDetail } from '../types/adminContent';
import { Badge, EmptyState, fmtDateTime, fmtFileSize, fmtNumber, renderObjectRows } from './AdminContentShared';
import { apiErrorMessage, isCanceledError } from '../utils/apiError';
import { Button, Card, CardBody, PageHeader, SectionHeader } from '../components/ui';

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

  if (loading) return <div className="ez-admin-page"><EmptyState title="Đang tải" text="Đang lấy chi tiết tài liệu." /></div>;
  if (error || !item) return <div className="ez-admin-page"><EmptyState title="Có lỗi" text={error || 'Không tìm thấy tài liệu.'} /></div>;

  return (
    <div className="ez-admin-page">
      <PageHeader
        title={item.original_filename}
        description={item.id}
        actions={<Button variant="outline" onClick={() => navigate('/admin/documents')}>Quay lại</Button>}
      />

      <Card>
        <CardBody>
          <dl className="ez-kv-grid">
            <div><dt>Chủ sở hữu</dt><dd>{item.owner.full_name || item.owner.email || item.owner.id || 'Không có dữ liệu'}</dd></div>
            <div><dt>Loại file</dt><dd>{item.file_type || 'Không rõ'} · {fmtFileSize(item.file_size)}</dd></div>
            <div><dt>Trạng thái</dt><dd><Badge tone={item.deleted_at || item.is_quarantined ? 'danger' : 'info'}>{item.deleted_at ? 'deleted' : item.is_quarantined ? 'quarantined' : item.processing_status}</Badge></dd></div>
            <div><dt>Ngày upload</dt><dd>{fmtDateTime(item.uploaded_at)}</dd></div>
            <div><dt>Trang</dt><dd>{item.page_count ?? 'Không có dữ liệu'}</dd></div>
            <div><dt>Chunk / câu hỏi</dt><dd>{fmtNumber(item.chunk_count)} / {fmtNumber(item.question_count)}</dd></div>
            <div><dt>Kiểm tra kiến thức</dt><dd>{item.knowledge_verification_status || 'Không có dữ liệu'}</dd></div>
            <div><dt>Lỗi gần nhất</dt><dd>{item.latest_error || 'Không có dữ liệu'}</dd></div>
            <div><dt>Media</dt><dd>{item.media_kind || 'document'} / {item.cloudinary_resource_type || 'Không có dữ liệu'}</dd></div>
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <SectionHeader title="Lịch sử xử lý" />
          {item.processing_history.length ? renderObjectRows(item.processing_history) : <p className="ez-muted">Chưa có activity log xử lý tài liệu.</p>}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <SectionHeader title="Nội dung riêng tư" />
          <p className="ez-muted">Backend admin hiện không trả toàn bộ nội dung tài liệu. Nếu cần mở nội dung, phải bổ sung permission riêng, nhập lý do và ghi Admin Audit Log.</p>
        </CardBody>
      </Card>
    </div>
  );
}
