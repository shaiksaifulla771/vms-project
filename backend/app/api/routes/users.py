"""Admin-only user administration. Reads and role updates go through RLS
policies (self-or-admin SELECT, admin-only UPDATE) — the API dependency
here rejects a non-admin before the query ever runs."""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthenticatedUser, get_session, require_admin
from app.exceptions import NotFoundError
from app.models.user_profile import UserProfile
from app.schemas.user import UserProfileResponse, UserRoleUpdateRequest

router = APIRouter(prefix="/api/v1/users", tags=["users"])


@router.get("", response_model=list[UserProfileResponse])
async def list_users(
    session: AsyncSession = Depends(get_session),
    _: AuthenticatedUser = Depends(require_admin),
) -> list[UserProfile]:
    result = await session.execute(select(UserProfile).order_by(UserProfile.email))
    return list(result.scalars().all())


@router.patch("/{user_id}/role", response_model=UserProfileResponse)
async def update_user_role(
    user_id: uuid.UUID,
    payload: UserRoleUpdateRequest,
    session: AsyncSession = Depends(get_session),
    _: AuthenticatedUser = Depends(require_admin),
) -> UserProfile:
    profile = await session.get(UserProfile, user_id)
    if profile is None:
        raise NotFoundError(f"User {user_id} not found")
    await session.execute(
        update(UserProfile).where(UserProfile.id == user_id).values(role=payload.role)
    )
    await session.refresh(profile)
    return profile
