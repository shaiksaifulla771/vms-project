"""MpnService — material <-> vendor mapping (material_vendors). Enforces
uniqueness at both the API layer (a clear ConflictError) and the DB layer
(UNIQUE(material_id, vendor_id), UNIQUE(vendor_id, mpn_code), and the
partial unique index limiting a material to one preferred vendor —
docs/schema.sql)."""

import uuid

from sqlalchemy import select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import NotFoundError
from app.models.material_vendor import MaterialVendor
from app.schemas.mpn import MaterialVendorCreateRequest, MaterialVendorUpdateRequest
from app.services._db_errors import raise_for_integrity


class MpnService:
    async def create(
        self,
        session: AsyncSession,
        *,
        payload: MaterialVendorCreateRequest,
        actor_id: uuid.UUID,
    ) -> MaterialVendor:
        mapping = MaterialVendor(
            id=uuid.uuid4(),
            material_id=payload.material_id,
            vendor_id=payload.vendor_id,
            mpn_code=payload.mpn_code,
            specifications=payload.specifications,
            certifications=payload.certifications,
            is_hazardous=payload.is_hazardous,
            purchase_approved=payload.purchase_approved,
            is_preferred=payload.is_preferred,
            moq=payload.moq,
            lead_time_days=payload.lead_time_days,
            status=payload.status,
            created_by=actor_id,
        )
        session.add(mapping)
        try:
            await session.flush()
        except IntegrityError as exc:
            raise_for_integrity(
                exc,
                not_found="Referenced material or vendor not found",
                conflict=(
                    f"MPN mapping already exists for this material/vendor pair, this "
                    f"vendor already uses mpn_code {payload.mpn_code!r}, or this material "
                    "already has a preferred vendor"
                ),
            )
        return mapping

    async def update(
        self,
        session: AsyncSession,
        *,
        mapping_id: uuid.UUID,
        payload: MaterialVendorUpdateRequest,
        actor_id: uuid.UUID,
    ) -> MaterialVendor:
        mapping = await session.get(MaterialVendor, mapping_id, with_for_update=True)
        if mapping is None:
            raise NotFoundError(f"MPN mapping {mapping_id} not found")
        changes = payload.model_dump(exclude_unset=True)
        if not changes:
            return mapping
        changes["updated_by"] = actor_id
        try:
            await session.execute(
                update(MaterialVendor)
                .where(MaterialVendor.id == mapping_id)
                .values(updated_at=text("timezone('utc', now())"), **changes)
            )
        except IntegrityError as exc:
            raise_for_integrity(
                exc,
                not_found="Referenced entity not found",
                conflict=f"MPN update conflicts with an existing mapping for id {mapping_id}",
            )
        await session.refresh(mapping)
        return mapping

    async def set_preferred(
        self,
        session: AsyncSession,
        *,
        mapping_id: uuid.UUID,
        actor_id: uuid.UUID,
    ) -> MaterialVendor:
        """Sets this mapping as the preferred vendor for its material,
        clearing any previous preferred mapping for the same material
        first — both statements run inside the caller's single request
        transaction, so a concurrent call serializes on the row locks
        rather than tripping the partial-unique-index race."""
        mapping = await session.get(MaterialVendor, mapping_id, with_for_update=True)
        if mapping is None:
            raise NotFoundError(f"MPN mapping {mapping_id} not found")
        await session.execute(
            update(MaterialVendor)
            .where(MaterialVendor.material_id == mapping.material_id, MaterialVendor.is_preferred.is_(True))
            .values(is_preferred=False, updated_by=actor_id, updated_at=text("timezone('utc', now())"))
        )
        await session.execute(
            update(MaterialVendor)
            .where(MaterialVendor.id == mapping_id)
            .values(is_preferred=True, updated_by=actor_id, updated_at=text("timezone('utc', now())"))
        )
        await session.refresh(mapping)
        return mapping

    async def list(
        self,
        session: AsyncSession,
        *,
        material_id: uuid.UUID | None = None,
        vendor_id: uuid.UUID | None = None,
        limit: int = 200,
        offset: int = 0,
    ) -> list[MaterialVendor]:
        stmt = select(MaterialVendor).order_by(MaterialVendor.mpn_code).limit(limit).offset(offset)
        if material_id is not None:
            stmt = stmt.where(MaterialVendor.material_id == material_id)
        if vendor_id is not None:
            stmt = stmt.where(MaterialVendor.vendor_id == vendor_id)
        result = await session.execute(stmt)
        return list(result.scalars().all())

    async def get(self, session: AsyncSession, mapping_id: uuid.UUID) -> MaterialVendor:
        m = await session.get(MaterialVendor, mapping_id)
        if m is None:
            raise NotFoundError(f"MPN mapping {mapping_id} not found")
        return m
