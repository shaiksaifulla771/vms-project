import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import Field

from app.models.enums import PlanStatus
from app.schemas.common import ORMModel


class PlanProductLineRequest(ORMModel):
    product_id: uuid.UUID
    location_id: uuid.UUID
    demand_target_qty: Decimal = Field(gt=0)
    # How many units one batch run is sized to produce — see
    # docs/DOMAIN.md / PlanProduct model docstring for why this is
    # planner-supplied rather than read off a BOM column.
    batch_size_output: Decimal = Field(gt=0)


class PlanCreateRequest(ORMModel):
    idempotency_key: str | None = Field(default=None, max_length=80)
    lines: list[PlanProductLineRequest] = Field(min_length=1, max_length=100)


class PlanLineResponse(ORMModel):
    material_id: uuid.UUID
    formula_percentage: Decimal
    qty_required: Decimal
    qty_available: Decimal
    delta: Decimal
    status: str


class PlanProductResponse(ORMModel):
    id: uuid.UUID
    product_id: uuid.UUID
    location_id: uuid.UUID
    demand_target_qty: Decimal
    batch_size_output: Decimal
    bom_id: uuid.UUID
    batches_required: int
    lines: list[PlanLineResponse]


class PlanResponse(ORMModel):
    id: uuid.UUID
    plan_number: str
    status: PlanStatus
    created_by: uuid.UUID
    updated_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    products: list[PlanProductResponse]


class PlanSummaryBatchRow(ORMModel):
    product_id: uuid.UUID
    location_id: uuid.UUID
    planned_batches: int
    executed_batches: int
    completed_output_qty: Decimal


class PlanSummaryMaterialRow(ORMModel):
    material_id: uuid.UUID
    total_required_qty: Decimal
    total_available_qty: Decimal
    status: str


class PlanSummaryResponse(ORMModel):
    plan: PlanResponse
    batch_summary: list[PlanSummaryBatchRow]
    material_summary: list[PlanSummaryMaterialRow]
