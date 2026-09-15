import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthenticatedUser, get_session, require_editor
from app.models.batch import BatchActualInputLot
from app.schemas.batch import BatchActualInputLotResponse, BatchActualInputResponse, BatchResponse
from app.schemas.correction import (
    InputCorrectionRequest,
    InputCorrectionResponse,
    OutputCorrectionRequest,
    OutputCorrectionResponse,
)
from app.services.correction_service import CorrectionService

router = APIRouter(prefix="/api/v1/batches", tags=["corrections"])
_service = CorrectionService()


@router.post("/{batch_id}/correct-output", response_model=OutputCorrectionResponse)
async def correct_output(
    batch_id: uuid.UUID,
    payload: OutputCorrectionRequest,
    session: AsyncSession = Depends(get_session),
    user: AuthenticatedUser = Depends(require_editor),
):
    batch = await _service.correct_output(
        session,
        batch_id=batch_id,
        new_actual_output_qty=payload.new_actual_output_qty,
        reason_notes=payload.reason_notes,
        actor_id=user.id,
    )
    return OutputCorrectionResponse(batch=BatchResponse.model_validate(batch))


@router.post("/{batch_id}/actual-inputs/{input_id}/correct", response_model=InputCorrectionResponse)
async def correct_input_line(
    batch_id: uuid.UUID,
    input_id: uuid.UUID,
    payload: InputCorrectionRequest,
    session: AsyncSession = Depends(get_session),
    user: AuthenticatedUser = Depends(require_editor),
):
    input_row = await _service.correct_input_line(
        session,
        batch_id=batch_id,
        input_id=input_id,
        consumed_lot_id=payload.consumed_lot_id,
        new_quantity=payload.new_quantity,
        reason_notes=payload.reason_notes,
        actor_id=user.id,
    )
    lots = (
        await session.execute(select(BatchActualInputLot).where(BatchActualInputLot.batch_actual_input_id == input_row.id))
    ).scalars().all()
    response = BatchActualInputResponse(
        id=input_row.id,
        material_id=input_row.material_id,
        bom_percentage=input_row.bom_percentage,
        planned_input_qty=input_row.planned_input_qty,
        actual_input_qty=input_row.actual_input_qty,
        variance_pct=input_row.variance_pct,
        variance_reason=input_row.variance_reason,
        lots=[BatchActualInputLotResponse(id=lot.id, consumed_lot_id=lot.consumed_lot_id, quantity=lot.quantity) for lot in lots],
    )
    return InputCorrectionResponse(input_line=response)
