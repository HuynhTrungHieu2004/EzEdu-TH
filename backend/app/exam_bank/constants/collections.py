"""Tên collection MongoDB dùng cho phân hệ ngân hàng câu hỏi & ma trận đề.

Đặt tên tập trung một nơi — tránh gõ tay chuỗi rải rác khắp service/router
(đúng quy ước đã áp dụng ở `app/personalization/constants/collections.py`).
"""

CURRICULUM_TAXONOMY = "curriculum_taxonomy"
QUESTIONS = "questions"
EXAM_BLUEPRINTS = "exam_blueprints"
EXAMS = "exams"
EXAM_ATTEMPTS = "exam_attempts"
