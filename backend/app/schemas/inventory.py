import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import Field, model_validator

from app.models.enums import InventoryTxnType
from app.schemas.common import ORMModel


class LotResponse(ORMModel):
    id: uuid.UUID
    lot_number: str
    material_id: uuid.UUID | None
    product_id: uuid.UUID | None
    location_id: uuid.UUID
    warehouse_id: uuid.UUID
    mfg_date: date
    expiry_date: date
    quantity_on_hand: Decimal
    uom: str
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime


class AvailabilityResponse(ORMModel):
    material_id: uuid.UUID
    location_id: uuid.UUID
    qty_available: Decimal


class TransactionResponse(ORMModel):
    id: uuid.UUID
    lot_id: uuid.UUID
    transaction_type: InventoryTxnType
    quantity: Decimal
    balance_after: Decimal
    reference_id: str | None
    reason_notes: str | None
    executed_by: uuid.UUID
    created_at: datetime


class ReconciliationRow(ORMModel):
    lot_id: uuid.UUID
    lot_number: str
    cached_quantity: Decimal
    ledger_sum: Decimal


_INWARD_TYPES = {InventoryTxnType.INWARD_PURCHASE, InventoryTxnType.STOCK_ADJUSTMENT}
_OUTWARD_TYPES = {InventoryTxnType.OUTWARD_DISPOSAL, InventoryTxnType.STOCK_ADJUSTMENT}


class InventoryInwardRequest(ORMModel):
    """Add Stock (Inward): initial stock entry or external stock movement.
    Creates the lot if it doesn't already exist (keyed by lot_number +
    warehouse_id), then posts a positive ledger transaction."""

    material_id: uuid.UUID | None = None
    product_id: uuid.UUID | None = None
    lot_number: str = Field(min_length=1, max_length=100)
    location_id: uuid.UUID
    warehouse_id: uuid.UUID
    quantity: Decimal = Field(gt=0)
    uom: str = Field(default="kg", min_length=1, max_length=20)
    mfg_date: date
    expiry_date: date
    transaction_type: InventoryTxnType = InventoryTxnType.INWARD_PURCHASE
    reference_id: str | None = Field(default=None, max_length=100)
    reason_notes: str | None = None

    @model_validator(mode="after")
    def _validate(self) -> "InventoryInwardRequest":
        if (self.material_id is None) == (self.product_id is None):
            raise ValueError("exactly one of material_id or product_id must be set")
        if self.expiry_date <= self.mfg_date:
            raise ValueError("expiry_date must be after mfg_date")
        if self.transaction_type not in _INWARD_TYPES:
            raise ValueError(f"transaction_type must be one of {sorted(t.value for t in _INWARD_TYPES)}")
        return self


class InventoryOutwardRequest(ORMModel):
    """Remove Stock (Outward): stock adjustment, disposal, or manual
    consumption against an existing lot."""

    lot_id: uuid.UUID
    quantity: Decimal = Field(gt=0)
    transaction_type: InventoryTxnType = InventoryTxnType.OUTWARD_DISPOSAL
    reason_notes: str = Field(min_length=1, max_length=500)

    @model_validator(mode="after")
    def _validate(self) -> "InventoryOutwardRequest":
        if self.transaction_type not in _OUTWARD_TYPES:
            raise ValueError(f"transaction_type must be one of {sorted(t.value for t in _OUTWARD_TYPES)}")
        return self
