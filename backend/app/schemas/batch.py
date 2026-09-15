import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import Field, model_validator

from app.models.enums import BatchStatus
from app.schemas.common import ORMModel


class BatchCreateRequest(ORMModel):
    plan_id: uuid.UUID | None = None
    product_id: uuid.UUID
    location_id: uuid.UUID
    warehouse_id: uuid.UUID
    planned_output_qty: Decimal = Field(gt=0)
    mfg_date: date
    expiry_date: date
    executed_by: str = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def _expiry_after_mfg(self) -> "BatchCreateRequest":
        if self.expiry_date <= self.mfg_date:
            raise ValueError("expiry_date must be after mfg_date")
        return self


class ActualInputLineIn(ORMModel):
    material_id: uuid.UUID
    actual_input_qty: Decimal = Field(gt=0)
    consumed_lot_id: uuid.UUID | None = None
    reason_notes: str | None = None

    @model_validator(mode="after")
    def _override_requires_reason(self) -> "ActualInputLineIn":
        if self.consumed_lot_id is not None and not (self.reason_notes and self.reason_notes.strip()):
            raise ValueError("consumed_lot_id override requires a non-empty reason_notes")
        return self


class BatchCompleteRequest(ORMModel):
    actual_output_qty: Decimal = Field(gt=0)
    output_variance_reason: str | None = None
    input_lines: list[ActualInputLineIn] = Field(min_length=1, max_length=200)


class BatchActualInputLotResponse(ORMModel):
    id: uuid.UUID
    consumed_lot_id: uuid.UUID
    quantity: Decimal


class BatchActualInputResponse(ORMModel):
    id: uuid.UUID
    material_id: uuid.UUID
    bom_percentage: Decimal
    planned_input_qty: Decimal
    actual_input_qty: Decimal
    variance_pct: Decimal
    variance_reason: str | None
    lots: list[BatchActualInputLotResponse]


class BatchResponse(ORMModel):
    id: uuid.UUID
    batch_number: str
    plan_id: uuid.UUID | None
    product_id: uuid.UUID
    location_id: uuid.UUID
    warehouse_id: uuid.UUID
    planned_output_qty: Decimal
    actual_output_qty: Decimal | None
    output_variance_qty: Decimal | None
    output_variance_pct: Decimal | None
    output_variance_reason: str | None
    mfg_date: date
    expiry_date: date
    status: BatchStatus
    executed_by: str
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime
