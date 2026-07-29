/**
 * Học liệu đã dùng được cho việc sinh đề và hỏi đáp hay chưa.
 *
 * Tách khỏi ProcessingStatusBadge.tsx để file component chỉ export component —
 * điều kiện để Fast Refresh của Vite hoạt động đúng.
 */
export function isDocumentReady(status: string): boolean {
  return status === 'indexed';
}
