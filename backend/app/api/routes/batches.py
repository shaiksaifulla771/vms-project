import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthenticatedUser, get_session, require_editor, require_viewer
from app.models.enums import BatchStatus
from app.schemas.batch import (
    BatchActualInputLotResponse,
    BatchActualInputResponse,
    BatchCompleteRequest,
    BatchCreateRequest,
    BatchResponse,
)
from app.services.batch_service import BatchExecutionService, BatchLineResult

router = APIRouter(prefix="/api/v1/batches", tags=["batches"])
_service = BatchExecutionService()


def _line_to_response(line: BatchLineResult) -> BatchActualInputResponse:
    input_row = line.batch_actual_input
    return BatchActualInputResponse(
        id=input_row.id,
        material_id=input_row.material_id,
        bom_percentage=input_row.bom_percentage,
        planned_input_qty=input_row.planned_input_qty,
        actual_input_qty=input_row.actual_input_qty,
        variance_pct=input_row.variance_pct,
        variance_reason=input_row.variance_reason,
        lots=[
            BatchActualInputLotResponse(id=lot.id, consumed_lot_id=lot.consumed_lot_id, quantity=lot.quantity)
            for lot in line.lots
        ],
    )


@router.post("", response_model=BatchResponse, status_code=201)
async def create_batch(
    payload: BatchCreateRequest,
    session: AsyncSession = Depends(get_session),
    user: AuthenticatedUser = Depends(require_editor),
):
    batch = await _service.create_batch(session, payload=payload, actor_id=user.id)
    return BatchResponse.model_validate(batch)


@router.get("", response_model=list[BatchResponse])
async def list_batches(
    plan_id: uuid.UUID | None = None,
    status: BatchStatus | None = None,
    location_id: uuid.UUID | None = None,
    session: AsyncSession = Depends(get_session),
    _: AuthenticatedUser = Depends(require_viewer),
):
    batches = await _service.list(session, plan_id=plan_id, status=status, location_id=location_id)
    return [BatchResponse.model_validate(b) for b in batches]


@router.get("/{batch_id}", response_model=BatchResponse)
async def get_batch(
    batch_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _: AuthenticatedUser = Depends(require_viewer),
):
    batch = await _service.get(session, batch_id)
    return BatchResponse.model_validate(batch)


@router.get("/{batch_id}/inputs", response_model=list[BatchActualInputResponse])
async def get_batch_inputs(
    batch_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _: AuthenticatedUser = Depends(require_viewer),
):
    lines = await _service.get_inputs(session, batch_id)
    return [_line_to_response(line) for line in lines]


@router.post("/{batch_id}/start", response_model=BatchResponse)
async def start_batch(
    batch_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: AuthenticatedUser = Depends(require_editor),
):
    batch = await _service.start_batch(session, batch_id=batch_id, actor_id=user.id)
    return BatchResponse.model_validate(batch)


@router.post("/{batch_id}/cancel", response_model=BatchResponse)
async def cancel_batch(
    batch_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: AuthenticatedUser = Depends(require_editor),
):
    batch = await _service.cancel_batch(session, batch_id=batch_id, actor_id=user.id)
    return BatchResponse.model_validate(batch)


@router.post("/{batch_id}/complete", response_model=BatchResponse)
async def complete_batch(
    batch_id: uuid.UUID,
    payload: BatchCompleteRequest,
    session: AsyncSession = Depends(get_session),
    user: AuthenticatedUser = Depends(require_editor),
):
    batch = await _service.complete_batch(
        session,
        batch_id=batch_id,
        actual_output_qty=payload.actual_output_qty,
        input_lines=payload.input_lines,
        output_variance_reason=payload.output_variance_reason,
        actor_id=user.id,
    )
    return BatchResponse.model_validate(batch)
