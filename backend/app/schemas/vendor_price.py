import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import Field, model_validator

from app.models.enums import PriceSource
from app.schemas.common import ORMModel


class VendorPriceCreateRequest(ORMModel):
    material_vendor_id: uuid.UUID
    currency: str = Field(default="INR", min_length=3, max_length=3)
    unit_price: Decimal = Field(gt=0)
    min_order_qty: Decimal = Field(default=Decimal(1), gt=0)
    valid_from: date
    valid_to: date | None = None
    source: PriceSource = PriceSource.QUOTE
    notes: str | None = None

    @model_validator(mode="after")
    def _check_range(self) -> "VendorPriceCreateRequest":
        if self.valid_to is not None and self.valid_to <= self.valid_from:
            raise ValueError("valid_to must be after valid_from")
        return self


class VendorPriceResponse(ORMModel):
    id: uuid.UUID
    material_vendor_id: uuid.UUID
    currency: str
    unit_price: Decimal
    min_order_qty: Decimal
    valid_from: date
    valid_to: date | None
    source: PriceSource
    notes: str | None
    created_by: uuid.UUID
    updated_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


class VendorPriceComparisonRow(ORMModel):
    """One vendor's current price for a given material — used by the
    pricing dashboard's vendor-wise comparison view."""

    material_vendor_id: uuid.UUID
    vendor_id: uuid.UUID
    vendor_name: str
    mpn_code: str
    is_preferred: bool
    currency: str
    unit_price: Decimal
    min_order_qty: Decimal
    valid_from: date
    valid_to: date | None
