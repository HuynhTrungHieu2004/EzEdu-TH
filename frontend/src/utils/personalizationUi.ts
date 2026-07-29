export type PersonalizationFeatureError = {
  response?: {
    status?: number;
    data?: {
      detail?: unknown;
    };
  };
};

export function formatPercentEstimate(value?: number | null, fallback = 'Chưa đủ dữ liệu') {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

export function formatMasteryEstimate(value?: number | null) {
  const percent = formatPercentEstimate(value, '');
  return percent ? `Ước tính thành thạo ${percent}` : 'Cần thêm bài làm để đánh giá';
}

export function profileConfidenceLabel(confidence?: number | null) {
  if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0.35) {
    return 'Dữ liệu còn hạn chế';
  }
  if (confidence < 0.7) {
    return 'Độ tin cậy trung bình';
  }
  return 'Độ tin cậy tốt';
}

export function knowledgeStatusLabel(status: string) {
  const labels: Record<string, string> = {
    mastered: 'Đã nắm vững',
    learning: 'Đang học',
    weak: 'Cần củng cố',
    uncertain: 'Chưa chắc chắn',
    unassessed: 'Chưa đánh giá',
    at_risk_of_forgetting: 'Nguy cơ quên',
  };
  return labels[status] ?? status;
}

export function reasonCodeLabel(reasonCode: string) {
  const labels: Record<string, string> = {
    IMPROVE_WEAK_SKILL: 'Củng cố phần còn yếu',
    REVIEW_BEFORE_FORGETTING: 'Ôn lại trước khi quên',
    FILL_PREREQUISITE_GAP: 'Bù kiến thức nền',
    MATCH_LEARNING_GOAL: 'Phù hợp mục tiêu học tập',
    SUITABLE_DIFFICULTY: 'Độ khó vừa sức',
    CONTINUE_LEARNING_PATH: 'Tiếp tục mạch học hiện tại',
    EXPLORE_RELATED_TOPIC: 'Khám phá chủ đề liên quan',
  };
  return labels[reasonCode] ?? reasonCode.replaceAll('_', ' ').toLowerCase();
}

export function splitPreferenceInput(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

/**
 * Nhận diện trường hợp tính năng cá nhân hoá bị quản trị viên tắt.
 *
 * Backend dùng dependency `require_feature_enabled` và trả **403** kèm thông
 * điệp tiếng Việt "Tính năng hiện đang bị tắt bởi quản trị viên." Bản trước chỉ
 * kiểm tra 404 và chuỗi tiếng Anh "disabled", nên không bao giờ khớp — nhánh xử
 * lý tính năng-bị-tắt trở thành code chết và người dùng nhận thông báo lỗi
 * chung chung trên một trang gần như trắng.
 *
 * Vẫn giữ nhánh 404 để tương thích nếu backend đổi mã trạng thái về sau.
 */
export function isPersonalizationFeatureDisabled(error: unknown) {
  const maybeError = error as PersonalizationFeatureError;
  const status = maybeError?.response?.status;
  if (status !== 403 && status !== 404) return false;

  const detail = maybeError?.response?.data?.detail;
  if (typeof detail !== 'string') return false;

  const normalized = detail.toLowerCase();
  return normalized.includes('disabled') || normalized.includes('bị tắt');
}
