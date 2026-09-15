import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthenticatedUser, get_session, require_admin, require_viewer
from app.models.enums import VendorStatus
from app.schemas.vendor import (
    VendorCreateRequest,
    VendorResponse,
    VendorStatusChangeRequest,
    VendorUpdateRequest,
)
from app.services.vendor_service import VendorService

router = APIRouter(prefix="/api/v1/vendors", tags=["vendors"])
_service = VendorService()


@router.get("", response_model=list[VendorResponse])
async def list_vendors(
    status: VendorStatus | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
    _: AuthenticatedUser = Depends(require_viewer),
):
    return await _service.list(session, status=status, limit=limit, offset=offset)


@router.get("/{vendor_id}", response_model=VendorResponse)
async def get_vendor(
    vendor_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _: AuthenticatedUser = Depends(require_viewer),
):
    return await _service.get(session, vendor_id)


@router.post("", response_model=VendorResponse, status_code=201)
async def create_vendor(
    payload: VendorCreateRequest,
    session: AsyncSession = Depends(get_session),
    user: AuthenticatedUser = Depends(require_admin),
):
    return await _service.create(session, payload=payload, actor_id=user.id)


@router.patch("/{vendor_id}", response_model=VendorResponse)
async def update_vendor(
    vendor_id: uuid.UUID,
    payload: VendorUpdateRequest,
    session: AsyncSession = Depends(get_session),
    user: AuthenticatedUser = Depends(require_admin),
):
    return await _service.update(session, vendor_id=vendor_id, payload=payload, actor_id=user.id)


@router.post("/{vendor_id}/status", response_model=VendorResponse)
async def change_vendor_status(
    vendor_id: uuid.UUID,
    payload: VendorStatusChangeRequest,
    session: AsyncSession = Depends(get_session),
    user: AuthenticatedUser = Depends(require_admin),
):
    return await _service.change_status(session, vendor_id=vendor_id, payload=payload, actor_id=user.id)
