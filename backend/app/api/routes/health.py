import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.core.db import get_engine
from app.core.logging import log_event

router = APIRouter()


@router.get("/healthz")
async def healthz() -> JSONResponse:
    """Liveness AND readiness in one probe. Runs `SELECT 1` against the raw
    engine, bypassing the RLS/auth session path (a health check must never
    require a bearer token), with a short explicit statement timeout so a
    hung DB never hangs this endpoint longer than a real request would
    wait."""
    try:
        engine = get_engine()
        async with engine.connect() as conn:
            await conn.execute(text("SET LOCAL statement_timeout = '2000ms'"))
            await conn.execute(text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001 - health check must never raise, only report
        log_event("healthz_db_check_failed", level=logging.WARNING, error=str(exc))
        return JSONResponse(status_code=503, content={"status": "degraded", "db": "unreachable"})
    return JSONResponse(status_code=200, content={"status": "ok", "db": "ok"})
