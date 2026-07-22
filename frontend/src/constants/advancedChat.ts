import type { RetrievalMode, EvidenceStatus, ExternalSearchStatus, ResponseStyle } from '../types/chat';

export const SCOPE_LABELS: Record<string, string> = {
  general: 'Tự động chọn nguồn',
  document: 'Một tài liệu',
  multiple_documents: 'Nhiều tài liệu',
  all_documents: 'Toàn bộ học liệu',
  web_only: 'Chỉ tìm kiếm Internet',
};

export const RETRIEVAL_MODE_LABELS: Record<RetrievalMode, string> = {
  internal_only: 'Chỉ dùng học liệu',
  web_only: 'Dùng nguồn Internet',
  hybrid: 'Kết hợp học liệu & Internet',
  model_knowledge: 'Kiến thức nền tảng',
  clarification_required: 'Cần thêm thông tin',
};

export const EVIDENCE_STATUS_LABELS: Record<EvidenceStatus, string> = {
  well_supported: 'Có nguồn hỗ trợ tốt',
  partially_supported: 'Được hỗ trợ một phần',
  insufficient_evidence: 'Chưa đủ bằng chứng',
  conflicting_sources: 'Các nguồn mâu thuẫn',
  unverified: 'Chưa được kiểm chứng',
};

export const EXTERNAL_SEARCH_STATUS_LABELS: Record<ExternalSearchStatus, string> = {
  success: 'Đã tìm kiếm nguồn Internet',
  failed: 'Tìm kiếm Internet thất bại',
  unavailable: 'Tìm kiếm Internet chưa cấu hình',
  no_results: 'Không tìm thấy nguồn Internet phù hợp',
  not_used: 'Không dùng tìm kiếm Internet',
};

export const RESPONSE_STYLE_LABELS: Record<ResponseStyle, string> = {
  concise: 'Ngắn gọn',
  normal: 'Bình thường',
  detailed: 'Chi tiết',
  beginner: 'Dễ hiểu cho người mới',
};
