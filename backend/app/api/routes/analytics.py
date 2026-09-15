from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthenticatedUser, get_session, require_viewer
from app.schemas.analytics import VendorScorecardRow
from app.services.analytics_service import AnalyticsService

router = APIRouter(prefix="/api/v1/analytics", tags=["analytics"])
_service = AnalyticsService()


@router.get("/vendor-scorecard", response_model=list[VendorScorecardRow])
async def vendor_scorecard(
    session: AsyncSession = Depends(get_session),
    _: AuthenticatedUser = Depends(require_viewer),
):
    return await _service.vendor_scorecard(session)
