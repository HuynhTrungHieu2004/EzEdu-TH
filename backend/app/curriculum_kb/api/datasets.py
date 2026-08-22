from fastapi import APIRouter, Depends

from app.curriculum_kb.api.deps import require_dataset_admin
from app.curriculum_kb.schemas.dataset_report import DatasetReportResponse
from app.curriculum_kb.services.dataset_service import dataset_coverage_report
from app.database.mongodb import get_database
from app.schemas.auth import UserResponse

router = APIRouter()


@router.get(
    "/curriculum-kb/datasets/{dataset_key}/report",
    response_model=DatasetReportResponse,
)
async def get_dataset_report(
    dataset_key: str,
    current_user: UserResponse = Depends(require_dataset_admin),
) -> DatasetReportResponse:
    report = await dataset_coverage_report(get_database(), dataset_key)
    return DatasetReportResponse.model_validate(report)
