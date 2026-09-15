import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import Field

from app.models.enums import PrStatus
from app.schemas.common import ORMModel


class PurchaseRequestItemCreateRequest(ORMModel):
    material_id: uuid.UUID
    quantity: Decimal = Field(gt=0)
    uom: str = Field(default="kg", min_length=1, max_length=20)
    suggested_vendor_id: uuid.UUID | None = None
    notes: str | None = None


class PurchaseRequestCreateRequest(ORMModel):
    title: str = Field(min_length=1, max_length=200)
    required_by: date
    justification: str | None = None
    items: list[PurchaseRequestItemCreateRequest] = Field(min_length=1)


class PurchaseRequestDecisionRequest(ORMModel):
    decision_notes: str | None = Field(default=None, max_length=500)


class PurchaseRequestItemResponse(ORMModel):
    id: uuid.UUID
    line_no: int
    material_id: uuid.UUID
    quantity: Decimal
    uom: str
    suggested_vendor_id: uuid.UUID | None
    notes: str | None


class PurchaseRequestResponse(ORMModel):
    id: uuid.UUID
    pr_number: str
    title: str
    status: PrStatus
    required_by: date
    justification: str | None
    submitted_at: datetime | None
    submitted_by: uuid.UUID | None
    decided_at: datetime | None
    decided_by: uuid.UUID | None
    decision_notes: str | None
    created_by: uuid.UUID
    updated_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    items: list[PurchaseRequestItemResponse]
