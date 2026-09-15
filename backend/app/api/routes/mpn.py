import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthenticatedUser, get_session, require_admin, require_viewer
from app.schemas.mpn import MaterialVendorCreateRequest, MaterialVendorResponse, MaterialVendorUpdateRequest
from app.services.mpn_service import MpnService

router = APIRouter(prefix="/api/v1/mpn", tags=["mpn"])
_service = MpnService()


@router.get("", response_model=list[MaterialVendorResponse])
async def list_mpn(
    material_id: uuid.UUID | None = None,
    vendor_id: uuid.UUID | None = None,
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
    _: AuthenticatedUser = Depends(require_viewer),
):
    return await _service.list(
        session, material_id=material_id, vendor_id=vendor_id, limit=limit, offset=offset
    )


@router.get("/{mapping_id}", response_model=MaterialVendorResponse)
async def get_mpn(
    mapping_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _: AuthenticatedUser = Depends(require_viewer),
):
    return await _service.get(session, mapping_id)


@router.post("", response_model=MaterialVendorResponse, status_code=201)
async def create_mpn(
    payload: MaterialVendorCreateRequest,
    session: AsyncSession = Depends(get_session),
    user: AuthenticatedUser = Depends(require_admin),
):
    return await _service.create(session, payload=payload, actor_id=user.id)


@router.patch("/{mapping_id}", response_model=MaterialVendorResponse)
async def update_mpn(
    mapping_id: uuid.UUID,
    payload: MaterialVendorUpdateRequest,
    session: AsyncSession = Depends(get_session),
    user: AuthenticatedUser = Depends(require_admin),
):
    return await _service.update(session, mapping_id=mapping_id, payload=payload, actor_id=user.id)


@router.post("/{mapping_id}/set-preferred", response_model=MaterialVendorResponse)
async def set_preferred_mpn(
    mapping_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: AuthenticatedUser = Depends(require_admin),
):
    return await _service.set_preferred(session, mapping_id=mapping_id, actor_id=user.id)
