import { Badge } from '../ui';
import type { BadgeVariant } from '../ui';

/**
 * Trạng thái xử lý học liệu, diễn đạt bằng ngôn ngữ người dùng.
 *
 * Giáo viên không cần biết tên bước trong pipeline. "indexing" không nói lên
 * điều gì với người dạy, còn "Đang chuẩn bị để hỏi đáp" thì có.
 * Xem docs/ui-redesign/01-audit-report.md §6.3 (lỗi M2).
 */
/**
 * Giá trị khớp đúng với `status` backend thực sự trả về (đã đối chiếu
 * `backend/app/routers/documents.py`): uploaded, extracting, processed,
 * transcribing, transcribed, indexing, indexed, failed, index_failed.
 * `pending`/`processing` được giữ làm dự phòng cho các luồng khác có thể
 * dùng nhãn chung hơn.
 */
const LABELS: Record<string, { text: string; variant: BadgeVariant }> = {
  pending: { text: 'Đang chờ xử lý', variant: 'neutral' },
  uploaded: { text: 'Đã tải lên', variant: 'neutral' },
  processing: { text: 'Đang xử lý', variant: 'info' },
  extracting: { text: 'Đang đọc nội dung', variant: 'info' },
  processed: { text: 'Đã đọc nội dung', variant: 'secondary' },
  transcribing: { text: 'Đang chuyển lời video', variant: 'info' },
  transcribed: { text: 'Đã chuyển lời video', variant: 'secondary' },
  indexing: { text: 'Đang chuẩn bị để hỏi đáp', variant: 'info' },
  indexed: { text: 'Sẵn sàng dùng', variant: 'success' },
  ready: { text: 'Sẵn sàng dùng', variant: 'success' },
  failed: { text: 'Xử lý không thành công', variant: 'error' },
  index_failed: { text: 'Chuẩn bị không thành công', variant: 'error' },
};

export function ProcessingStatusBadge({ status }: { status: string }) {
  const entry = LABELS[status];
  if (!entry) {
    // Trạng thái lạ vẫn phải đọc được, không hiện mã kỹ thuật thô cho người dùng.
    return <Badge variant="neutral">Đang xử lý</Badge>;
  }
  return <Badge variant={entry.variant}>{entry.text}</Badge>;
}
