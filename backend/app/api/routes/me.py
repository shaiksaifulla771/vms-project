"""Authenticated client's own identity + role, resolved via
`public.get_auth_role()` — the same source every RLS policy consults."""

from fastapi import APIRouter, Depends

from app.api.deps import AuthenticatedUser, get_current_user

router = APIRouter(prefix="/api/v1", tags=["me"])


@router.get("/me")
async def get_me(user: AuthenticatedUser = Depends(get_current_user)) -> dict:
    return {"id": str(user.id), "email": user.email, "role": user.role.value}
