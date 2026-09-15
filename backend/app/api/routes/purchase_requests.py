import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthenticatedUser, get_session, require_admin, require_editor, require_viewer
from app.models.enums import PrStatus
from app.schemas.purchase_request import (
    PurchaseRequestCreateRequest,
    PurchaseRequestDecisionRequest,
    PurchaseRequestItemResponse,
    PurchaseRequestResponse,
)
from app.services.purchase_request_service import PurchaseRequestService

router = APIRouter(prefix="/api/v1/purchase-requests", tags=["purchase-requests"])
_service = PurchaseRequestService()


def _to_response(pr, items) -> PurchaseRequestResponse:
    return PurchaseRequestResponse(
        id=pr.id,
        pr_number=pr.pr_number,
        title=pr.title,
        status=pr.status,
        required_by=pr.required_by,
        justification=pr.justification,
        submitted_at=pr.submitted_at,
        submitted_by=pr.submitted_by,
        decided_at=pr.decided_at,
        decided_by=pr.decided_by,
        decision_notes=pr.decision_notes,
        created_by=pr.created_by,
        updated_by=pr.updated_by,
        created_at=pr.created_at,
        updated_at=pr.updated_at,
        items=[PurchaseRequestItemResponse.model_validate(i) for i in items],
    )


@router.get("", response_model=list[PurchaseRequestResponse])
async def list_purchase_requests(
    status: PrStatus | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
    _: AuthenticatedUser = Depends(require_viewer),
):
    prs = await _service.list(session, status=status, limit=limit, offset=offset)
    out = []
    for pr in prs:
        items = await _service.get_items(session, pr.id)
        out.append(_to_response(pr, items))
    return out


@router.get("/{pr_id}", response_model=PurchaseRequestResponse)
async def get_purchase_request(
    pr_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _: AuthenticatedUser = Depends(require_viewer),
):
    pr = await _service.get(session, pr_id)
    items = await _service.get_items(session, pr_id)
    return _to_response(pr, items)


@router.post("", response_model=PurchaseRequestResponse, status_code=201)
async def create_purchase_request(
    payload: PurchaseRequestCreateRequest,
    session: AsyncSession = Depends(get_session),
    user: AuthenticatedUser = Depends(require_editor),
):
    pr, items = await _service.create(session, payload=payload, actor_id=user.id)
    return _to_response(pr, items)


@router.post("/{pr_id}/submit", response_model=PurchaseRequestResponse)
async def submit_purchase_request(
    pr_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: AuthenticatedUser = Depends(require_editor),
):
    pr = await _service.submit(session, pr_id=pr_id, actor_id=user.id)
    items = await _service.get_items(session, pr_id)
    return _to_response(pr, items)


@router.post("/{pr_id}/approve", response_model=PurchaseRequestResponse)
async def approve_purchase_request(
    pr_id: uuid.UUID,
    payload: PurchaseRequestDecisionRequest,
    session: AsyncSession = Depends(get_session),
    user: AuthenticatedUser = Depends(require_admin),
):
    pr = await _service.approve(session, pr_id=pr_id, payload=payload, actor_id=user.id)
    items = await _service.get_items(session, pr_id)
    return _to_response(pr, items)


@router.post("/{pr_id}/reject", response_model=PurchaseRequestResponse)
async def reject_purchase_request(
    pr_id: uuid.UUID,
    payload: PurchaseRequestDecisionRequest,
    session: AsyncSession = Depends(get_session),
    user: AuthenticatedUser = Depends(require_admin),
):
    pr = await _service.reject(session, pr_id=pr_id, payload=payload, actor_id=user.id)
    items = await _service.get_items(session, pr_id)
    return _to_response(pr, items)


@router.post("/{pr_id}/cancel", response_model=PurchaseRequestResponse)
async def cancel_purchase_request(
    pr_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: AuthenticatedUser = Depends(require_editor),
):
    pr = await _service.cancel(session, pr_id=pr_id, actor_id=user.id)
    items = await _service.get_items(session, pr_id)
    return _to_response(pr, items)
