"""BatchExecutionService — plan-linked and ad-hoc batches, validated
identically (tolerance, atomicity, FEFO, RBAC — no reduced-validation
path). Inventory Auto-Update is implicit here, not a separate step: it is
inside the same transaction as completion."""

import json
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import (
    BatchNotFoundError,
    InsufficientStockError,
    InvalidStateTransitionError,
    LotScopeMismatchError,
    NotFoundError,
    OverrideReasonRequiredError,
    ToleranceExceededError,
    ValidationFailedError,
)
from app.models.batch import BatchActualInput, BatchActualInputLot, BatchRecord
from app.models.bom import BomItem
from app.models.enums import AuditAction, BatchStatus, InventoryTxnType
from app.models.inventory import InventoryLot
from app.models.location import Warehouse
from app.models.product import Product
from app.schemas.batch import ActualInputLineIn, BatchCreateRequest
from app.services.inventory_ledger_service import InventoryLedgerService
from app.services.planning_service import PlanningService
from app.utils.formulas import qty_required, requires_reason, variance_pct


@dataclass(frozen=True)
class BatchLineResult:
    batch_actual_input: BatchActualInput
    lots: list[BatchActualInputLot]


class BatchExecutionService:
    def __init__(
        self, ledger: InventoryLedgerService | None = None, planning: PlanningService | None = None
    ) -> None:
        self._ledger = ledger or InventoryLedgerService()
        self._planning = planning or PlanningService(self._ledger)

    async def _get_batch(self, session: AsyncSession, batch_id: uuid.UUID, *, for_update: bool = False) -> BatchRecord:
        stmt = select(BatchRecord).where(BatchRecord.id == batch_id)
        if for_update:
            stmt = stmt.with_for_update()
        batch = (await session.execute(stmt)).scalar_one_or_none()
        if batch is None:
            raise BatchNotFoundError(f"Batch {batch_id} not found")
        return batch

    async def create_batch(
        self, session: AsyncSession, *, payload: BatchCreateRequest, actor_id: uuid.UUID
    ) -> BatchRecord:
        warehouse = await session.get(Warehouse, payload.warehouse_id)
        if warehouse is None or warehouse.location_id != payload.location_id:
            raise ValidationFailedError(
                f"Warehouse {payload.warehouse_id} does not belong to location {payload.location_id}"
            )

        batch_number = (await session.execute(text("SELECT internal.next_batch_number()"))).scalar_one()
        batch = BatchRecord(
            id=uuid.uuid4(),
            batch_number=batch_number,
            plan_id=payload.plan_id,
            product_id=payload.product_id,
            location_id=payload.location_id,
            warehouse_id=payload.warehouse_id,
            planned_output_qty=payload.planned_output_qty,
            mfg_date=payload.mfg_date,
            expiry_date=payload.expiry_date,
            status=BatchStatus.SCHEDULED,
            executed_by=payload.executed_by,
            created_by=actor_id,
        )
        session.add(batch)
        await session.flush()
        await self._audit(session, batch.id, AuditAction.INSERT, {"batch_number": batch.batch_number})
        return batch

    async def start_batch(self, session: AsyncSession, *, batch_id: uuid.UUID, actor_id: uuid.UUID) -> BatchRecord:
        batch = await self._get_batch(session, batch_id, for_update=True)
        if batch.status != BatchStatus.SCHEDULED:
            raise InvalidStateTransitionError(
                f"Batch {batch.batch_number} cannot start from {batch.status.value}, expected SCHEDULED"
            )
        batch.status = BatchStatus.IN_PROGRESS
        batch.updated_by = actor_id
        batch.updated_at = datetime.now(timezone.utc)
        await self._audit(session, batch.id, AuditAction.STATUS_CHANGE, {"status": "IN_PROGRESS"})
        return batch

    async def cancel_batch(self, session: AsyncSession, *, batch_id: uuid.UUID, actor_id: uuid.UUID) -> BatchRecord:
        batch = await self._get_batch(session, batch_id, for_update=True)
        if batch.status not in (BatchStatus.SCHEDULED, BatchStatus.IN_PROGRESS):
            raise InvalidStateTransitionError(f"Batch {batch.batch_number} cannot be cancelled from {batch.status.value}")
        batch.status = BatchStatus.CANCELLED
        batch.updated_by = actor_id
        batch.updated_at = datetime.now(timezone.utc)
        await self._audit(session, batch.id, AuditAction.CANCEL, {"status": "CANCELLED"})
        return batch

    async def complete_batch(
        self,
        session: AsyncSession,
        *,
        batch_id: uuid.UUID,
        actual_output_qty: Decimal,
        input_lines: list[ActualInputLineIn],
        output_variance_reason: str | None,
        actor_id: uuid.UUID,
    ) -> BatchRecord:
        """The atomic validate -> lock -> deduct -> produce -> variance
        sequence. Runs on the caller's single request-scoped transaction —
        no nested session.begin() here."""
        batch = await self._get_batch(session, batch_id, for_update=True)
        if batch.status != BatchStatus.IN_PROGRESS:
            raise InvalidStateTransitionError(
                f"Cannot complete batch {batch.batch_number}: status is {batch.status.value}, expected IN_PROGRESS"
            )

        product = await session.get(Product, batch.product_id)
        if product is None:
            raise NotFoundError(f"Product {batch.product_id} not found for batch {batch_id}")
        tolerance = product.variance_tolerance_percent

        bom = await self._planning.get_active_bom(session, product_id=batch.product_id)
        bom_items_by_material = {
            item.material_id: item
            for item in (await session.execute(select(BomItem).where(BomItem.bom_id == bom.id))).scalars().all()
        }

        provided_by_material = {line.material_id: line for line in input_lines}
        if set(provided_by_material) != set(bom_items_by_material):
            raise ValidationFailedError("Submitted input_lines do not match the active BOM's material set exactly")

        # Tolerance + override validation, before any lock or write.
        output_variance = variance_pct(actual_output_qty, batch.planned_output_qty)
        if requires_reason(output_variance, tolerance) and not (
            output_variance_reason and output_variance_reason.strip()
        ):
            raise ToleranceExceededError(
                f"Output variance {output_variance}% exceeds tolerance {tolerance}% and requires a reason"
            )

        line_plans: dict[uuid.UUID, Decimal] = {}
        line_variances: dict[uuid.UUID, Decimal] = {}
        for material_id, bom_item in bom_items_by_material.items():
            line = provided_by_material[material_id]
            planned_qty = qty_required(batch.planned_output_qty, bom_item.formula_percentage)
            line_plans[material_id] = planned_qty
            line_variance = variance_pct(line.actual_input_qty, planned_qty)
            line_variances[material_id] = line_variance
            if requires_reason(line_variance, tolerance) and not (line.reason_notes and line.reason_notes.strip()):
                raise ToleranceExceededError(
                    f"Input variance for material {material_id} ({line_variance}%) exceeds "
                    f"tolerance {tolerance}% and requires a reason"
                )
            if line.consumed_lot_id is not None and not (line.reason_notes and line.reason_notes.strip()):
                raise OverrideReasonRequiredError(f"Manual lot override for material {material_id} requires reason_notes")

        # Candidate lot selection (unlocked): FEFO default may span several
        # lots; an override forces exactly one specific lot.
        candidate_lot_ids: dict[uuid.UUID, list[uuid.UUID]] = {}
        for material_id in bom_items_by_material:
            line = provided_by_material[material_id]
            if line.consumed_lot_id is not None:
                lot = await session.get(InventoryLot, line.consumed_lot_id)
                if (
                    lot is None
                    or lot.material_id != material_id
                    or lot.location_id != batch.location_id
                    or lot.warehouse_id != batch.warehouse_id
                ):
                    raise LotScopeMismatchError(
                        f"consumed_lot_id {line.consumed_lot_id} is not a valid {material_id} lot in this "
                        "batch's location/warehouse"
                    )
                candidate_lot_ids[material_id] = [lot.id]
            else:
                candidates = await self._ledger.get_fefo_candidates(
                    session, material_id=material_id, location_id=batch.location_id,
                    warehouse_id=batch.warehouse_id, as_of_date=batch.mfg_date,
                )
                remaining = line.actual_input_qty
                chosen: list[uuid.UUID] = []
                for candidate in candidates:
                    if remaining <= 0:
                        break
                    chosen.append(candidate.id)
                    remaining -= candidate.quantity_on_hand
                if remaining > 0:
                    raise InsufficientStockError(
                        f"Material {material_id} at this location/warehouse has insufficient stock across "
                        f"all unexpired lots (FEFO), needs {line.actual_input_qty}"
                    )
                candidate_lot_ids[material_id] = chosen

        fg_lot = await self._ledger.find_or_create_lot(
            session,
            lot_number=batch.batch_number,
            material_id=None,
            product_id=batch.product_id,
            location_id=batch.location_id,
            warehouse_id=batch.warehouse_id,
            mfg_date=batch.mfg_date,
            expiry_date=batch.expiry_date,
            created_by=actor_id,
        )

        all_lot_ids = sorted({lot_id for ids in candidate_lot_ids.values() for lot_id in ids} | {fg_lot.id})
        locked = await self._ledger.lock_lots(session, all_lot_ids)

        # Finalize draw amounts against fresh, locked balances (closes the
        # TOCTOU gap between candidate selection above and the lock).
        draws: dict[uuid.UUID, list[tuple[InventoryLot, Decimal]]] = {}
        for material_id in bom_items_by_material:
            line = provided_by_material[material_id]
            ordered_lots = [locked[lot_id] for lot_id in candidate_lot_ids[material_id]]
            remaining = line.actual_input_qty
            material_draws: list[tuple[InventoryLot, Decimal]] = []
            for lot in ordered_lots:
                if remaining <= 0:
                    break
                take = min(lot.quantity_on_hand, remaining)
                if take > 0:
                    material_draws.append((lot, take))
                    remaining -= take
            if remaining > 0:
                raise InsufficientStockError(
                    f"Lot(s) for material {material_id} no longer have enough combined stock post-lock "
                    "(likely consumed by a concurrent batch)"
                )
            draws[material_id] = material_draws

        for material_id, material_draws in draws.items():
            line = provided_by_material[material_id]
            for lot, qty in material_draws:
                await self._ledger.post_transaction(
                    session, lot=lot, transaction_type=InventoryTxnType.MFG_CONSUMPTION, quantity=-qty,
                    reference_id=batch.batch_number, executed_by=actor_id, reason_notes=line.reason_notes,
                )

        await self._ledger.post_transaction(
            session, lot=locked[fg_lot.id], transaction_type=InventoryTxnType.MFG_PRODUCTION,
            quantity=actual_output_qty, reference_id=batch.batch_number, executed_by=actor_id,
        )

        for material_id, bom_item in bom_items_by_material.items():
            line = provided_by_material[material_id]
            input_row = BatchActualInput(
                id=uuid.uuid4(), batch_record_id=batch.id, material_id=material_id,
                bom_percentage=bom_item.formula_percentage, planned_input_qty=line_plans[material_id],
                actual_input_qty=line.actual_input_qty, variance_pct=line_variances[material_id],
                variance_reason=line.reason_notes,
            )
            session.add(input_row)
            await session.flush()
            for lot, qty in draws[material_id]:
                session.add(
                    BatchActualInputLot(id=uuid.uuid4(), batch_actual_input_id=input_row.id, consumed_lot_id=lot.id, quantity=qty)
                )

        batch.actual_output_qty = actual_output_qty
        batch.output_variance_qty = actual_output_qty - batch.planned_output_qty
        batch.output_variance_pct = output_variance
        batch.output_variance_reason = output_variance_reason
        batch.status = BatchStatus.COMPLETED
        batch.updated_by = actor_id
        batch.updated_at = datetime.now(timezone.utc)

        await session.flush()
        await self._audit(
            session, batch.id, AuditAction.STATUS_CHANGE,
            {"status": "COMPLETED", "actual_output_qty": str(actual_output_qty)},
        )
        return batch

    async def get(self, session: AsyncSession, batch_id: uuid.UUID) -> BatchRecord:
        return await self._get_batch(session, batch_id)

    async def get_inputs(self, session: AsyncSession, batch_id: uuid.UUID) -> list[BatchLineResult]:
        inputs = (
            await session.execute(select(BatchActualInput).where(BatchActualInput.batch_record_id == batch_id))
        ).scalars().all()
        results = []
        for input_row in inputs:
            lots = (
                await session.execute(
                    select(BatchActualInputLot).where(BatchActualInputLot.batch_actual_input_id == input_row.id)
                )
            ).scalars().all()
            results.append(BatchLineResult(batch_actual_input=input_row, lots=list(lots)))
        return results

    async def list(
        self,
        session: AsyncSession,
        *,
        plan_id: uuid.UUID | None = None,
        status: BatchStatus | None = None,
        location_id: uuid.UUID | None = None,
    ) -> list[BatchRecord]:
        stmt = select(BatchRecord)
        if plan_id is not None:
            stmt = stmt.where(BatchRecord.plan_id == plan_id)
        if status is not None:
            stmt = stmt.where(BatchRecord.status == status)
        if location_id is not None:
            stmt = stmt.where(BatchRecord.location_id == location_id)
        return list((await session.execute(stmt.order_by(BatchRecord.created_at.desc()))).scalars().all())

    @staticmethod
    async def _audit(session: AsyncSession, batch_id: uuid.UUID, action: AuditAction, after: dict) -> None:
        await session.execute(
            text(
                "SELECT internal.record_audit(:etype, :eid, :action::audit_action, :before::jsonb, :after::jsonb)"
            ),
            {"etype": "batch", "eid": str(batch_id), "action": action.value, "before": None, "after": json.dumps(after)},
        )
