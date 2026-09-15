"""PlanningService — read-only against inventory: never writes to
inventory_lots or inventory_transactions, only ever writes its own
plans/plan_products rows. Creates no reservation. A SHORT line never
blocks plan creation — a Plan is a status report, not a gate.

A Plan is a group header: it can cover several products across several
locations at once, mirroring the source Plan Summary / Batch Summary /
Material Summary report. Each (product_id, location_id) the group covers
is one PlanProduct row with its own BOM-derived material lines."""

import json
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import DuplicatePlanIdError, DuplicatePlanLineError, NoActiveBomError, PlanNotFoundError
from app.models.batch import BatchRecord
from app.models.bom import Bom, BomItem
from app.models.enums import AuditAction, BatchStatus
from app.models.plan import Plan, PlanProduct
from app.schemas.planning import PlanProductLineRequest
from app.services._db_errors import raise_for_integrity
from app.services.inventory_ledger_service import InventoryLedgerService
from app.utils.formulas import batches_required, long_short_status, qty_required


@dataclass(frozen=True)
class PlanLine:
    material_id: uuid.UUID
    formula_percentage: Decimal
    qty_required: Decimal
    qty_available: Decimal
    delta: Decimal
    status: str


@dataclass(frozen=True)
class PlanProductResult:
    plan_product: PlanProduct
    lines: list[PlanLine]


@dataclass(frozen=True)
class PlanGroupResult:
    plan: Plan
    products: list[PlanProductResult]


@dataclass(frozen=True)
class BatchSummaryRow:
    product_id: uuid.UUID
    location_id: uuid.UUID
    planned_batches: int
    executed_batches: int
    completed_output_qty: Decimal


@dataclass(frozen=True)
class MaterialSummaryRow:
    material_id: uuid.UUID
    total_required_qty: Decimal
    total_available_qty: Decimal
    status: str


@dataclass(frozen=True)
class PlanSummary:
    plan: Plan
    products: list[PlanProductResult]
    batch_summary: list[BatchSummaryRow]
    material_summary: list[MaterialSummaryRow]


class PlanningService:
    def __init__(self, ledger: InventoryLedgerService | None = None) -> None:
        self._ledger = ledger or InventoryLedgerService()

    async def get_active_bom(self, session: AsyncSession, *, product_id: uuid.UUID) -> Bom:
        stmt = (
            select(Bom)
            .where(Bom.product_id == product_id, Bom.is_active.is_(True))
            .order_by(Bom.version.desc())
            .limit(1)
        )
        result = await session.execute(stmt)
        bom = result.scalar_one_or_none()
        if bom is None:
            raise NoActiveBomError(f"No active BOM found for product {product_id}")
        return bom

    async def _lines_for_bom(
        self, session: AsyncSession, *, bom: Bom, location_id: uuid.UUID, demand_target_qty: Decimal, as_of_date: date
    ) -> list[PlanLine]:
        bom_items = (await session.execute(select(BomItem).where(BomItem.bom_id == bom.id))).scalars().all()
        lines: list[PlanLine] = []
        for item in bom_items:
            required = qty_required(demand_target_qty, item.formula_percentage)
            available = await self._ledger.get_available_qty(
                session, material_id=item.material_id, location_id=location_id, as_of_date=as_of_date
            )
            delta, status = long_short_status(available, required)
            lines.append(
                PlanLine(
                    material_id=item.material_id,
                    formula_percentage=item.formula_percentage,
                    qty_required=required,
                    qty_available=available,
                    delta=delta,
                    status=status,
                )
            )
        return lines

    async def compute_plan(
        self,
        session: AsyncSession,
        *,
        lines: list[PlanProductLineRequest],
        idempotency_key: str | None,
        created_by: uuid.UUID,
    ) -> PlanGroupResult:
        as_of_date = datetime.now(timezone.utc).date()

        seen: set[tuple[uuid.UUID, uuid.UUID]] = set()
        for line in lines:
            key = (line.product_id, line.location_id)
            if key in seen:
                raise DuplicatePlanLineError(
                    f"product {line.product_id} at location {line.location_id} listed more than once"
                )
            seen.add(key)

        if idempotency_key is not None:
            existing = (
                await session.execute(select(Plan).where(Plan.idempotency_key == idempotency_key))
            ).scalar_one_or_none()
            if existing is not None:
                existing_products = await self.get_plan_products(session, plan_id=existing.id)
                existing_keys = {
                    (p.product_id, p.location_id, p.demand_target_qty, p.batch_size_output)
                    for p in existing_products
                }
                requested_keys = {
                    (l.product_id, l.location_id, l.demand_target_qty, l.batch_size_output) for l in lines
                }
                if existing_keys != requested_keys:
                    raise DuplicatePlanIdError(
                        f"idempotency_key {idempotency_key!r} already used for a different plan"
                    )
                products = await self._build_plan_product_results(
                    session, plan_products=existing_products, as_of_date=as_of_date
                )
                return PlanGroupResult(plan=existing, products=products)

        plan_number = (await session.execute(text("SELECT internal.next_plan_number()"))).scalar_one()
        plan = Plan(
            id=uuid.uuid4(),
            plan_number=plan_number,
            idempotency_key=idempotency_key,
            created_by=created_by,
        )
        session.add(plan)
        try:
            await session.flush()
        except IntegrityError as exc:
            raise_for_integrity(exc, not_found="Referenced entity not found", conflict="Plan number collision")

        products: list[PlanProductResult] = []
        for line in lines:
            bom = await self.get_active_bom(session, product_id=line.product_id)
            plan_lines = await self._lines_for_bom(
                session, bom=bom, location_id=line.location_id,
                demand_target_qty=line.demand_target_qty, as_of_date=as_of_date,
            )
            plan_product = PlanProduct(
                id=uuid.uuid4(),
                plan_id=plan.id,
                product_id=line.product_id,
                location_id=line.location_id,
                demand_target_qty=line.demand_target_qty,
                batch_size_output=line.batch_size_output,
                bom_id=bom.id,
                batches_required=batches_required(line.demand_target_qty, line.batch_size_output),
                created_by=created_by,
            )
            session.add(plan_product)
            products.append(PlanProductResult(plan_product=plan_product, lines=plan_lines))

        try:
            await session.flush()
        except IntegrityError as exc:
            raise_for_integrity(
                exc, not_found="Referenced product/location/BOM not found", conflict="Duplicate plan line"
            )

        await session.execute(
            text(
                "SELECT internal.record_audit(:etype, :eid, :action::audit_action, :before::jsonb, :after::jsonb)"
            ),
            {
                "etype": "plan",
                "eid": str(plan.id),
                "action": AuditAction.INSERT.value,
                "before": None,
                "after": json.dumps({"plan_number": plan.plan_number, "lines": len(lines)}),
            },
        )
        return PlanGroupResult(plan=plan, products=products)

    async def get_plan(self, session: AsyncSession, plan_id: uuid.UUID) -> Plan:
        plan = await session.get(Plan, plan_id)
        if plan is None:
            raise PlanNotFoundError(f"Plan {plan_id} not found")
        return plan

    async def get_plan_products(self, session: AsyncSession, *, plan_id: uuid.UUID) -> list[PlanProduct]:
        stmt = select(PlanProduct).where(PlanProduct.plan_id == plan_id).order_by(PlanProduct.created_at)
        return list((await session.execute(stmt)).scalars().all())

    async def list_plans(self, session: AsyncSession) -> list[Plan]:
        return list((await session.execute(select(Plan).order_by(Plan.created_at.desc()))).scalars().all())

    async def _build_plan_product_results(
        self, session: AsyncSession, *, plan_products: list[PlanProduct], as_of_date: date
    ) -> list[PlanProductResult]:
        results: list[PlanProductResult] = []
        for pp in plan_products:
            bom = await session.get(Bom, pp.bom_id)
            pp_lines = await self._lines_for_bom(
                session, bom=bom, location_id=pp.location_id,
                demand_target_qty=pp.demand_target_qty, as_of_date=as_of_date,
            )
            results.append(PlanProductResult(plan_product=pp, lines=pp_lines))
        return results

    async def get_plan_detail(self, session: AsyncSession, *, plan_id: uuid.UUID) -> PlanGroupResult:
        plan = await self.get_plan(session, plan_id)
        plan_products = await self.get_plan_products(session, plan_id=plan_id)
        as_of_date = datetime.now(timezone.utc).date()
        products = await self._build_plan_product_results(session, plan_products=plan_products, as_of_date=as_of_date)
        return PlanGroupResult(plan=plan, products=products)

    async def get_plan_summary(self, session: AsyncSession, *, plan_id: uuid.UUID) -> PlanSummary:
        plan = await self.get_plan(session, plan_id)
        plan_products = await self.get_plan_products(session, plan_id=plan_id)
        as_of_date = datetime.now(timezone.utc).date()

        products = await self._build_plan_product_results(session, plan_products=plan_products, as_of_date=as_of_date)
        batch_summary: list[BatchSummaryRow] = []
        material_required: dict[uuid.UUID, Decimal] = {}
        material_locations: dict[uuid.UUID, set[uuid.UUID]] = {}

        for pp, pp_result in zip(plan_products, products):
            pp_lines = pp_result.lines
            batch_rows = (
                await session.execute(
                    select(BatchRecord).where(
                        BatchRecord.plan_id == plan_id,
                        BatchRecord.product_id == pp.product_id,
                        BatchRecord.location_id == pp.location_id,
                    )
                )
            ).scalars().all()
            executed = [b for b in batch_rows if b.status == BatchStatus.COMPLETED]
            completed_output = sum((b.actual_output_qty or Decimal(0) for b in executed), Decimal(0))
            batch_summary.append(
                BatchSummaryRow(
                    product_id=pp.product_id,
                    location_id=pp.location_id,
                    planned_batches=pp.batches_required,
                    executed_batches=len(executed),
                    completed_output_qty=completed_output,
                )
            )

            for line in pp_lines:
                material_required[line.material_id] = material_required.get(line.material_id, Decimal(0)) + line.qty_required
                material_locations.setdefault(line.material_id, set()).add(pp.location_id)

        material_summary: list[MaterialSummaryRow] = []
        for material_id, required_total in material_required.items():
            available_total = Decimal(0)
            for location_id in material_locations[material_id]:
                available_total += await self._ledger.get_available_qty(
                    session, material_id=material_id, location_id=location_id, as_of_date=as_of_date
                )
            _, status = long_short_status(available_total, required_total)
            material_summary.append(
                MaterialSummaryRow(
                    material_id=material_id,
                    total_required_qty=required_total,
                    total_available_qty=available_total,
                    status=status,
                )
            )

        return PlanSummary(plan=plan, products=products, batch_summary=batch_summary, material_summary=material_summary)
