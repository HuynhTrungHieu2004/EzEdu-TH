from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.core.config import settings
from app.routers.auth import get_current_user
from app.schemas.auth import UserResponse
from app.personalization.schemas.digital_twin import (
    DigitalTwinKnowledgeResponse,
    DigitalTwinProgressResponse,
    DigitalTwinResponse,
    LearningGoalsUpdateRequest,
    digital_twin_knowledge_view,
    digital_twin_progress_view,
)
from app.personalization.schemas.onboarding import (
    StudentOnboardingOptionsResponse,
    StudentOnboardingRequest,
    StudentOnboardingResponse,
    SubjectOptionResponse,
    ExamCombinationOptionResponse,
    VN_EXAM_COMBINATIONS,
    VN_SUBJECTS,
)
from app.personalization.services.digital_twin_service import (
    get_current_user_digital_twin,
    get_current_user_student_onboarding,
    update_current_user_student_onboarding,
    update_current_user_learning_preferences,
)
from app.services.activity_log_service import record_activity

router = APIRouter()

# Student onboarding is basic profile setup (grade/subjects/exam-combination), not an
# AI/recommendation feature. It must keep working even when PERSONALIZATION_ENABLED is
# off, otherwise every new student account is stuck at the mandatory onboarding step
# with no way to finish registration. Mounted separately in app.main without the
# enable_personalization feature-flag dependency.
onboarding_router = APIRouter()


def ensure_personalization_enabled() -> None:
    if not settings.PERSONALIZATION_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Personalization is disabled.",
        )


@router.get("/me", response_model=DigitalTwinResponse)
async def get_my_digital_twin(current_user: UserResponse = Depends(get_current_user)):
    ensure_personalization_enabled()
    return await get_current_user_digital_twin(current_user.id)


@onboarding_router.get("/me/onboarding/options", response_model=StudentOnboardingOptionsResponse)
async def get_student_onboarding_options(current_user: UserResponse = Depends(get_current_user)):
    if current_user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Hồ sơ học tập ban đầu chỉ dành cho tài khoản học sinh.",
        )
    return StudentOnboardingOptionsResponse(
        grades=[6, 7, 8, 9, 10, 11, 12],
        subjects=[
            SubjectOptionResponse(id=subject_id, label=label)
            for subject_id, label in VN_SUBJECTS.items()
        ],
        exam_combinations=[
            ExamCombinationOptionResponse(
                code=code,
                label=f"{code} ({', '.join(subjects)})",
                subjects=list(subjects),
                group=code[0] if code[0].isalpha() and code[0] != "N" else "Mới",
            )
            for code, subjects in VN_EXAM_COMBINATIONS.items()
        ],
    )


@onboarding_router.get("/me/onboarding", response_model=StudentOnboardingResponse | None)
async def get_my_student_onboarding(current_user: UserResponse = Depends(get_current_user)):
    if current_user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Hồ sơ học tập ban đầu chỉ dành cho tài khoản học sinh.",
        )
    return await get_current_user_student_onboarding(current_user.id)


@onboarding_router.put("/me/onboarding", response_model=StudentOnboardingResponse)
async def update_my_student_onboarding(
    payload: StudentOnboardingRequest,
    current_user: UserResponse = Depends(get_current_user),
    request: Request = None,
):
    if current_user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Hồ sơ học tập ban đầu chỉ dành cho tài khoản học sinh.",
        )
    response = await update_current_user_student_onboarding(current_user.id, payload)
    await record_activity(
        action="profile_updated",
        category="profile",
        status="success",
        user_id=current_user.id,
        resource_type="learner_profile",
        resource_id=current_user.id,
        request=request,
        metadata={
            "profile_section": "student_onboarding",
            "grade_level": payload.grade_level,
            "strong_subject_count": len(payload.strong_subjects),
            "weak_subject_count": len(payload.weak_subjects),
            "target_exam_combination_count": len(payload.target_exam_combinations),
        },
    )
    return response


@router.get("/me/knowledge", response_model=DigitalTwinKnowledgeResponse)
async def get_my_digital_twin_knowledge(current_user: UserResponse = Depends(get_current_user)):
    ensure_personalization_enabled()
    twin = await get_current_user_digital_twin(current_user.id)
    return digital_twin_knowledge_view(twin)


@router.get("/me/progress", response_model=DigitalTwinProgressResponse)
async def get_my_digital_twin_progress(current_user: UserResponse = Depends(get_current_user)):
    ensure_personalization_enabled()
    twin = await get_current_user_digital_twin(current_user.id)
    return digital_twin_progress_view(twin)


@router.patch("/me/goals", response_model=DigitalTwinResponse)
async def update_my_learning_goals(
    payload: LearningGoalsUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
    request: Request = None,
):
    ensure_personalization_enabled()
    response = await update_current_user_learning_preferences(current_user.id, payload)
    await record_activity(
        action="profile_updated",
        category="profile",
        status="success",
        user_id=current_user.id,
        resource_type="learner_profile",
        resource_id=current_user.id,
        request=request,
        metadata={
            "profile_section": "learning_goals",
            "learning_goal_count": len(payload.learning_goals),
            "preferred_subject_count": len(payload.preferred_subjects),
            "preferred_content_type_count": len(payload.preferred_content_types),
            "preferred_explanation_style": payload.preferred_explanation_style,
            "preferred_session_minutes": payload.preferred_session_minutes,
        },
    )
    return response
