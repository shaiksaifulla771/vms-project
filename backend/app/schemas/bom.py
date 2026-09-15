import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import Field

from app.schemas.common import ORMModel


class BomItemCreateRequest(ORMModel):
    material_id: uuid.UUID
    formula_percentage: Decimal = Field(gt=0, le=100)
    standard_qty: Decimal = Field(gt=0)
    uom: str = Field(default="kg", min_length=1, max_length=20)


class BomCreateRequest(ORMModel):
    product_id: uuid.UUID
    version: int = Field(default=1, gt=0)
    is_active: bool = True
    items: list[BomItemCreateRequest] = Field(min_length=1)


class BomItemResponse(ORMModel):
    id: uuid.UUID
    material_id: uuid.UUID
    formula_percentage: Decimal
    standard_qty: Decimal
    uom: str


class BomResponse(ORMModel):
    id: uuid.UUID
    product_id: uuid.UUID
    version: int
    is_active: bool
    created_by: uuid.UUID
    updated_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    items: list[BomItemResponse]
