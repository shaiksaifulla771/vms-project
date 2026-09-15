import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthenticatedUser, get_session, require_admin, require_viewer
from app.models.enums import ItemClassification, MasterDataStatus
from app.schemas.material import MaterialCreateRequest, MaterialResponse, MaterialUpdateRequest
from app.services.master_service import MaterialService

router = APIRouter(prefix="/api/v1/materials", tags=["materials"])
_service = MaterialService()


@router.get("", response_model=list[MaterialResponse])
async def list_materials(
    classification: ItemClassification | None = None,
    status: MasterDataStatus | None = None,
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
    _: AuthenticatedUser = Depends(require_viewer),
):
    return await _service.list(
        session, classification=classification, status=status, limit=limit, offset=offset
    )


@router.get("/{material_id}", response_model=MaterialResponse)
async def get_material(
    material_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _: AuthenticatedUser = Depends(require_viewer),
):
    return await _service.get(session, material_id)


@router.post("", response_model=MaterialResponse, status_code=201)
async def create_material(
    payload: MaterialCreateRequest,
    session: AsyncSession = Depends(get_session),
    user: AuthenticatedUser = Depends(require_admin),
):
    return await _service.create(session, payload=payload, actor_id=user.id)


@router.patch("/{material_id}", response_model=MaterialResponse)
async def update_material(
    material_id: uuid.UUID,
    payload: MaterialUpdateRequest,
    session: AsyncSession = Depends(get_session),
    user: AuthenticatedUser = Depends(require_admin),
):
    return await _service.update(session, material_id=material_id, payload=payload, actor_id=user.id)
