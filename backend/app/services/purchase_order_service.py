"""PurchaseOrderService — PR line assignment into vendor-scoped POs,
issue, receipt recording (GRN), and close. One PO always covers exactly
one vendor; converting a PR that spans several vendors produces several
POs in the same transaction.

Concurrency: every mutating call takes the PO (and, for receipts, the PO
item) `FOR UPDATE` before reading its current state, so two concurrent
receipts against the same line serialize on the row lock rather than
racing quantity_received past quantity_ordered."""

import json
import uuid
from datetime import date, datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from sqlalchemy import select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import (
    BlacklistedVendorError,
    InvalidStateTransitionError,
    NotFoundError,
    ReceiptOverdrawnError,
    ValidationFailedError,
    VendorNotOrderableError,
)
from app.models.enums import AuditAction, PoStatus, PrStatus, VendorStatus
from app.models.purchase_order import PurchaseOrder, PurchaseOrderItem, PurchaseOrderReceipt
from app.models.purchase_request import PurchaseRequest, PurchaseRequestItem
from app.models.vendor import Vendor
from app.schemas.purchase_order import PrToPoConversionRequest, ReceiptCreateRequest
from app.services._db_errors import raise_for_integrity
from app.services.purchase_request_service import PurchaseRequestService

_TWO_PLACES = Decimal("0.01")

_PO_ALLOWED: dict[PoStatus, set[PoStatus]] = {
    PoStatus.DRAFT: {PoStatus.ISSUED, PoStatus.CANCELLED},
    PoStatus.ISSUED: {PoStatus.PARTIALLY_RECEIVED, PoStatus.RECEIVED, PoStatus.CANCELLED},
    PoStatus.PARTIALLY_RECEIVED: {PoStatus.RECEIVED},
    PoStatus.RECEIVED: {PoStatus.CLOSED},
    PoStatus.CLOSED: set(),
    PoStatus.CANCELLED: set(),
}

_ORDERABLE_VENDOR_STATUSES = {VendorStatus.APPROVED, VendorStatus.ACTIVE}

_pr_service = PurchaseRequestService()


def _round2(value: Decimal) -> Decimal:
    return value.quantize(_TWO_PLACES, rounding=ROUND_HALF_UP)


class PurchaseOrderService:
    async def convert_from_pr(
        self,
        session: AsyncSession,
        *,
        pr_id: uuid.UUID,
        payload: PrToPoConversionRequest,
        actor_id: uuid.UUID,
    ) -> list[PurchaseOrder]:
        pr = await session.get(PurchaseRequest, pr_id, with_for_update=True)
        if pr is None:
            raise NotFoundError(f"Purchase request {pr_id} not found")

        if pr.status != PrStatus.APPROVED:
            raise InvalidStateTransitionError(
                f"PR {pr.pr_number} must be APPROVED to convert (currently {pr.status.value})"
            )

        pr_items = await _pr_service.get_items(session, pr_id)
        pr_items_by_id = {item.id: item for item in pr_items}

        covered_qty: dict[uuid.UUID, Decimal] = {item.id: Decimal(0) for item in pr_items}
        created_or_reused: list[PurchaseOrder] = []

        for group in payload.groups:
            vendor = await session.get(Vendor, group.vendor_id, with_for_update=True)
            if vendor is None:
                raise NotFoundError(f"Vendor {group.vendor_id} not found")
            if vendor.status == VendorStatus.BLACKLISTED:
                raise BlacklistedVendorError(f"Vendor {vendor.code} is blacklisted and cannot be ordered from")
            if vendor.status not in _ORDERABLE_VENDOR_STATUSES:
                raise VendorNotOrderableError(
                    f"Vendor {vendor.code} is {vendor.status.value}, not APPROVED/ACTIVE"
                )

            derived_key = f"{payload.idempotency_key}:{group.vendor_id}"
            existing = (
                await session.execute(select(PurchaseOrder).where(PurchaseOrder.idempotency_key == derived_key))
            ).scalar_one_or_none()
            if existing is not None:
                created_or_reused.append(existing)
                continue

            po_number = (await session.execute(text("SELECT internal.next_po_number()"))).scalar_one()
            po = PurchaseOrder(
                id=uuid.uuid4(),
                po_number=po_number,
                pr_id=pr_id,
                vendor_id=group.vendor_id,
                status=PoStatus.DRAFT,
                expected_delivery_date=group.expected_delivery_date,
                idempotency_key=derived_key,
                created_by=actor_id,
            )
            session.add(po)
            try:
                await session.flush()
            except IntegrityError as exc:
                raise_for_integrity(
                    exc, not_found="Referenced entity not found", conflict="Idempotency key already in use"
                )

            subtotal = Decimal(0)
            tax_total = Decimal(0)
            for idx, line in enumerate(group.lines, start=1):
                pr_item = pr_items_by_id.get(line.pr_item_id)
                if pr_item is None or pr_item.pr_id != pr_id:
                    raise ValidationFailedError(
                        f"pr_item_id {line.pr_item_id} does not belong to PR {pr_id}"
                    )
                covered_qty[pr_item.id] += line.quantity
                line_subtotal = _round2(line.quantity * line.unit_price)
                line_tax = _round2(line_subtotal * line.tax_percent / Decimal(100))
                subtotal += line_subtotal
                tax_total += line_tax
                session.add(
                    PurchaseOrderItem(
                        id=uuid.uuid4(),
                        po_id=po.id,
                        line_no=idx,
                        material_id=pr_item.material_id,
                        material_vendor_id=line.material_vendor_id,
                        quantity_ordered=line.quantity,
                        unit_price=line.unit_price,
                        tax_percent=line.tax_percent,
                    )
                )
            try:
                await session.flush()
            except IntegrityError as exc:
                raise_for_integrity(
                    exc,
                    not_found="One of the materials on this PO does not exist",
                    conflict="Duplicate line on PO",
                )

            await session.execute(
                update(PurchaseOrder)
                .where(PurchaseOrder.id == po.id)
                .values(subtotal=subtotal, tax_total=tax_total, grand_total=subtotal + tax_total)
            )
            await session.refresh(po)
            created_or_reused.append(po)

        for item_id, qty in covered_qty.items():
            pr_item = pr_items_by_id[item_id]
            if qty != pr_item.quantity:
                raise ValidationFailedError(
                    f"PR line {pr_item.line_no} (material {pr_item.material_id}) requires "
                    f"{pr_item.quantity} but conversion groups cover {qty} — a PR converts in full"
                )

        po_ids = [po.id for po in created_or_reused]
        await _pr_service.mark_converted(session, pr_id=pr_id, actor_id=actor_id, po_ids=po_ids)
        return created_or_reused

    async def issue(self, session: AsyncSession, *, po_id: uuid.UUID, actor_id: uuid.UUID) -> PurchaseOrder:
        po = await session.get(PurchaseOrder, po_id, with_for_update=True)
        if po is None:
            raise NotFoundError(f"Purchase order {po_id} not found")
        if PoStatus.ISSUED not in _PO_ALLOWED[po.status]:
            raise InvalidStateTransitionError(f"PO {po.po_number} cannot move from {po.status.value} to ISSUED")

        vendor = await session.get(Vendor, po.vendor_id)
        if vendor is None:
            raise NotFoundError(f"Vendor {po.vendor_id} not found")
        if vendor.status == VendorStatus.BLACKLISTED:
            raise BlacklistedVendorError(f"Vendor {vendor.code} is blacklisted and cannot be issued a PO")
        if vendor.status not in _ORDERABLE_VENDOR_STATUSES:
            raise VendorNotOrderableError(f"Vendor {vendor.code} is {vendor.status.value}, not APPROVED/ACTIVE")

        now = datetime.now(timezone.utc)
        await session.execute(
            update(PurchaseOrder)
            .where(PurchaseOrder.id == po_id)
            .values(
                status=PoStatus.ISSUED,
                issued_at=now,
                issued_by=actor_id,
                updated_by=actor_id,
                updated_at=text("timezone('utc', now())"),
            )
        )
        await session.refresh(po)
        await self._audit(session, po_id, AuditAction.ISSUE, before=None, after={"po_number": po.po_number})
        return po

    async def record_receipt(
        self,
        session: AsyncSession,
        *,
        po_id: uuid.UUID,
        payload: ReceiptCreateRequest,
        actor_id: uuid.UUID,
    ) -> PurchaseOrderReceipt:
        po = await session.get(PurchaseOrder, po_id, with_for_update=True)
        if po is None:
            raise NotFoundError(f"Purchase order {po_id} not found")
        if po.status not in (PoStatus.ISSUED, PoStatus.PARTIALLY_RECEIVED):
            raise InvalidStateTransitionError(
                f"PO {po.po_number} is {po.status.value} — receipts are only valid against "
                "ISSUED or PARTIALLY_RECEIVED orders"
            )

        item = await session.get(PurchaseOrderItem, payload.po_item_id, with_for_update=True)
        if item is None or item.po_id != po_id:
            raise NotFoundError(f"PO item {payload.po_item_id} not found on PO {po_id}")

        remaining = item.quantity_ordered - item.quantity_received
        if payload.received_qty > remaining:
            raise ReceiptOverdrawnError(
                f"Receiving {payload.received_qty} would exceed the {remaining} remaining on line "
                f"{item.line_no} of PO {po.po_number}"
            )

        receipt_number = (await session.execute(text("SELECT internal.next_grn_number()"))).scalar_one()
        received_at = datetime.now(timezone.utc)
        on_time = po.expected_delivery_date is None or received_at.date() <= po.expected_delivery_date

        receipt = PurchaseOrderReceipt(
            id=uuid.uuid4(),
            po_id=po_id,
            po_item_id=item.id,
            receipt_number=receipt_number,
            received_qty=payload.received_qty,
            received_at=received_at,
            on_time=on_time,
            quality_ok=payload.quality_ok,
            notes=payload.notes,
            created_by=actor_id,
        )
        session.add(receipt)
        try:
            await session.flush()
        except IntegrityError as exc:
            raise_for_integrity(
                exc, not_found="Referenced entity not found", conflict="Duplicate receipt number"
            )

        await session.execute(
            update(PurchaseOrderItem)
            .where(PurchaseOrderItem.id == item.id)
            .values(quantity_received=PurchaseOrderItem.quantity_received + payload.received_qty)
        )

        all_items = (
            await session.execute(select(PurchaseOrderItem).where(PurchaseOrderItem.po_id == po_id))
        ).scalars().all()
        fully_received = all(
            (i.quantity_received + (payload.received_qty if i.id == item.id else Decimal(0))) >= i.quantity_ordered
            for i in all_items
        )
        new_status = PoStatus.RECEIVED if fully_received else PoStatus.PARTIALLY_RECEIVED
        await session.execute(
            update(PurchaseOrder)
            .where(PurchaseOrder.id == po_id)
            .values(status=new_status, updated_by=actor_id, updated_at=text("timezone('utc', now())"))
        )
        await self._audit(
            session,
            po_id,
            AuditAction.RECEIVE,
            before=None,
            after={"receipt_number": receipt_number, "po_item_id": str(item.id), "qty": str(payload.received_qty)},
        )
        return receipt

    async def close(self, session: AsyncSession, *, po_id: uuid.UUID, actor_id: uuid.UUID) -> PurchaseOrder:
        po = await session.get(PurchaseOrder, po_id, with_for_update=True)
        if po is None:
            raise NotFoundError(f"Purchase order {po_id} not found")
        if PoStatus.CLOSED not in _PO_ALLOWED[po.status]:
            raise InvalidStateTransitionError(f"PO {po.po_number} cannot move from {po.status.value} to CLOSED")
        now = datetime.now(timezone.utc)
        await session.execute(
            update(PurchaseOrder)
            .where(PurchaseOrder.id == po_id)
            .values(
                status=PoStatus.CLOSED,
                closed_at=now,
                closed_by=actor_id,
                updated_by=actor_id,
                updated_at=text("timezone('utc', now())"),
            )
        )
        await session.refresh(po)
        await self._audit(session, po_id, AuditAction.CLOSE, before=None, after={"po_number": po.po_number})
        return po

    async def cancel(self, session: AsyncSession, *, po_id: uuid.UUID, actor_id: uuid.UUID) -> PurchaseOrder:
        po = await session.get(PurchaseOrder, po_id, with_for_update=True)
        if po is None:
            raise NotFoundError(f"Purchase order {po_id} not found")
        if PoStatus.CANCELLED not in _PO_ALLOWED[po.status]:
            raise InvalidStateTransitionError(
                f"PO {po.po_number} cannot move from {po.status.value} to CANCELLED"
            )
        await session.execute(
            update(PurchaseOrder)
            .where(PurchaseOrder.id == po_id)
            .values(
                status=PoStatus.CANCELLED, updated_by=actor_id, updated_at=text("timezone('utc', now())")
            )
        )
        await session.refresh(po)
        await self._audit(session, po_id, AuditAction.CANCEL, before=None, after={"po_number": po.po_number})
        return po

    async def get(self, session: AsyncSession, po_id: uuid.UUID) -> PurchaseOrder:
        po = await session.get(PurchaseOrder, po_id)
        if po is None:
            raise NotFoundError(f"Purchase order {po_id} not found")
        return po

    async def get_items(self, session: AsyncSession, po_id: uuid.UUID) -> list[PurchaseOrderItem]:
        stmt = select(PurchaseOrderItem).where(PurchaseOrderItem.po_id == po_id).order_by(
            PurchaseOrderItem.line_no
        )
        return list((await session.execute(stmt)).scalars().all())

    async def list(
        self,
        session: AsyncSession,
        *,
        status: PoStatus | None = None,
        vendor_id: uuid.UUID | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[PurchaseOrder]:
        stmt = select(PurchaseOrder).order_by(PurchaseOrder.created_at.desc()).limit(limit).offset(offset)
        if status is not None:
            stmt = stmt.where(PurchaseOrder.status == status)
        if vendor_id is not None:
            stmt = stmt.where(PurchaseOrder.vendor_id == vendor_id)
        return list((await session.execute(stmt)).scalars().all())

    @staticmethod
    async def _audit(
        session: AsyncSession,
        entity_id: uuid.UUID,
        action: AuditAction,
        *,
        before: dict[str, Any] | None,
        after: dict[str, Any] | None,
    ) -> None:
        await session.execute(
            text(
                "SELECT internal.record_audit(:etype, :eid, :action::audit_action, :before::jsonb, :after::jsonb)"
            ),
            {
                "etype": "purchase_order",
                "eid": str(entity_id),
                "action": action.value,
                "before": json.dumps(before) if before is not None else None,
                "after": json.dumps(after) if after is not None else None,
            },
        )
