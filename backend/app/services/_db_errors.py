"""Postgres SQLSTATE -> typed domain exception translation, shared by
every service that touches a table with UNIQUE, FK or EXCLUDE constraints.

Services must call `raise_for_integrity(...)` from inside `except
IntegrityError as exc:` and let it re-raise the typed error — never
swallow it, and never wrap it into a generic 500."""

from sqlalchemy.exc import IntegrityError

from app.exceptions import ConflictError, NotFoundError, OverlappingVendorPriceError

FK_VIOLATION = "23503"
UNIQUE_VIOLATION = "23505"
EXCLUSION_VIOLATION = "23P01"
CHECK_VIOLATION = "23514"


def raise_for_integrity(
    exc: IntegrityError,
    *,
    not_found: str,
    conflict: str,
    exclusion: str | None = None,
) -> None:
    sqlstate = getattr(exc.orig, "sqlstate", None)
    if sqlstate == FK_VIOLATION:
        raise NotFoundError(not_found) from exc
    if sqlstate == UNIQUE_VIOLATION:
        raise ConflictError(conflict) from exc
    if sqlstate == EXCLUSION_VIOLATION and exclusion is not None:
        raise OverlappingVendorPriceError(exclusion) from exc
    raise
