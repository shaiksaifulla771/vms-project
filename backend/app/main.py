import logging
import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DBAPIError

from app.api.routes import (
    analytics,
    health,
    inventory,
    locations,
    materials,
    me,
    mpn,
    pricing,
    products,
    purchase_orders,
    purchase_requests,
    users,
    vendors,
)
from app.core.logging import configure_logging, log_event
from app.exceptions import ConflictError, DomainError, NotFoundError, ValidationFailedError

# Postgres SQLSTATEs where the transaction did nothing but fail to acquire
# a lock in time / lost deadlock arbitration — never a business conflict.
# Because every write path is atomic (one transaction, full rollback on
# any error) and every mutation is idempotent on a natural key, the
# client can always safely resend the identical request.
_RETRYABLE_SQLSTATES = {
    "55P03",  # lock_not_available — lock_timeout exceeded
    "40P01",  # deadlock_detected — lost deadlock arbitration
}


def _cors_origins() -> list[str]:
    """Read straight from the environment — CORS is set at process boot,
    before any request has arrived, so it deliberately does not depend on
    the full Settings validator (which requires DATABASE_URL/SUPABASE_URL
    and can be legitimately unset at test-collection or OpenAPI time)."""
    raw = os.environ.get("CORS_ORIGINS", "").strip()
    return [origin.strip() for origin in raw.split(",") if origin.strip()] if raw else []


def create_app() -> FastAPI:
    configure_logging()
    app = FastAPI(title="Vendor Management System", version="1.0.0")

    origins = _cors_origins()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins or ["*"],
        allow_credentials=bool(origins),
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Order matters: subclasses first, then the base — FastAPI matches the
    # most-specific handler for a raised exception.
    @app.exception_handler(NotFoundError)
    async def _not_found(_: Request, exc: NotFoundError) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(ValidationFailedError)
    async def _validation_failed(_: Request, exc: ValidationFailedError) -> JSONResponse:
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    @app.exception_handler(ConflictError)
    async def _conflict(request: Request, exc: ConflictError) -> JSONResponse:
        log_event("conflict", path=str(request.url.path), detail=str(exc))
        return JSONResponse(status_code=409, content={"detail": str(exc)})

    @app.exception_handler(DomainError)
    async def _domain_error(_: Request, exc: DomainError) -> JSONResponse:
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    @app.exception_handler(DBAPIError)
    async def _db_contention(request: Request, exc: DBAPIError) -> JSONResponse:
        """Transport-layer translation of a Postgres condition, not a
        domain exception. The transaction already rolled back in full via
        build_session's exception path; a non-retryable DBAPIError
        re-raises to the default 500 handler."""
        sqlstate = getattr(exc.orig, "sqlstate", None)
        if sqlstate in _RETRYABLE_SQLSTATES:
            log_event(
                "lock_contention_retryable",
                level=logging.WARNING,
                sqlstate=sqlstate,
                path=str(request.url.path),
            )
            return JSONResponse(
                status_code=409,
                content={
                    "detail": "Transient lock contention — no partial write occurred; "
                    "safe to retry the identical request.",
                    "retryable": True,
                },
            )
        raise exc

    app.include_router(health.router)
    app.include_router(me.router)
    app.include_router(users.router)
    app.include_router(vendors.router)
    app.include_router(materials.router)
    app.include_router(products.router)
    app.include_router(mpn.router)
    app.include_router(pricing.router)
    app.include_router(purchase_requests.router)
    app.include_router(purchase_orders.router)
    app.include_router(analytics.router)
    app.include_router(locations.router)
    app.include_router(inventory.router)

    return app


app = create_app()
