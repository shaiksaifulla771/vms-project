"""Material, product, and BOM services. These are plain admin-only CRUD
(RLS admin_write policies), no lifecycle rules of their own — the only
business-rule table in the master-data set is `boms`, where at most one
version per product may be active (partial unique index)."""

import uuid

from sqlalchemy import select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import NotFoundError
from app.models.bom import Bom, BomItem
from app.models.enums import ItemClassification, MasterDataStatus
from app.models.material import Material
from app.models.product import Product
from app.schemas.bom import BomCreateRequest
from app.schemas.material import MaterialCreateRequest, MaterialUpdateRequest
from app.schemas.product import ProductCreateRequest, ProductUpdateRequest
from app.services._db_errors import raise_for_integrity


class MaterialService:
    async def create(
        self, session: AsyncSession, *, payload: MaterialCreateRequest, actor_id: uuid.UUID
    ) -> Material:
        material = Material(
            id=uuid.uuid4(),
            code=payload.code,
            name=payload.name,
            classification=payload.classification,
            uom=payload.uom,
            hsn_code=payload.hsn_code,
            safety_stock=payload.safety_stock,
            reorder_point=payload.reorder_point,
            moq=payload.moq,
            lead_time_days=payload.lead_time_days,
            is_hazardous=payload.is_hazardous,
            status=payload.status,
            created_by=actor_id,
        )
        session.add(material)
        try:
            await session.flush()
        except IntegrityError as exc:
            raise_for_integrity(
                exc,
                not_found="Referenced entity not found",
                conflict=f"Material code already exists: {payload.code!r}",
            )
        return material

    async def update(
        self,
        session: AsyncSession,
        *,
        material_id: uuid.UUID,
        payload: MaterialUpdateRequest,
        actor_id: uuid.UUID,
    ) -> Material:
        material = await session.get(Material, material_id, with_for_update=True)
        if material is None:
            raise NotFoundError(f"Material {material_id} not found")
        changes = payload.model_dump(exclude_unset=True)
        if not changes:
            return material
        changes["updated_by"] = actor_id
        try:
            await session.execute(
                update(Material)
                .where(Material.id == material_id)
                .values(updated_at=text("timezone('utc', now())"), **changes)
            )
        except IntegrityError as exc:
            raise_for_integrity(
                exc,
                not_found="Referenced entity not found",
                conflict=f"Material update conflicts with an existing row for id {material_id}",
            )
        await session.refresh(material)
        return material

    async def list(
        self,
        session: AsyncSession,
        *,
        classification: ItemClassification | None = None,
        status: MasterDataStatus | None = None,
        limit: int = 200,
        offset: int = 0,
    ) -> list[Material]:
        stmt = select(Material).order_by(Material.name).limit(limit).offset(offset)
        if classification is not None:
            stmt = stmt.where(Material.classification == classification)
        if status is not None:
            stmt = stmt.where(Material.status == status)
        result = await session.execute(stmt)
        return list(result.scalars().all())

    async def get(self, session: AsyncSession, material_id: uuid.UUID) -> Material:
        m = await session.get(Material, material_id)
        if m is None:
            raise NotFoundError(f"Material {material_id} not found")
        return m


class ProductService:
    async def create(
        self, session: AsyncSession, *, payload: ProductCreateRequest, actor_id: uuid.UUID
    ) -> Product:
        product = Product(
            id=uuid.uuid4(),
            sku=payload.sku,
            name=payload.name,
            uom=payload.uom,
            pack_size=payload.pack_size,
            status=payload.status,
            created_by=actor_id,
        )
        session.add(product)
        try:
            await session.flush()
        except IntegrityError as exc:
            raise_for_integrity(
                exc,
                not_found="Referenced entity not found",
                conflict=f"Product sku or name already exists: {payload.sku!r} / {payload.name!r}",
            )
        return product

    async def update(
        self,
        session: AsyncSession,
        *,
        product_id: uuid.UUID,
        payload: ProductUpdateRequest,
        actor_id: uuid.UUID,
    ) -> Product:
        product = await session.get(Product, product_id, with_for_update=True)
        if product is None:
            raise NotFoundError(f"Product {product_id} not found")
        changes = payload.model_dump(exclude_unset=True)
        if not changes:
            return product
        changes["updated_by"] = actor_id
        try:
            await session.execute(
                update(Product)
                .where(Product.id == product_id)
                .values(updated_at=text("timezone('utc', now())"), **changes)
            )
        except IntegrityError as exc:
            raise_for_integrity(
                exc,
                not_found="Referenced entity not found",
                conflict=f"Product update conflicts with an existing row for id {product_id}",
            )
        await session.refresh(product)
        return product

    async def list(
        self,
        session: AsyncSession,
        *,
        status: MasterDataStatus | None = None,
        limit: int = 200,
        offset: int = 0,
    ) -> list[Product]:
        stmt = select(Product).order_by(Product.name).limit(limit).offset(offset)
        if status is not None:
            stmt = stmt.where(Product.status == status)
        result = await session.execute(stmt)
        return list(result.scalars().all())

    async def get(self, session: AsyncSession, product_id: uuid.UUID) -> Product:
        p = await session.get(Product, product_id)
        if p is None:
            raise NotFoundError(f"Product {product_id} not found")
        return p


class BomService:
    """A product may have several BOM versions but at most one active
    (partial unique index `uq_boms_one_active_per_product`). This service
    accepts a fully-formed BOM with its items in one call; splitting a
    BOM into version N+1 is done by another create call with the previous
    one deactivated (activate/deactivate handled separately)."""

    async def create(
        self, session: AsyncSession, *, payload: BomCreateRequest, actor_id: uuid.UUID
    ) -> tuple[Bom, list[BomItem]]:
        bom = Bom(
            id=uuid.uuid4(),
            product_id=payload.product_id,
            version=payload.version,
            is_active=payload.is_active,
            created_by=actor_id,
        )
        session.add(bom)
        try:
            await session.flush()
        except IntegrityError as exc:
            raise_for_integrity(
                exc,
                not_found=f"Product {payload.product_id} not found",
                conflict=(
                    f"BOM version {payload.version} already exists for product "
                    f"{payload.product_id}, or another active version blocks this one"
                ),
            )

        items = [
            BomItem(
                id=uuid.uuid4(),
                bom_id=bom.id,
                material_id=i.material_id,
                formula_percentage=i.formula_percentage,
                standard_qty=i.standard_qty,
                uom=i.uom,
            )
            for i in payload.items
        ]
        session.add_all(items)
        try:
            await session.flush()
        except IntegrityError as exc:
            raise_for_integrity(
                exc,
                not_found="One of the materials on this BOM does not exist",
                conflict="Duplicate material line in BOM",
            )
        return bom, items

    async def set_active(
        self,
        session: AsyncSession,
        *,
        bom_id: uuid.UUID,
        active: bool,
        actor_id: uuid.UUID,
    ) -> Bom:
        bom = await session.get(Bom, bom_id, with_for_update=True)
        if bom is None:
            raise NotFoundError(f"BOM {bom_id} not found")
        if bom.is_active == active:
            return bom
        try:
            await session.execute(
                update(Bom)
                .where(Bom.id == bom_id)
                .values(is_active=active, updated_by=actor_id, updated_at=text("timezone('utc', now())"))
            )
        except IntegrityError as exc:
            raise_for_integrity(
                exc,
                not_found="Referenced entity not found",
                conflict=(
                    f"Cannot activate BOM {bom_id} — another active version already exists "
                    "for this product"
                ),
            )
        await session.refresh(bom)
        return bom

    async def list_for_product(self, session: AsyncSession, product_id: uuid.UUID) -> list[Bom]:
        stmt = select(Bom).where(Bom.product_id == product_id).order_by(Bom.version.desc())
        result = await session.execute(stmt)
        return list(result.scalars().all())

    async def get_items(self, session: AsyncSession, bom_id: uuid.UUID) -> list[BomItem]:
        stmt = select(BomItem).where(BomItem.bom_id == bom_id)
        result = await session.execute(stmt)
        return list(result.scalars().all())
