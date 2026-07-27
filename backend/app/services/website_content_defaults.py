from __future__ import annotations

from copy import deepcopy
from typing import Any


DEFAULT_WEBSITE_CONTENT: dict[str, dict[str, Any]] = {
    "site_identity": {
        "site_name": "EzEdu AI",
        "logo_text": "EzEdu AI",
        "favicon_url": "/favicon.svg",
        "logo_url": "",
        "slogan": "Biến học liệu thành đề thi dễ dàng",
    },
    "header": {
        "menu": [
            {"label": "Tính năng", "href": "#tinh-nang", "order": 1, "visible": True},
            {"label": "Cách hoạt động", "href": "#how-it-works", "order": 2, "visible": True},
            {"label": "Sơ đồ xử lý", "href": "#workflow", "order": 3, "visible": True},
            {"label": "Vì sao chọn EzEdu", "href": "#benefits", "order": 4, "visible": True},
        ],
        "login_label": "Đăng nhập",
        "primary_cta_label": "Bắt đầu miễn phí",
        "authenticated_cta_label": "Tải học liệu",
    },
    "hero": {
        "title": "Xử lý học liệu điện tử",
        "highlight": "thành đề thi miễn phí",
        "description": "Tải lên PDF, Word, PowerPoint hoặc video từ máy tính. EzEdu AI tự động trích xuất nội dung, phân tích chủ đề, kiểm tra kiến thức và tạo câu hỏi kèm đáp án, lời giải thích và mức độ khó.",
        "primary_cta_label": "Bắt đầu tạo đề",
        "secondary_cta_label": "Xem cách hoạt động",
        "sticker_image_url": "",
        "upload_enabled": True,
        "chips": ["PDF · DOCX · PPTX · Video", "Tìm đúng nội dung", "Tạo câu hỏi nhanh", "Có đáp án và lời giải"],
    },
    "sections": {
        "items": [
            {"key": "features", "title": "Xem EzEdu AI tạo đề thi", "eyebrow": "Kết quả thực tế", "description": "Câu hỏi được sinh ra kèm đáp án, lời giải thích và mức độ phù hợp.", "enabled": True, "order": 1},
            {"key": "how_it_works", "title": "4 bước để biến học liệu thành đề kiểm tra", "eyebrow": "Hướng dẫn sử dụng", "description": "EzEdu AI đơn giản hóa toàn bộ quá trình từ tải học liệu đến xuất bộ câu hỏi hoàn chỉnh.", "enabled": True, "order": 2},
            {"key": "workflow", "title": "Luồng xử lý học liệu", "eyebrow": "Sơ đồ xử lý", "description": "Từ học liệu đầu vào đến ngân hàng câu hỏi có kiểm tra chất lượng.", "enabled": True, "order": 3},
            {"key": "benefits", "title": "Tại sao nên chọn EzEdu AI?", "eyebrow": "Lợi ích", "description": "EzEdu AI giúp giảm thao tác thủ công và tổ chức toàn bộ quy trình xử lý học liệu trong một hệ thống.", "enabled": True, "order": 4},
            {"key": "testimonials", "title": "Đánh giá", "eyebrow": "Người dùng", "description": "Khu vực đánh giá đang được chuẩn bị.", "enabled": False, "order": 5},
            {"key": "faq", "title": "FAQ", "eyebrow": "Câu hỏi thường gặp", "description": "Khu vực FAQ đang được chuẩn bị.", "enabled": False, "order": 6},
        ],
        "benefits": [
            {"title": "Hỗ trợ nhiều loại học liệu", "description": "Xử lý tài liệu văn bản, trình chiếu, PDF và video từ máy tính."},
            {"title": "Tạo câu hỏi theo nội dung", "description": "Hệ thống bám vào học liệu đã tải lên để tạo câu hỏi, đáp án và lời giải thích phù hợp hơn với tài liệu."},
            {"title": "Hạn chế câu hỏi sai lệch", "description": "Câu hỏi được tạo dựa trên nội dung học liệu và có thể trải qua bước kiểm tra chất lượng trước khi sử dụng."},
            {"title": "Quản lý dữ liệu tập trung", "description": "Lưu học liệu, câu hỏi, lịch sử sinh đề, kết quả làm bài và các phiên làm việc trong cơ sở dữ liệu."},
            {"title": "Dễ chỉnh sửa và xuất đề", "description": "Người dùng có thể xem lại, chỉnh sửa, lưu và xuất bộ câu hỏi phục vụ học tập và giảng dạy."},
        ],
    },
    "footer": {
        "contact_label": "Hỗ trợ",
        "email": "support@ezedu.ai",
        "copyright": "© 2026 EzEdu AI. Biến học liệu thành đề thi dễ dàng.",
        "socials": [],
        "policies": [
            {"label": "Chính sách bảo mật", "href": "#privacy", "visible": True},
            {"label": "Điều khoản sử dụng", "href": "#terms", "visible": True},
        ],
    },
}


def default_content() -> dict[str, dict[str, Any]]:
    return deepcopy(DEFAULT_WEBSITE_CONTENT)


def default_section(section_key: str) -> dict[str, Any]:
    return deepcopy(DEFAULT_WEBSITE_CONTENT.get(section_key, {}))
