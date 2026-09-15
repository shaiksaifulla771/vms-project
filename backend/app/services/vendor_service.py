"""VendorService — CRUD + lifecycle transitions
(DRAFT -> APPROVED -> ACTIVE <-> SUSPENDED -> BLACKLISTED).

Every write records an audit_log row via internal.record_audit() — a
SECURITY DEFINER function invoked from SQL, not a direct INSERT into
audit_log (RLS forbids that). Status changes call it with the previous
and new state so an auditor can reconstruct a vendor's full history."""

import json
import uuid
from typing import Any

from sqlalchemy import select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import InvalidStateTransitionError, NotFoundError
from app.models.enums import AuditAction, VendorStatus
from app.models.vendor import Vendor
from app.schemas.vendor import VendorCreateRequest, VendorStatusChangeRequest, VendorUpdateRequest
from app.services._db_errors import raise_for_integrity

# Allowed transitions. BLACKLISTED is terminal by design — a blacklisted
# vendor cannot be reactivated (see docs/DOMAIN.md); a fresh vendor record
# must be opened.
_ALLOWED_TRANSITIONS: dict[VendorStatus, set[VendorStatus]] = {
    VendorStatus.DRAFT: {VendorStatus.APPROVED, VendorStatus.BLACKLISTED},
    VendorStatus.APPROVED: {VendorStatus.ACTIVE, VendorStatus.SUSPENDED, VendorStatus.BLACKLISTED},
    VendorStatus.ACTIVE: {VendorStatus.SUSPENDED, VendorStatus.BLACKLISTED},
    VendorStatus.SUSPENDED: {VendorStatus.ACTIVE, VendorStatus.BLACKLISTED},
    VendorStatus.BLACKLISTED: set(),
}


def _vendor_snapshot(vendor: Vendor) -> dict[str, Any]:
    return {
        "id": str(vendor.id),
        "code": vendor.code,
        "name": vendor.name,
        "status": vendor.status.value,
    }


class VendorService:
    async def create(
        self,
        session: AsyncSession,
        *,
        payload: VendorCreateRequest,
        actor_id: uuid.UUID,
    ) -> Vendor:
        vendor = Vendor(
            id=uuid.uuid4(),
            code=payload.code,
            name=payload.name,
            legal_name=payload.legal_name,
            status=VendorStatus.DRAFT,
            contact_email=payload.contact_email,
            phone=payload.phone,
            gstin=payload.gstin,
            pan=payload.pan,
            payment_terms_days=payload.payment_terms_days,
            credit_limit=payload.credit_limit,
            address_line1=payload.address_line1,
            address_line2=payload.address_line2,
            city=payload.city,
            state=payload.state,
            country=payload.country,
            postal_code=payload.postal_code,
            notes=payload.notes,
            created_by=actor_id,
        )
        session.add(vendor)
        try:
            await session.flush()
        except IntegrityError as exc:
            raise_for_integrity(
                exc,
                not_found="Referenced entity not found",
                conflict=f"Vendor code or name already exists: {payload.code!r} / {payload.name!r}",
            )
        await self._audit(session, vendor.id, AuditAction.INSERT, before=None, after=_vendor_snapshot(vendor))
        return vendor

    async def update(
        self,
        session: AsyncSession,
        *,
        vendor_id: uuid.UUID,
        payload: VendorUpdateRequest,
        actor_id: uuid.UUID,
    ) -> Vendor:
        vendor = await session.get(Vendor, vendor_id, with_for_update=True)
        if vendor is None:
            raise NotFoundError(f"Vendor {vendor_id} not found")

        before = _vendor_snapshot(vendor)
        changes = payload.model_dump(exclude_unset=True)
        if not changes:
            return vendor
        changes["updated_by"] = actor_id
        try:
            await session.execute(
                update(Vendor)
                .where(Vendor.id == vendor_id)
                .values(updated_at=text("timezone('utc', now())"), **changes)
            )
        except IntegrityError as exc:
            raise_for_integrity(
                exc,
                not_found="Referenced entity not found",
                conflict=f"Vendor update conflicts with an existing row for id {vendor_id}",
            )
        await session.refresh(vendor)
        await self._audit(session, vendor_id, AuditAction.UPDATE, before=before, after=_vendor_snapshot(vendor))
        return vendor

    async def change_status(
        self,
        session: AsyncSession,
        *,
        vendor_id: uuid.UUID,
        payload: VendorStatusChangeRequest,
        actor_id: uuid.UUID,
    ) -> Vendor:
        vendor = await session.get(Vendor, vendor_id, with_for_update=True)
        if vendor is None:
            raise NotFoundError(f"Vendor {vendor_id} not found")

        allowed = _ALLOWED_TRANSITIONS[vendor.status]
        if payload.status not in allowed:
            raise InvalidStateTransitionError(
                f"Vendor {vendor.code} cannot move from {vendor.status.value} to {payload.status.value}"
            )
        before = _vendor_snapshot(vendor)
        await session.execute(
            update(Vendor)
            .where(Vendor.id == vendor_id)
            .values(
                status=payload.status,
                updated_by=actor_id,
                updated_at=text("timezone('utc', now())"),
            )
        )
        await session.refresh(vendor)
        await self._audit(
            session,
            vendor_id,
            AuditAction.STATUS_CHANGE,
            before=before,
            after={**_vendor_snapshot(vendor), "reason": payload.reason},
        )
        return vendor

    async def get(self, session: AsyncSession, vendor_id: uuid.UUID) -> Vendor:
        vendor = await session.get(Vendor, vendor_id)
        if vendor is None:
            raise NotFoundError(f"Vendor {vendor_id} not found")
        return vendor

    async def list(
        self,
        session: AsyncSession,
        *,
        status: VendorStatus | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[Vendor]:
        stmt = select(Vendor).order_by(Vendor.name).limit(limit).offset(offset)
        if status is not None:
            stmt = stmt.where(Vendor.status == status)
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
                "etype": "vendor",
                "eid": str(entity_id),
                "action": action.value,
                "before": json.dumps(before) if before is not None else None,
                "after": json.dumps(after) if after is not None else None,
            },
        )
