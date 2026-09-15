"""LocationService / WarehouseService — plain admin-only CRUD, mirroring
master_service.py's style. No business rules of their own: the
one-default-warehouse-per-location invariant is enforced entirely by
internal.trg_auto_create_default_warehouse (docs/schema.sql section 13),
never by application code."""

import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import LocationNotFoundError, NotFoundError
from app.models.location import Location, Warehouse
from app.schemas.location import LocationCreateRequest, WarehouseCreateRequest
from app.services._db_errors import raise_for_integrity


class LocationService:
    async def create(self, session: AsyncSession, *, payload: LocationCreateRequest, actor_id: uuid.UUID) -> Location:
        location = Location(
            id=uuid.uuid4(), name=payload.name, code=payload.code, address=payload.address, created_by=actor_id
        )
        session.add(location)
        try:
            await session.flush()
        except IntegrityError as exc:
            raise_for_integrity(
                exc,
                not_found="Referenced entity not found",
                conflict=f"Location name/code already exists: {payload.name!r}/{payload.code!r}",
            )
        return location

    async def list(self, session: AsyncSession) -> list[Location]:
        result = await session.execute(select(Location).order_by(Location.name))
        return list(result.scalars().all())

    async def get(self, session: AsyncSession, location_id: uuid.UUID) -> Location:
        location = await session.get(Location, location_id)
        if location is None:
            raise LocationNotFoundError(f"Location {location_id} not found")
        return location


class WarehouseService:
    async def create(
        self, session: AsyncSession, *, payload: WarehouseCreateRequest, actor_id: uuid.UUID
    ) -> Warehouse:
        location = await session.get(Location, payload.location_id)
        if location is None:
            raise NotFoundError(f"Location {payload.location_id} not found")

        warehouse = Warehouse(
            id=uuid.uuid4(),
            location_id=payload.location_id,
            name=payload.name,
            code=payload.code,
            is_default=payload.is_default,
            created_by=actor_id,
        )
        session.add(warehouse)
        try:
            await session.flush()
        except IntegrityError as exc:
            raise_for_integrity(
                exc,
                not_found=f"Location {payload.location_id} not found",
                conflict=f"Warehouse code {payload.code!r} already exists at location {payload.location_id}",
            )
        return warehouse

    async def list(self, session: AsyncSession, *, location_id: uuid.UUID | None = None) -> list[Warehouse]:
        stmt = select(Warehouse)
        if location_id is not None:
            stmt = stmt.where(Warehouse.location_id == location_id)
        result = await session.execute(stmt.order_by(Warehouse.code))
        return list(result.scalars().all())
