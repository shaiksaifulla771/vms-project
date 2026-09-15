"""InventoryLedgerService — the only code path allowed to move
InventoryLot.quantity_on_hand or read/write InventoryTransaction. Every
actual write delegates to internal.post_inventory_transaction() (a
SECURITY DEFINER Postgres function, docs/schema.sql section 14): the
lock -> read -> validate -> insert -> update sequence runs atomically in
the database, and INSERT/UPDATE/DELETE on inventory_transactions are
revoked from `authenticated` entirely, so nothing else has privilege to
write it. No other service, script, or route handler may construct an
INSERT against inventory_transactions or an UPDATE against
inventory_lots.quantity_on_hand directly."""

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import InsufficientStockError
from app.models.enums import InventoryTxnType
from app.models.inventory import InventoryLot, InventoryTransaction

_POST_TXN_SQL = text(
    "SELECT * FROM internal.post_inventory_transaction("
    ":lot_id, :transaction_type::inventory_txn_type, :quantity, :reference_id, :executed_by, :reason_notes)"
)

_INSUFFICIENT_STOCK_SQLSTATE = "23514"


class InventoryLedgerService:
    async def lock_lots(self, session: AsyncSession, lot_ids: list[uuid.UUID]) -> dict[uuid.UUID, InventoryLot]:
        """SELECT ... FOR UPDATE on every id, sorted ascending — deterministic
        lock ordering prevents deadlock between two transactions needing the
        same two lots in opposite orders. Callers must pass the FULL set of
        lots one logical operation touches in a single call, never one lock
        per lot in separate calls."""
        if not lot_ids:
            return {}
        ordered_ids = sorted(set(lot_ids))
        stmt = (
            select(InventoryLot)
            .where(InventoryLot.id.in_(ordered_ids))
            .order_by(InventoryLot.id)
            .with_for_update()
        )
        result = await session.execute(stmt)
        return {lot.id: lot for lot in result.scalars().all()}

    async def post_transaction(
        self,
        session: AsyncSession,
        *,
        lot: InventoryLot,
        transaction_type: InventoryTxnType,
        quantity: Decimal,
        reference_id: str | None,
        executed_by: uuid.UUID,
        reason_notes: str | None = None,
    ) -> InventoryTransaction:
        """Assumes `lot` was already locked via lock_lots() in this same
        transaction — re-locking a row this transaction already holds is an
        instant no-op in Postgres, never a self-deadlock, so this composes
        safely with the caller's own lock."""
        try:
            result = await session.execute(
                _POST_TXN_SQL,
                {
                    "lot_id": lot.id,
                    "transaction_type": transaction_type.value,
                    "quantity": quantity,
                    "reference_id": reference_id,
                    "executed_by": executed_by,
                    "reason_notes": reason_notes,
                },
            )
        except DBAPIError as exc:
            if getattr(exc.orig, "sqlstate", None) == _INSUFFICIENT_STOCK_SQLSTATE:
                raise InsufficientStockError(
                    f"Lot {lot.id} ({lot.lot_number}) would go negative posting "
                    f"{transaction_type.value} {quantity}"
                ) from exc
            raise

        row = result.mappings().one()
        txn = InventoryTransaction(
            id=row["id"],
            lot_id=row["lot_id"],
            transaction_type=InventoryTxnType(row["transaction_type"]),
            quantity=row["quantity"],
            balance_after=row["balance_after"],
            reference_id=row["reference_id"],
            reason_notes=row["reason_notes"],
            executed_by=row["executed_by"],
            created_at=row["created_at"],
        )

        # The function updated inventory_lots out-of-band from the ORM's unit
        # of work — refresh (not a manual attribute assignment) so `lot` is
        # marked clean, not dirty, avoiding a redundant UPDATE at flush.
        await session.refresh(lot)
        return txn

    async def get_fefo_candidates(
        self,
        session: AsyncSession,
        *,
        material_id: uuid.UUID,
        location_id: uuid.UUID,
        warehouse_id: uuid.UUID,
        as_of_date: date,
    ) -> list[InventoryLot]:
        """Read-only, no lock. Unexpired, quantity_on_hand > 0, ordered
        expiry_date ASC — mirrors idx_lots_fefo's leading columns."""
        stmt = (
            select(InventoryLot)
            .where(
                InventoryLot.material_id == material_id,
                InventoryLot.location_id == location_id,
                InventoryLot.warehouse_id == warehouse_id,
                InventoryLot.expiry_date >= as_of_date,
                InventoryLot.quantity_on_hand > 0,
            )
            .order_by(InventoryLot.expiry_date.asc())
        )
        result = await session.execute(stmt)
        return list(result.scalars().all())

    async def get_available_qty(
        self,
        session: AsyncSession,
        *,
        material_id: uuid.UUID,
        location_id: uuid.UUID,
        as_of_date: date,
    ) -> Decimal:
        """Read-only, no lock — feeds Planning's qty_available. Not scoped
        to a warehouse: Planning reasons about a location's total
        availability, unlike execution-time FEFO selection."""
        stmt = select(InventoryLot).where(
            InventoryLot.material_id == material_id,
            InventoryLot.location_id == location_id,
            InventoryLot.expiry_date >= as_of_date,
        )
        result = await session.execute(stmt)
        lots = result.scalars().all()
        return sum((lot.quantity_on_hand for lot in lots), Decimal(0))

    async def find_or_create_lot(
        self,
        session: AsyncSession,
        *,
        lot_number: str,
        material_id: uuid.UUID | None,
        product_id: uuid.UUID | None,
        location_id: uuid.UUID,
        warehouse_id: uuid.UUID,
        mfg_date: date,
        expiry_date: date,
        created_by: uuid.UUID,
    ) -> InventoryLot:
        """Keyed by lot_number + warehouse_id (uq_lot_in_warehouse). If
        absent, inserts a new lot with quantity_on_hand=0 — never a nonzero
        starting value; the first ledger transaction posted via
        post_transaction() is what brings it to its real quantity. Wrapped
        in a SAVEPOINT with a re-select fallback on a unique-constraint
        violation, defense-in-depth against a concurrent identical call."""
        stmt = select(InventoryLot).where(
            InventoryLot.lot_number == lot_number, InventoryLot.warehouse_id == warehouse_id
        )
        result = await session.execute(stmt)
        lot = result.scalar_one_or_none()
        if lot is not None:
            return lot

        lot = InventoryLot(
            id=uuid.uuid4(),
            lot_number=lot_number,
            material_id=material_id,
            product_id=product_id,
            location_id=location_id,
            warehouse_id=warehouse_id,
            mfg_date=mfg_date,
            expiry_date=expiry_date,
            quantity_on_hand=Decimal(0),
            created_by=created_by,
        )
        try:
            async with session.begin_nested():
                session.add(lot)
                await session.flush()
        except IntegrityError:
            result = await session.execute(stmt)
            lot = result.scalar_one_or_none()
            if lot is None:
                raise
        return lot
