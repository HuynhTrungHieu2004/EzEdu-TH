"""Router tổng hợp cho phân hệ ngân hàng câu hỏi & ma trận đề — đăng ký ở
app/main.py với prefix `{API_V1_STR}` (mỗi router con đã tự có tiền tố path
riêng: /taxonomy, /questions, /exam-blueprints, /exams).
"""

from fastapi import APIRouter

from app.exam_bank.api import attempts, blueprints, exams, questions, study_exams, taxonomy

router = APIRouter(tags=["Exam Bank"])
router.include_router(taxonomy.router)
router.include_router(questions.router)
router.include_router(blueprints.router)
router.include_router(exams.router)
router.include_router(attempts.router)
router.include_router(study_exams.router)
