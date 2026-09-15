import logging
import uuid
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from functools import lru_cache

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient, PyJWKClientError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import build_session
from app.core.logging import log_event
from app.models.enums import UserRole

bearer_scheme = HTTPBearer(auto_error=True)

_ROLE_RANK: dict[UserRole, int] = {UserRole.viewer: 0, UserRole.editor: 1, UserRole.admin: 2}

_ASYMMETRIC_ALGORITHMS = ["ES256", "RS256", "EdDSA"]


@dataclass(frozen=True)
class AuthenticatedUser:
    id: uuid.UUID
    email: str | None
    role: UserRole


@lru_cache(maxsize=1)
def _get_jwks_client() -> PyJWKClient:
    settings = get_settings()
    jwks_url = f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
    return PyJWKClient(jwks_url, cache_keys=True)


def _decode_jwt(token: str) -> dict:
    """Primary path: verify against Supabase's published JWKS (asymmetric
    signing keys — the default for every new project). Falls back to the
    legacy shared-secret HS256 path only when JWKS finds no matching key
    for this token's `kid`, never after a genuine signature or claims
    failure on an asymmetric token."""
    settings = get_settings()
    try:
        signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
    except PyJWKClientError:
        signing_key = None
    except Exception as exc:  # noqa: BLE001 - JWKS fetch/network, not a token failure
        log_event("auth_jwks_fetch_failed", level=logging.WARNING, error=str(exc))
        signing_key = None

    if signing_key is not None:
        try:
            return jwt.decode(
                token,
                signing_key.key,
                algorithms=_ASYMMETRIC_ALGORITHMS,
                audience=settings.jwt_audience,
            )
        except jwt.PyJWTError as exc:
            log_event("auth_token_rejected", level=logging.WARNING, reason=type(exc).__name__)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token"
            ) from exc

    if not settings.supabase_jwt_secret:
        log_event("auth_no_verification_method", level=logging.ERROR)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token could not be verified (no matching JWKS key and no legacy JWT secret configured)",
        )
    try:
        return jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=[settings.jwt_algorithm],
            audience=settings.jwt_audience,
        )
    except jwt.PyJWTError as exc:
        log_event("auth_token_rejected", level=logging.WARNING, reason=type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token"
        ) from exc


async def get_session(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency wrapping app.core.db.build_session. Cached per
    request by FastAPI, so every nested Depends() that asks for the session
    gets the exact same object — one connection, one transaction, one set
    of RLS claims, for the whole request."""
    claims = _decode_jwt(credentials.credentials)
    async for session in build_session(claims):
        yield session


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    session: AsyncSession = Depends(get_session),
) -> AuthenticatedUser:
    """Role is never read from the JWT claim. It is looked up via
    `public.get_auth_role()` — the same STABLE SECURITY DEFINER function
    every RLS policy calls. The FastAPI role check and Postgres RLS thus
    read the exact same source of truth and cannot disagree."""
    claims = _decode_jwt(credentials.credentials)
    try:
        user_id = uuid.UUID(claims["sub"])
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing subject") from exc

    result = await session.execute(text("SELECT public.get_auth_role() AS role"))
    role_value = result.scalar_one_or_none()
    if role_value is None:
        log_event("auth_no_profile", level=logging.WARNING, user_id=str(user_id))
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No user_profiles row for this account",
        )
    return AuthenticatedUser(id=user_id, email=claims.get("email"), role=UserRole(role_value))


def require_role(minimum: UserRole):
    async def _checker(user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
        if _ROLE_RANK[user.role] < _ROLE_RANK[minimum]:
            log_event(
                "rbac_denied",
                level=logging.WARNING,
                user_id=str(user.id),
                role=user.role.value,
                required=minimum.value,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires '{minimum.value}' role or higher",
            )
        return user

    return _checker


require_viewer = require_role(UserRole.viewer)
require_editor = require_role(UserRole.editor)
require_admin = require_role(UserRole.admin)
