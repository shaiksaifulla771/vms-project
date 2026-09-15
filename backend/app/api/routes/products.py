import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthenticatedUser, get_session, require_admin, require_viewer
from app.models.enums import MasterDataStatus
from app.schemas.bom import BomCreateRequest, BomItemResponse, BomResponse
from app.schemas.product import ProductCreateRequest, ProductResponse, ProductUpdateRequest
from app.services.master_service import BomService, ProductService

router = APIRouter(prefix="/api/v1/products", tags=["products"])
_products = ProductService()
_boms = BomService()


@router.get("", response_model=list[ProductResponse])
async def list_products(
    status: MasterDataStatus | None = None,
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
    _: AuthenticatedUser = Depends(require_viewer),
):
    return await _products.list(session, status=status, limit=limit, offset=offset)


@router.get("/{product_id}", response_model=ProductResponse)
async def get_product(
    product_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _: AuthenticatedUser = Depends(require_viewer),
):
    return await _products.get(session, product_id)


@router.post("", response_model=ProductResponse, status_code=201)
async def create_product(
    payload: ProductCreateRequest,
    session: AsyncSession = Depends(get_session),
    user: AuthenticatedUser = Depends(require_admin),
):
    return await _products.create(session, payload=payload, actor_id=user.id)


@router.patch("/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: uuid.UUID,
    payload: ProductUpdateRequest,
    session: AsyncSession = Depends(get_session),
    user: AuthenticatedUser = Depends(require_admin),
):
    return await _products.update(session, product_id=product_id, payload=payload, actor_id=user.id)


# --- BOM sub-resource --------------------------------------------------------


@router.get("/{product_id}/boms", response_model=list[BomResponse])
async def list_boms_for_product(
    product_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _: AuthenticatedUser = Depends(require_viewer),
):
    boms = await _boms.list_for_product(session, product_id)
    out: list[BomResponse] = []
    for bom in boms:
        items = await _boms.get_items(session, bom.id)
        out.append(
            BomResponse(
                id=bom.id,
                product_id=bom.product_id,
                version=bom.version,
                is_active=bom.is_active,
                created_by=bom.created_by,
                updated_by=bom.updated_by,
                created_at=bom.created_at,
                updated_at=bom.updated_at,
                items=[BomItemResponse.model_validate(i) for i in items],
            )
        )
    return out


@router.post("/{product_id}/boms", response_model=BomResponse, status_code=201)
async def create_bom_for_product(
    product_id: uuid.UUID,
    payload: BomCreateRequest,
    session: AsyncSession = Depends(get_session),
    user: AuthenticatedUser = Depends(require_admin),
):
    if payload.product_id != product_id:
        from app.exceptions import ValidationFailedError
        raise ValidationFailedError("payload.product_id must match the URL product_id")
    bom, items = await _boms.create(session, payload=payload, actor_id=user.id)
    return BomResponse(
        id=bom.id,
        product_id=bom.product_id,
        version=bom.version,
        is_active=bom.is_active,
        created_by=bom.created_by,
        updated_by=bom.updated_by,
        created_at=bom.created_at,
        updated_at=bom.updated_at,
        items=[BomItemResponse.model_validate(i) for i in items],
    )


@router.post("/{product_id}/boms/{bom_id}/activate", response_model=BomResponse)
async def activate_bom(
    product_id: uuid.UUID,
    bom_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: AuthenticatedUser = Depends(require_admin),
):
    bom = await _boms.set_active(session, bom_id=bom_id, active=True, actor_id=user.id)
    items = await _boms.get_items(session, bom.id)
    return BomResponse(
        id=bom.id, product_id=bom.product_id, version=bom.version, is_active=bom.is_active,
        created_by=bom.created_by, updated_by=bom.updated_by,
        created_at=bom.created_at, updated_at=bom.updated_at,
        items=[BomItemResponse.model_validate(i) for i in items],
    )


@router.post("/{product_id}/boms/{bom_id}/deactivate", response_model=BomResponse)
async def deactivate_bom(
    product_id: uuid.UUID,
    bom_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: AuthenticatedUser = Depends(require_admin),
):
    bom = await _boms.set_active(session, bom_id=bom_id, active=False, actor_id=user.id)
    items = await _boms.get_items(session, bom.id)
    return BomResponse(
        id=bom.id, product_id=bom.product_id, version=bom.version, is_active=bom.is_active,
        created_by=bom.created_by, updated_by=bom.updated_by,
        created_at=bom.created_at, updated_at=bom.updated_at,
        items=[BomItemResponse.model_validate(i) for i in items],
    )
