import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthenticatedUser, get_session, require_admin, require_editor, require_viewer
from app.models.enums import PoStatus
from app.schemas.purchase_order import (
    PrToPoConversionRequest,
    PurchaseOrderItemResponse,
    PurchaseOrderResponse,
    ReceiptCreateRequest,
    ReceiptResponse,
)
from app.services.purchase_order_service import PurchaseOrderService

router = APIRouter(prefix="/api/v1/purchase-orders", tags=["purchase-orders"])
_service = PurchaseOrderService()


async def _to_response(session: AsyncSession, po) -> PurchaseOrderResponse:
    items = await _service.get_items(session, po.id)
    return PurchaseOrderResponse(
        id=po.id,
        po_number=po.po_number,
        pr_id=po.pr_id,
        vendor_id=po.vendor_id,
        status=po.status,
        currency=po.currency,
        subtotal=po.subtotal,
        tax_total=po.tax_total,
        grand_total=po.grand_total,
        expected_delivery_date=po.expected_delivery_date,
        issued_at=po.issued_at,
        issued_by=po.issued_by,
        closed_at=po.closed_at,
        closed_by=po.closed_by,
        created_by=po.created_by,
        updated_by=po.updated_by,
        created_at=po.created_at,
        updated_at=po.updated_at,
        items=[PurchaseOrderItemResponse.model_validate(i) for i in items],
    )


@router.get("", response_model=list[PurchaseOrderResponse])
async def list_purchase_orders(
    status: PoStatus | None = None,
    vendor_id: uuid.UUID | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
    _: AuthenticatedUser = Depends(require_viewer),
):
    pos = await _service.list(session, status=status, vendor_id=vendor_id, limit=limit, offset=offset)
    return [await _to_response(session, po) for po in pos]


@router.get("/{po_id}", response_model=PurchaseOrderResponse)
async def get_purchase_order(
    po_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _: AuthenticatedUser = Depends(require_viewer),
):
    po = await _service.get(session, po_id)
    return await _to_response(session, po)


@router.post(
    "/from-purchase-request/{pr_id}",
    response_model=list[PurchaseOrderResponse],
    status_code=201,
)
async def convert_pr_to_pos(
    pr_id: uuid.UUID,
    payload: PrToPoConversionRequest,
    session: AsyncSession = Depends(get_session),
    user: AuthenticatedUser = Depends(require_admin),
):
    pos = await _service.convert_from_pr(session, pr_id=pr_id, payload=payload, actor_id=user.id)
    return [await _to_response(session, po) for po in pos]


@router.post("/{po_id}/issue", response_model=PurchaseOrderResponse)
async def issue_purchase_order(
    po_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: AuthenticatedUser = Depends(require_admin),
):
    po = await _service.issue(session, po_id=po_id, actor_id=user.id)
    return await _to_response(session, po)


@router.post("/{po_id}/close", response_model=PurchaseOrderResponse)
async def close_purchase_order(
    po_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: AuthenticatedUser = Depends(require_admin),
):
    po = await _service.close(session, po_id=po_id, actor_id=user.id)
    return await _to_response(session, po)


@router.post("/{po_id}/cancel", response_model=PurchaseOrderResponse)
async def cancel_purchase_order(
    po_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: AuthenticatedUser = Depends(require_admin),
):
    po = await _service.cancel(session, po_id=po_id, actor_id=user.id)
    return await _to_response(session, po)


@router.post("/{po_id}/receipts", response_model=ReceiptResponse, status_code=201)
async def record_receipt(
    po_id: uuid.UUID,
    payload: ReceiptCreateRequest,
    session: AsyncSession = Depends(get_session),
    user: AuthenticatedUser = Depends(require_editor),
):
    return await _service.record_receipt(session, po_id=po_id, payload=payload, actor_id=user.id)
