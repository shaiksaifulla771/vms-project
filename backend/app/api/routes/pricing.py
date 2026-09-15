import uuid
from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthenticatedUser, get_session, require_admin, require_viewer
from app.schemas.vendor_price import (
    VendorPriceComparisonRow,
    VendorPriceCreateRequest,
    VendorPriceResponse,
)
from app.services.pricing_service import PricingService

router = APIRouter(prefix="/api/v1/pricing", tags=["pricing"])
_service = PricingService()


@router.post("", response_model=VendorPriceResponse, status_code=201)
async def create_price(
    payload: VendorPriceCreateRequest,
    session: AsyncSession = Depends(get_session),
    user: AuthenticatedUser = Depends(require_admin),
):
    return await _service.create(session, payload=payload, actor_id=user.id)


@router.get("/mpn/{material_vendor_id}/history", response_model=list[VendorPriceResponse])
async def price_history(
    material_vendor_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _: AuthenticatedUser = Depends(require_viewer),
):
    return await _service.history(session, material_vendor_id)


@router.get("/mpn/{material_vendor_id}/current", response_model=VendorPriceResponse)
async def current_price(
    material_vendor_id: uuid.UUID,
    as_of: date | None = None,
    session: AsyncSession = Depends(get_session),
    _: AuthenticatedUser = Depends(require_viewer),
):
    return await _service.current_for_mapping(session, material_vendor_id, as_of=as_of)


@router.get("/material/{material_id}/compare", response_model=list[VendorPriceComparisonRow])
async def compare_vendors_for_material(
    material_id: uuid.UUID,
    as_of: date | None = None,
    session: AsyncSession = Depends(get_session),
    _: AuthenticatedUser = Depends(require_viewer),
):
    return await _service.compare_for_material(session, material_id, as_of=as_of)
