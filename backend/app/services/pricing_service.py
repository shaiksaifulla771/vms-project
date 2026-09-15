"""PricingService — effective-dated vendor pricing. A new quote never
overwrites an old one; docs/schema.sql's btree_gist EXCLUDE constraint
(ex_vendor_prices_no_overlap) is the actual source of truth for "no two
periods for the same MPN overlap" — this service's job is to translate
that Postgres-level rejection into a typed OverlappingVendorPriceError,
and to answer "what is current" / "what is the full history" /
"compare vendors for this material" queries."""

import uuid
from datetime import date

from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import NotFoundError
from app.models.material_vendor import MaterialVendor
from app.models.vendor import Vendor
from app.models.vendor_price import VendorPrice
from app.schemas.vendor_price import VendorPriceComparisonRow, VendorPriceCreateRequest
from app.services._db_errors import raise_for_integrity


class PricingService:
    async def create(
        self,
        session: AsyncSession,
        *,
        payload: VendorPriceCreateRequest,
        actor_id: uuid.UUID,
    ) -> VendorPrice:
        price = VendorPrice(
            id=uuid.uuid4(),
            material_vendor_id=payload.material_vendor_id,
            currency=payload.currency,
            unit_price=payload.unit_price,
            min_order_qty=payload.min_order_qty,
            valid_from=payload.valid_from,
            valid_to=payload.valid_to,
            source=payload.source,
            notes=payload.notes,
            created_by=actor_id,
        )
        session.add(price)
        try:
            await session.flush()
        except IntegrityError as exc:
            raise_for_integrity(
                exc,
                not_found=f"MPN mapping {payload.material_vendor_id} not found",
                conflict="Vendor price conflicts with an existing row",
                exclusion=(
                    f"A price period for material_vendor_id={payload.material_vendor_id} "
                    f"already covers {payload.valid_from}"
                    + (f" through {payload.valid_to}" if payload.valid_to else " onward")
                ),
            )
        return price

    async def close_open_period(
        self,
        session: AsyncSession,
        *,
        material_vendor_id: uuid.UUID,
        close_on: date,
        actor_id: uuid.UUID,
    ) -> VendorPrice | None:
        """Closes the currently-open price row (valid_to IS NULL) for this
        MPN by setting valid_to = close_on, so a new open-ended row can be
        inserted starting the next day without tripping the no-overlap
        EXCLUDE constraint. Returns None if there was no open row."""
        stmt = (
            select(VendorPrice)
            .where(VendorPrice.material_vendor_id == material_vendor_id, VendorPrice.valid_to.is_(None))
            .with_for_update()
        )
        result = await session.execute(stmt)
        open_row = result.scalar_one_or_none()
        if open_row is None:
            return None
        await session.execute(
            text(
                "UPDATE vendor_prices SET valid_to = :close_on, updated_by = :actor_id, "
                "updated_at = timezone('utc', now()) WHERE id = :id"
            ),
            {"close_on": close_on, "actor_id": str(actor_id), "id": str(open_row.id)},
        )
        await session.refresh(open_row)
        return open_row

    async def history(self, session: AsyncSession, material_vendor_id: uuid.UUID) -> list[VendorPrice]:
        stmt = (
            select(VendorPrice)
            .where(VendorPrice.material_vendor_id == material_vendor_id)
            .order_by(VendorPrice.valid_from.desc())
        )
        result = await session.execute(stmt)
        return list(result.scalars().all())

    async def current_for_mapping(
        self, session: AsyncSession, material_vendor_id: uuid.UUID, as_of: date | None = None
    ) -> VendorPrice:
        as_of = as_of or date.today()
        stmt = select(VendorPrice).where(
            VendorPrice.material_vendor_id == material_vendor_id,
            VendorPrice.valid_from <= as_of,
            (VendorPrice.valid_to.is_(None)) | (VendorPrice.valid_to > as_of),
        )
        result = await session.execute(stmt)
        price = result.scalar_one_or_none()
        if price is None:
            raise NotFoundError(f"No current price for MPN {material_vendor_id} as of {as_of}")
        return price

    async def compare_for_material(
        self, session: AsyncSession, material_id: uuid.UUID, as_of: date | None = None
    ) -> list[VendorPriceComparisonRow]:
        """Vendor-wise price comparison for one material — every vendor
        mapped to it, with their currently-effective price, cheapest
        first. Used by the pricing dashboard."""
        as_of = as_of or date.today()
        stmt = (
            select(
                MaterialVendor.id.label("material_vendor_id"),
                Vendor.id.label("vendor_id"),
                Vendor.name.label("vendor_name"),
                MaterialVendor.mpn_code,
                MaterialVendor.is_preferred,
                VendorPrice.currency,
                VendorPrice.unit_price,
                VendorPrice.min_order_qty,
                VendorPrice.valid_from,
                VendorPrice.valid_to,
            )
            .join(Vendor, Vendor.id == MaterialVendor.vendor_id)
            .join(VendorPrice, VendorPrice.material_vendor_id == MaterialVendor.id)
            .where(
                MaterialVendor.material_id == material_id,
                VendorPrice.valid_from <= as_of,
                (VendorPrice.valid_to.is_(None)) | (VendorPrice.valid_to > as_of),
            )
            .order_by(VendorPrice.unit_price.asc())
        )
        result = await session.execute(stmt)
        return [VendorPriceComparisonRow.model_validate(row) for row in result.mappings().all()]
