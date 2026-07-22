import axios from 'axios';
import { getApiErrorDetail } from '../api/errors';

export function getChatErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    if (error instanceof Error) {
      return error.message;
    }
    return 'Lỗi không xác định.';
  }

  if (error.code === 'ECONNABORTED' || error.message.toLowerCase().includes('timeout')) {
    return 'Yêu cầu kết nối quá hạn (Timeout). Vui lòng thử gửi lại câu hỏi.';
  }
  if (!error.response) {
    return 'Lỗi kết nối máy chủ (Network Error). Vui lòng kiểm tra lại đường truyền mạng.';
  }

  const status = error.response.status;
  const detail = getApiErrorDetail(error);

  switch (status) {
    case 400:
      return detail ?? 'Yêu cầu không hợp lệ. Vui lòng kiểm tra lại nội dung.';
    case 401:
      return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
    case 403:
      return 'Bạn không có quyền truy cập hội thoại hoặc tài liệu học liệu này.';
    case 404:
      return 'Không tìm thấy cuộc trò chuyện hoặc học liệu được chỉ định.';
    case 409:
      return 'Tin nhắn trước đó đang được xử lý. Vui lòng đợi trong giây lát.';
    case 422:
      return 'Định dạng câu hỏi không hợp lệ hoặc vượt quá dung lượng quy định.';
    case 429:
      return 'Bạn đã gửi quá nhiều câu hỏi trong thời gian ngắn (Rate Limit). Vui lòng thử lại sau.';
    case 500:
      return 'Hệ thống AI đang gặp sự cố nội bộ. Vui lòng thử lại sau ít phút.';
    case 503:
      return 'Dịch vụ AI hoặc công cụ tìm kiếm hiện đang bận hoặc chưa sẵn sàng.';
    default:
      return detail ?? `Đã xảy ra lỗi hệ thống (Mã lỗi: ${status}). Vui lòng thử lại.`;
  }
}
