import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthenticatedUser, get_session, require_admin, require_viewer
from app.schemas.location import (
    LocationCreateRequest,
    LocationResponse,
    WarehouseCreateRequest,
    WarehouseResponse,
)
from app.services.location_service import LocationService, WarehouseService

router = APIRouter(prefix="/api/v1", tags=["locations"])
_locations = LocationService()
_warehouses = WarehouseService()


@router.get("/locations", response_model=list[LocationResponse])
async def list_locations(
    session: AsyncSession = Depends(get_session),
    _: AuthenticatedUser = Depends(require_viewer),
):
    return await _locations.list(session)


@router.get("/locations/{location_id}", response_model=LocationResponse)
async def get_location(
    location_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _: AuthenticatedUser = Depends(require_viewer),
):
    return await _locations.get(session, location_id)


@router.post("/locations", response_model=LocationResponse, status_code=201)
async def create_location(
    payload: LocationCreateRequest,
    session: AsyncSession = Depends(get_session),
    user: AuthenticatedUser = Depends(require_admin),
):
    return await _locations.create(session, payload=payload, actor_id=user.id)


@router.get("/warehouses", response_model=list[WarehouseResponse])
async def list_warehouses(
    location_id: uuid.UUID | None = None,
    session: AsyncSession = Depends(get_session),
    _: AuthenticatedUser = Depends(require_viewer),
):
    return await _warehouses.list(session, location_id=location_id)


@router.post("/warehouses", response_model=WarehouseResponse, status_code=201)
async def create_warehouse(
    payload: WarehouseCreateRequest,
    session: AsyncSession = Depends(get_session),
    user: AuthenticatedUser = Depends(require_admin),
):
    return await _warehouses.create(session, payload=payload, actor_id=user.id)
