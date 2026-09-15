import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import Field

from app.models.enums import PoStatus
from app.schemas.common import ORMModel


class PoLineInput(ORMModel):
    pr_item_id: uuid.UUID
    material_vendor_id: uuid.UUID | None = None
    quantity: Decimal = Field(gt=0)
    unit_price: Decimal = Field(gt=0)
    tax_percent: Decimal = Field(default=Decimal(0), ge=0, le=100)


class PoGroupInput(ORMModel):
    vendor_id: uuid.UUID
    expected_delivery_date: date | None = None
    lines: list[PoLineInput] = Field(min_length=1)


class PrToPoConversionRequest(ORMModel):
    idempotency_key: str = Field(min_length=1, max_length=80)
    groups: list[PoGroupInput] = Field(min_length=1)


class PurchaseOrderItemResponse(ORMModel):
    id: uuid.UUID
    line_no: int
    material_id: uuid.UUID
    material_vendor_id: uuid.UUID | None
    quantity_ordered: Decimal
    quantity_received: Decimal
    unit_price: Decimal
    tax_percent: Decimal
    line_total: Decimal


class PurchaseOrderResponse(ORMModel):
    id: uuid.UUID
    po_number: str
    pr_id: uuid.UUID | None
    vendor_id: uuid.UUID
    status: PoStatus
    currency: str
    subtotal: Decimal
    tax_total: Decimal
    grand_total: Decimal
    expected_delivery_date: date | None
    issued_at: datetime | None
    issued_by: uuid.UUID | None
    closed_at: datetime | None
    closed_by: uuid.UUID | None
    created_by: uuid.UUID
    updated_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    items: list[PurchaseOrderItemResponse]


class ReceiptCreateRequest(ORMModel):
    po_item_id: uuid.UUID
    received_qty: Decimal = Field(gt=0)
    quality_ok: bool = True
    notes: str | None = None


class ReceiptResponse(ORMModel):
    id: uuid.UUID
    po_id: uuid.UUID
    po_item_id: uuid.UUID
    receipt_number: str
    received_qty: Decimal
    received_at: datetime
    on_time: bool
    quality_ok: bool
    notes: str | None
    created_by: uuid.UUID
