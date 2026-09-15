import json
from collections.abc import AsyncGenerator
from functools import lru_cache

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings


@lru_cache(maxsize=1)
def get_engine() -> AsyncEngine:
    """DATABASE_URL must authenticate as Supabase's `authenticated` role,
    never `service_role` or a superuser — RLS is meaningful only if request
    handling actually runs through a connection RLS applies to."""
    return create_async_engine(get_settings().database_url, pool_pre_ping=True)


@lru_cache(maxsize=1)
def get_session_factory() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(get_engine(), expire_on_commit=False, autoflush=False)


async def build_session(claims: dict) -> AsyncGenerator[AsyncSession, None]:
    """One session per request, one transaction per request. Services must
    not open a nested `session.begin()` — SQLAlchemy disallows nesting an
    explicit transaction inside one already begun, and the request-scoped
    transaction below already is that one transaction.

    `set_config(..., is_local=true)` scopes both GUC settings to this
    transaction only, so they never leak across pooled connections or
    requests. Fail-fast bounds on lock waits (SQLSTATE 55P03) and total
    statement time keep a stuck holder from blocking the pool indefinitely.

    On success the session commits. On any exception it rolls back and the
    exception re-raises, so a failure at any step aborts everything written
    so far in this transaction — all-or-nothing.
    """
    settings = get_settings()
    async with get_session_factory()() as session:
        try:
            await session.execute(
                text("SELECT set_config('request.jwt.claims', :claims, true)"),
                {"claims": json.dumps(claims)},
            )
            await session.execute(text("SET LOCAL ROLE authenticated"))
            await session.execute(text(f"SET LOCAL lock_timeout = '{settings.lock_timeout_ms}ms'"))
            await session.execute(text(f"SET LOCAL statement_timeout = '{settings.statement_timeout_ms}ms'"))
            yield session
            await session.commit()
        except BaseException:
            await session.rollback()
            raise
