"""PurchaseRequestService — DRAFT -> SUBMITTED -> APPROVED/REJECTED ->
CONVERTED, or CANCELLED from DRAFT/SUBMITTED. CONVERTED is set only by
PurchaseOrderService once every line has been placed on a PO — never by
a direct call here."""

import json
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import InvalidStateTransitionError, NotFoundError
from app.models.enums import AuditAction, PrStatus
from app.models.purchase_request import PurchaseRequest, PurchaseRequestItem
from app.schemas.purchase_request import PurchaseRequestCreateRequest, PurchaseRequestDecisionRequest
from app.services._db_errors import raise_for_integrity

_ALLOWED: dict[PrStatus, set[PrStatus]] = {
    PrStatus.DRAFT: {PrStatus.SUBMITTED, PrStatus.CANCELLED},
    PrStatus.SUBMITTED: {PrStatus.APPROVED, PrStatus.REJECTED, PrStatus.CANCELLED},
    PrStatus.APPROVED: {PrStatus.CONVERTED},
    PrStatus.REJECTED: set(),
    PrStatus.CONVERTED: set(),
    PrStatus.CANCELLED: set(),
}


def _snapshot(pr: PurchaseRequest) -> dict[str, Any]:
    return {"id": str(pr.id), "pr_number": pr.pr_number, "status": pr.status.value}


class PurchaseRequestService:
    async def create(
        self, session: AsyncSession, *, payload: PurchaseRequestCreateRequest, actor_id: uuid.UUID
    ) -> tuple[PurchaseRequest, list[PurchaseRequestItem]]:
        pr_number = (await session.execute(text("SELECT internal.next_pr_number()"))).scalar_one()
        pr = PurchaseRequest(
            id=uuid.uuid4(),
            pr_number=pr_number,
            title=payload.title,
            status=PrStatus.DRAFT,
            required_by=payload.required_by,
            justification=payload.justification,
            created_by=actor_id,
        )
        session.add(pr)
        try:
            await session.flush()
        except IntegrityError as exc:
            raise_for_integrity(exc, not_found="Referenced entity not found", conflict="PR number collision")

        items = [
            PurchaseRequestItem(
                id=uuid.uuid4(),
                pr_id=pr.id,
                line_no=idx,
                material_id=line.material_id,
                quantity=line.quantity,
                uom=line.uom,
                suggested_vendor_id=line.suggested_vendor_id,
                notes=line.notes,
            )
            for idx, line in enumerate(payload.items, start=1)
        ]
        session.add_all(items)
        try:
            await session.flush()
        except IntegrityError as exc:
            raise_for_integrity(
                exc,
                not_found="One of the materials or suggested vendors on this PR does not exist",
                conflict="Duplicate line on PR",
            )
        await self._audit(session, pr.id, AuditAction.INSERT, before=None, after=_snapshot(pr))
        return pr, items

    async def _transition(
        self,
        session: AsyncSession,
        *,
        pr_id: uuid.UUID,
        target: PrStatus,
        actor_id: uuid.UUID,
        action: AuditAction,
        extra_values: dict[str, Any],
        extra_audit: dict[str, Any] | None = None,
    ) -> PurchaseRequest:
        pr = await session.get(PurchaseRequest, pr_id, with_for_update=True)
        if pr is None:
            raise NotFoundError(f"Purchase request {pr_id} not found")
        if target not in _ALLOWED[pr.status]:
            raise InvalidStateTransitionError(
                f"PR {pr.pr_number} cannot move from {pr.status.value} to {target.value}"
            )
        before = _snapshot(pr)
        await session.execute(
            update(PurchaseRequest)
            .where(PurchaseRequest.id == pr_id)
            .values(status=target, updated_by=actor_id, updated_at=text("timezone('utc', now())"), **extra_values)
        )
        await session.refresh(pr)
        after = _snapshot(pr)
        if extra_audit:
            after = {**after, **extra_audit}
        await self._audit(session, pr_id, action, before=before, after=after)
        return pr

    async def submit(self, session: AsyncSession, *, pr_id: uuid.UUID, actor_id: uuid.UUID) -> PurchaseRequest:
        now = datetime.now(timezone.utc)
        return await self._transition(
            session,
            pr_id=pr_id,
            target=PrStatus.SUBMITTED,
            actor_id=actor_id,
            action=AuditAction.STATUS_CHANGE,
            extra_values={"submitted_at": now, "submitted_by": actor_id},
        )

    async def approve(
        self,
        session: AsyncSession,
        *,
        pr_id: uuid.UUID,
        payload: PurchaseRequestDecisionRequest,
        actor_id: uuid.UUID,
    ) -> PurchaseRequest:
        now = datetime.now(timezone.utc)
        return await self._transition(
            session,
            pr_id=pr_id,
            target=PrStatus.APPROVED,
            actor_id=actor_id,
            action=AuditAction.APPROVE,
            extra_values={"decided_at": now, "decided_by": actor_id, "decision_notes": payload.decision_notes},
        )

    async def reject(
        self,
        session: AsyncSession,
        *,
        pr_id: uuid.UUID,
        payload: PurchaseRequestDecisionRequest,
        actor_id: uuid.UUID,
    ) -> PurchaseRequest:
        now = datetime.now(timezone.utc)
        return await self._transition(
            session,
            pr_id=pr_id,
            target=PrStatus.REJECTED,
            actor_id=actor_id,
            action=AuditAction.REJECT,
            extra_values={"decided_at": now, "decided_by": actor_id, "decision_notes": payload.decision_notes},
        )

    async def cancel(self, session: AsyncSession, *, pr_id: uuid.UUID, actor_id: uuid.UUID) -> PurchaseRequest:
        return await self._transition(
            session,
            pr_id=pr_id,
            target=PrStatus.CANCELLED,
            actor_id=actor_id,
            action=AuditAction.CANCEL,
            extra_values={},
        )

    async def mark_converted(
        self, session: AsyncSession, *, pr_id: uuid.UUID, actor_id: uuid.UUID, po_ids: list[uuid.UUID]
    ) -> PurchaseRequest:
        """Called only by PurchaseOrderService once every PR line has been
        placed on a generated PO."""
        return await self._transition(
            session,
            pr_id=pr_id,
            target=PrStatus.CONVERTED,
            actor_id=actor_id,
            action=AuditAction.CONVERT,
            extra_values={},
            extra_audit={"purchase_order_ids": [str(i) for i in po_ids]},
        )

    async def get(self, session: AsyncSession, pr_id: uuid.UUID) -> PurchaseRequest:
        pr = await session.get(PurchaseRequest, pr_id)
        if pr is None:
            raise NotFoundError(f"Purchase request {pr_id} not found")
        return pr

    async def get_items(self, session: AsyncSession, pr_id: uuid.UUID) -> list[PurchaseRequestItem]:
        stmt = select(PurchaseRequestItem).where(PurchaseRequestItem.pr_id == pr_id).order_by(
            PurchaseRequestItem.line_no
        )
        result = await session.execute(stmt)
        return list(result.scalars().all())

    async def list(
        self,
        session: AsyncSession,
        *,
        status: PrStatus | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[PurchaseRequest]:
        stmt = select(PurchaseRequest).order_by(PurchaseRequest.created_at.desc()).limit(limit).offset(offset)
        if status is not None:
            stmt = stmt.where(PurchaseRequest.status == status)
        result = await session.execute(stmt)
        return list(result.scalars().all())

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
                "etype": "purchase_request",
                "eid": str(entity_id),
                "action": action.value,
                "before": json.dumps(before) if before is not None else None,
                "after": json.dumps(after) if after is not None else None,
            },
        )
