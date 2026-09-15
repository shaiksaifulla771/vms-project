import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthenticatedUser, get_session, require_editor, require_viewer
from app.schemas.planning import (
    PlanCreateRequest,
    PlanLineResponse,
    PlanProductResponse,
    PlanResponse,
    PlanSummaryBatchRow,
    PlanSummaryMaterialRow,
    PlanSummaryResponse,
)
from app.services.planning_service import PlanGroupResult, PlanningService, PlanProductResult, PlanSummary

router = APIRouter(prefix="/api/v1/plans", tags=["planning"])
_service = PlanningService()


def _plan_product_to_response(pp_result: PlanProductResult) -> PlanProductResponse:
    pp = pp_result.plan_product
    return PlanProductResponse(
        id=pp.id,
        product_id=pp.product_id,
        location_id=pp.location_id,
        demand_target_qty=pp.demand_target_qty,
        batch_size_output=pp.batch_size_output,
        bom_id=pp.bom_id,
        batches_required=pp.batches_required,
        lines=[
            PlanLineResponse(
                material_id=line.material_id,
                formula_percentage=line.formula_percentage,
                qty_required=line.qty_required,
                qty_available=line.qty_available,
                delta=line.delta,
                status=line.status,
            )
            for line in pp_result.lines
        ],
    )


def _plan_group_to_response(result: PlanGroupResult) -> PlanResponse:
    plan = result.plan
    return PlanResponse(
        id=plan.id,
        plan_number=plan.plan_number,
        status=plan.status,
        created_by=plan.created_by,
        updated_by=plan.updated_by,
        created_at=plan.created_at,
        updated_at=plan.updated_at,
        products=[_plan_product_to_response(p) for p in result.products],
    )


def _plan_summary_to_response(summary: PlanSummary) -> PlanSummaryResponse:
    return PlanSummaryResponse(
        plan=_plan_group_to_response(PlanGroupResult(plan=summary.plan, products=summary.products)),
        batch_summary=[
            PlanSummaryBatchRow(
                product_id=row.product_id,
                location_id=row.location_id,
                planned_batches=row.planned_batches,
                executed_batches=row.executed_batches,
                completed_output_qty=row.completed_output_qty,
            )
            for row in summary.batch_summary
        ],
        material_summary=[
            PlanSummaryMaterialRow(
                material_id=row.material_id,
                total_required_qty=row.total_required_qty,
                total_available_qty=row.total_available_qty,
                status=row.status,
            )
            for row in summary.material_summary
        ],
    )


@router.post("", response_model=PlanResponse, status_code=201)
async def create_plan(
    payload: PlanCreateRequest,
    session: AsyncSession = Depends(get_session),
    user: AuthenticatedUser = Depends(require_editor),
):
    result = await _service.compute_plan(
        session, lines=payload.lines, idempotency_key=payload.idempotency_key, created_by=user.id
    )
    return _plan_group_to_response(result)


@router.get("", response_model=list[PlanResponse])
async def list_plans(
    session: AsyncSession = Depends(get_session),
    _: AuthenticatedUser = Depends(require_viewer),
):
    plans = await _service.list_plans(session)
    results = []
    for plan in plans:
        detail = await _service.get_plan_detail(session, plan_id=plan.id)
        results.append(_plan_group_to_response(detail))
    return results


@router.get("/{plan_id}", response_model=PlanResponse)
async def get_plan(
    plan_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _: AuthenticatedUser = Depends(require_viewer),
):
    detail = await _service.get_plan_detail(session, plan_id=plan_id)
    return _plan_group_to_response(detail)


@router.get("/{plan_id}/summary", response_model=PlanSummaryResponse)
async def get_plan_summary(
    plan_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _: AuthenticatedUser = Depends(require_viewer),
):
    summary = await _service.get_plan_summary(session, plan_id=plan_id)
    return _plan_summary_to_response(summary)
