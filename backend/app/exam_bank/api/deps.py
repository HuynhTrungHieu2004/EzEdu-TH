"""Dependency dùng chung cho router ngân hàng câu hỏi & ma trận đề.

Vai trò được phép: giống hệt tập vai trò `_can_manage_questions` hiện có ở
`app/routers/questions.py` — {"user","lecturer","admin","super_admin"}. Học
sinh KHÔNG được vào bất kỳ endpoint nào ở đây (đúng yêu cầu "Không hiện công
cụ này cho học sinh").

Cổng bằng feature flag `ENABLE_EXAM_BLUEPRINT`/`ENABLE_TIMED_EXAM` — thêm ở
Giai đoạn 8 (QA cuối), phát hiện thiếu khi so lại với kế hoạch ở
`01-target-architecture.md` (đã có `ENABLE_WEB_KNOWLEDGE`/`ENABLE_CURRICULUM_KB`
cho Giai đoạn 6/7 nhưng phân hệ này bị bỏ sót công tắc quản trị). Tách 2 flag
riêng (không dùng chung 1 flag) để có thể bật ngân hàng câu hỏi/ma trận đề
cho giáo viên soạn đề trước, trong khi vẫn tắt việc học sinh làm bài thi thật
cho tới khi sẵn sàng — đúng tinh thần "bật dần theo roadmap" đã đặt ra.
"""

from fastapi import Depends, HTTPException, status

from app.core.config import settings
from app.routers.auth import get_current_user
from app.schemas.auth import UserResponse

_ALLOWED_ROLES = {"user", "lecturer", "admin", "super_admin"}
_ADMIN_ROLES = {"admin", "super_admin"}


async def require_exam_bank_actor(current_user: UserResponse = Depends(get_current_user)) -> UserResponse:
    if not settings.ENABLE_EXAM_BLUEPRINT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Ngân hàng câu hỏi & ma trận đề hiện chưa được bật.",
        )
    role = getattr(current_user, "role", "user")
    if role not in _ALLOWED_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ giáo viên và quản trị viên được dùng ngân hàng câu hỏi & ma trận đề.",
        )
    return current_user


def is_admin_actor(user: UserResponse) -> bool:
    return getattr(user, "role", "user") in _ADMIN_ROLES


async def require_student_actor(current_user: UserResponse = Depends(get_current_user)) -> UserResponse:
    if not settings.ENABLE_TIMED_EXAM:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Làm bài thi có giới hạn thời gian hiện chưa được bật.",
        )
    if getattr(current_user, "role", "user") != "student":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Chỉ học sinh mới làm bài thi.")
    return current_user
