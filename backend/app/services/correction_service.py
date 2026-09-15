"""CorrectionService — Dynamic IP/OP Correction. Only ever touches a
COMPLETED batch's already-posted numbers, and only through a brand-new
append-only DYNAMIC_RECONCILIATION ledger entry; it never edits or
deletes the original MFG_CONSUMPTION/MFG_PRODUCTION rows those numbers
came from. reason_notes is mandatory unconditionally here (unlike batch
completion, where a reason is only required above tolerance) because a
correction is by definition an after-the-fact override of a number that
was already accepted."""

import json
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import (
    CorrectionWouldGoNegativeError,
    InputLineNotFoundError,
    InvalidStateTransitionError,
    NotFoundError,
)
from app.models.batch import BatchActualInput, BatchActualInputLot, BatchRecord
from app.models.enums import AuditAction, BatchStatus, InventoryTxnType
from app.models.inventory import InventoryLot
from app.services.inventory_ledger_service import InventoryLedgerService
from app.utils.formulas import variance_pct


class CorrectionService:
    def __init__(self, ledger: InventoryLedgerService | None = None) -> None:
        self._ledger = ledger or InventoryLedgerService()

    async def _get_completed_batch(self, session: AsyncSession, batch_id: uuid.UUID) -> BatchRecord:
        stmt = select(BatchRecord).where(BatchRecord.id == batch_id).with_for_update()
        batch = (await session.execute(stmt)).scalar_one_or_none()
        if batch is None:
            raise NotFoundError(f"Batch {batch_id} not found")
        if batch.status != BatchStatus.COMPLETED:
            raise InvalidStateTransitionError(
                f"Cannot correct batch {batch.batch_number}: status is {batch.status.value}, expected COMPLETED"
            )
        return batch

    async def correct_output(
        self,
        session: AsyncSession,
        *,
        batch_id: uuid.UUID,
        new_actual_output_qty: Decimal,
        reason_notes: str,
        actor_id: uuid.UUID,
    ) -> BatchRecord:
        batch = await self._get_completed_batch(session, batch_id)

        fg_lot_stmt = select(InventoryLot).where(
            InventoryLot.lot_number == batch.batch_number, InventoryLot.warehouse_id == batch.warehouse_id
        )
        fg_lot = (await session.execute(fg_lot_stmt)).scalar_one_or_none()
        if fg_lot is None:
            raise NotFoundError(f"Finished-goods lot for batch {batch.batch_number} not found")

        delta = new_actual_output_qty - (batch.actual_output_qty or Decimal(0))
        locked = await self._ledger.lock_lots(session, [fg_lot.id])
        locked_lot = locked[fg_lot.id]
        if delta < 0 and locked_lot.quantity_on_hand + delta < 0:
            raise CorrectionWouldGoNegativeError(
                f"Output correction of {delta} would drive lot {fg_lot.lot_number} below zero "
                f"(current on-hand {locked_lot.quantity_on_hand})"
            )

        await self._ledger.post_transaction(
            session,
            lot=locked_lot,
            transaction_type=InventoryTxnType.DYNAMIC_RECONCILIATION,
            quantity=delta,
            reference_id=batch.batch_number,
            executed_by=actor_id,
            reason_notes=reason_notes,
        )

        batch.actual_output_qty = new_actual_output_qty
        batch.output_variance_qty = new_actual_output_qty - batch.planned_output_qty
        batch.output_variance_pct = variance_pct(new_actual_output_qty, batch.planned_output_qty)
        batch.output_variance_reason = reason_notes
        batch.updated_by = actor_id
        batch.updated_at = datetime.now(timezone.utc)
        await session.flush()

        await self._audit(
            session,
            "batch",
            batch.id,
            {"correction": "output", "new_actual_output_qty": str(new_actual_output_qty), "delta": str(delta)},
        )
        return batch

    async def correct_input_line(
        self,
        session: AsyncSession,
        *,
        batch_id: uuid.UUID,
        input_id: uuid.UUID,
        consumed_lot_id: uuid.UUID,
        new_quantity: Decimal,
        reason_notes: str,
        actor_id: uuid.UUID,
    ) -> BatchActualInput:
        batch = await self._get_completed_batch(session, batch_id)

        input_row = await session.get(BatchActualInput, input_id)
        if input_row is None or input_row.batch_record_id != batch.id:
            raise InputLineNotFoundError(f"Input line {input_id} not found on batch {batch.batch_number}")

        lot_line_stmt = select(BatchActualInputLot).where(
            BatchActualInputLot.batch_actual_input_id == input_row.id,
            BatchActualInputLot.consumed_lot_id == consumed_lot_id,
        )
        lot_line = (await session.execute(lot_line_stmt)).scalar_one_or_none()
        if lot_line is None:
            raise InputLineNotFoundError(
                f"Lot {consumed_lot_id} was not drawn against input line {input_id}"
            )

        old_quantity = lot_line.quantity
        # A larger new_quantity means more was actually consumed from this
        # lot, so the reconciliation posts a further deduction (negative);
        # a smaller one returns stock to the lot (positive).
        reconciliation_qty = old_quantity - new_quantity

        locked = await self._ledger.lock_lots(session, [consumed_lot_id])
        locked_lot = locked[consumed_lot_id]
        if reconciliation_qty < 0 and locked_lot.quantity_on_hand + reconciliation_qty < 0:
            raise CorrectionWouldGoNegativeError(
                f"Input correction would drive lot {locked_lot.lot_number} below zero "
                f"(current on-hand {locked_lot.quantity_on_hand})"
            )

        await self._ledger.post_transaction(
            session,
            lot=locked_lot,
            transaction_type=InventoryTxnType.DYNAMIC_RECONCILIATION,
            quantity=reconciliation_qty,
            reference_id=batch.batch_number,
            executed_by=actor_id,
            reason_notes=reason_notes,
        )

        lot_line.quantity = new_quantity

        sibling_lots = (
            await session.execute(
                select(BatchActualInputLot).where(BatchActualInputLot.batch_actual_input_id == input_row.id)
            )
        ).scalars().all()
        input_row.actual_input_qty = sum((line.quantity for line in sibling_lots), Decimal(0))
        input_row.variance_pct = variance_pct(input_row.actual_input_qty, input_row.planned_input_qty)
        input_row.variance_reason = reason_notes
        await session.flush()

        await self._audit(
            session,
            "batch_actual_input",
            input_row.id,
            {
                "correction": "input",
                "consumed_lot_id": str(consumed_lot_id),
                "new_quantity": str(new_quantity),
                "reconciliation_qty": str(reconciliation_qty),
            },
        )
        return input_row

    @staticmethod
    async def _audit(session: AsyncSession, entity_type: str, entity_id: uuid.UUID, after: dict) -> None:
        await session.execute(
            text(
                "SELECT internal.record_audit(:etype, :eid, :action::audit_action, :before::jsonb, :after::jsonb)"
            ),
            {
                "etype": entity_type,
                "eid": str(entity_id),
                "action": AuditAction.UPDATE.value,
                "before": None,
                "after": json.dumps(after),
            },
        )
