import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthenticatedUser, get_session, require_admin, require_editor, require_viewer
from app.exceptions import NotFoundError
from app.models.inventory import InventoryLot, InventoryTransaction
from app.schemas.inventory import (
    AvailabilityResponse,
    InventoryInwardRequest,
    InventoryOutwardRequest,
    LotResponse,
    ReconciliationRow,
    TransactionResponse,
)
from app.services.inventory_ledger_service import InventoryLedgerService

router = APIRouter(prefix="/api/v1/inventory", tags=["inventory"])
_ledger = InventoryLedgerService()

# The canonical reconciliation query: quantity_on_hand must always equal the
# sum of its ledger rows. Should always return zero rows; a non-empty
# result is a P1 incident, never routine maintenance.
_RECONCILIATION_SQL = text(
    """
    SELECT l.id AS lot_id, l.lot_number, l.quantity_on_hand AS cached_quantity,
           COALESCE(SUM(t.quantity), 0) AS ledger_sum
    FROM public.inventory_lots l
    LEFT JOIN public.inventory_transactions t ON t.lot_id = l.id
    GROUP BY l.id, l.lot_number, l.quantity_on_hand
    HAVING l.quantity_on_hand <> COALESCE(SUM(t.quantity), 0)
    """
)


@router.get("/lots", response_model=list[LotResponse])
async def list_lots(
    material_id: uuid.UUID | None = None,
    product_id: uuid.UUID | None = None,
    location_id: uuid.UUID | None = None,
    warehouse_id: uuid.UUID | None = None,
    session: AsyncSession = Depends(get_session),
    _: AuthenticatedUser = Depends(require_viewer),
):
    stmt = select(InventoryLot)
    if material_id is not None:
        stmt = stmt.where(InventoryLot.material_id == material_id)
    if product_id is not None:
        stmt = stmt.where(InventoryLot.product_id == product_id)
    if location_id is not None:
        stmt = stmt.where(InventoryLot.location_id == location_id)
    if warehouse_id is not None:
        stmt = stmt.where(InventoryLot.warehouse_id == warehouse_id)
    result = await session.execute(stmt.order_by(InventoryLot.expiry_date.asc()))
    return list(result.scalars().all())


@router.get("/availability", response_model=AvailabilityResponse)
async def get_availability(
    material_id: uuid.UUID,
    location_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _: AuthenticatedUser = Depends(require_viewer),
):
    qty = await _ledger.get_available_qty(
        session, material_id=material_id, location_id=location_id, as_of_date=datetime.now(timezone.utc).date()
    )
    return AvailabilityResponse(material_id=material_id, location_id=location_id, qty_available=qty)


@router.get("/transactions", response_model=list[TransactionResponse])
async def list_transactions(
    lot_id: uuid.UUID | None = Query(default=None),
    reference_id: str | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
    _: AuthenticatedUser = Depends(require_viewer),
):
    stmt = select(InventoryTransaction)
    if lot_id is not None:
        stmt = stmt.where(InventoryTransaction.lot_id == lot_id)
    if reference_id is not None:
        stmt = stmt.where(InventoryTransaction.reference_id == reference_id)
    result = await session.execute(stmt.order_by(InventoryTransaction.created_at.desc()))
    return list(result.scalars().all())


@router.get("/reconciliation", response_model=list[ReconciliationRow])
async def reconciliation(
    session: AsyncSession = Depends(get_session),
    _: AuthenticatedUser = Depends(require_admin),
):
    result = await session.execute(_RECONCILIATION_SQL)
    return [ReconciliationRow.model_validate(dict(row._mapping)) for row in result]


@router.post("/entries/inward", response_model=TransactionResponse, status_code=201)
async def inward_entry(
    payload: InventoryInwardRequest,
    session: AsyncSession = Depends(get_session),
    user: AuthenticatedUser = Depends(require_editor),
):
    lot = await _ledger.find_or_create_lot(
        session,
        lot_number=payload.lot_number,
        material_id=payload.material_id,
        product_id=payload.product_id,
        location_id=payload.location_id,
        warehouse_id=payload.warehouse_id,
        mfg_date=payload.mfg_date,
        expiry_date=payload.expiry_date,
        created_by=user.id,
    )
    locked = await _ledger.lock_lots(session, [lot.id])
    return await _ledger.post_transaction(
        session,
        lot=locked[lot.id],
        transaction_type=payload.transaction_type,
        quantity=payload.quantity,
        reference_id=payload.reference_id,
        executed_by=user.id,
        reason_notes=payload.reason_notes,
    )


@router.post("/entries/outward", response_model=TransactionResponse, status_code=201)
async def outward_entry(
    payload: InventoryOutwardRequest,
    session: AsyncSession = Depends(get_session),
    user: AuthenticatedUser = Depends(require_editor),
):
    locked = await _ledger.lock_lots(session, [payload.lot_id])
    lot = locked.get(payload.lot_id)
    if lot is None:
        raise NotFoundError(f"Inventory lot {payload.lot_id} not found")
    return await _ledger.post_transaction(
        session,
        lot=lot,
        transaction_type=payload.transaction_type,
        quantity=-payload.quantity,
        reference_id=None,
        executed_by=user.id,
        reason_notes=payload.reason_notes,
    )
