import uuid
from decimal import Decimal

from pydantic import Field

from app.schemas.batch import BatchActualInputResponse, BatchResponse
from app.schemas.common import ORMModel


class OutputCorrectionRequest(ORMModel):
    new_actual_output_qty: Decimal = Field(gt=0)
    # Mandatory unconditionally, unlike batch completion where a reason is
    # only required above tolerance.
    reason_notes: str = Field(min_length=1, max_length=500)


class InputCorrectionRequest(ORMModel):
    consumed_lot_id: uuid.UUID
    new_quantity: Decimal = Field(gt=0)
    reason_notes: str = Field(min_length=1, max_length=500)


class OutputCorrectionResponse(ORMModel):
    batch: BatchResponse


class InputCorrectionResponse(ORMModel):
    input_line: BatchActualInputResponse
