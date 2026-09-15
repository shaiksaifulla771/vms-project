"""app.services._db_errors.raise_for_integrity is the single place every
service translates a Postgres SQLSTATE into a typed domain exception.
Constructs a fake IntegrityError with the SQLSTATE Postgres would set,
without needing a live database connection."""

from types import SimpleNamespace

import pytest
from sqlalchemy.exc import IntegrityError

from app.exceptions import ConflictError, NotFoundError, OverlappingVendorPriceError
from app.services._db_errors import raise_for_integrity


def _fake_integrity_error(sqlstate: str) -> IntegrityError:
    orig = SimpleNamespace(sqlstate=sqlstate)
    return IntegrityError("statement", {}, orig)


def test_fk_violation_maps_to_not_found() -> None:
    exc = _fake_integrity_error("23503")
    with pytest.raises(NotFoundError, match="material not found"):
        raise_for_integrity(exc, not_found="material not found", conflict="unused")


def test_unique_violation_maps_to_conflict() -> None:
    exc = _fake_integrity_error("23505")
    with pytest.raises(ConflictError, match="duplicate code"):
        raise_for_integrity(exc, not_found="unused", conflict="duplicate code")


def test_exclusion_violation_maps_to_overlapping_price_when_provided() -> None:
    exc = _fake_integrity_error("23P01")
    with pytest.raises(OverlappingVendorPriceError, match="overlaps"):
        raise_for_integrity(exc, not_found="unused", conflict="unused", exclusion="overlaps")


def test_exclusion_violation_without_message_reraises() -> None:
    """raise_for_integrity's bare `raise` only re-raises correctly when
    called from inside an active `except IntegrityError:` block — its
    documented calling contract — so the test must reproduce that context
    rather than calling it directly."""
    exc = _fake_integrity_error("23P01")
    with pytest.raises(IntegrityError):
        try:
            raise exc
        except IntegrityError as caught:
            raise_for_integrity(caught, not_found="unused", conflict="unused")


def test_unmapped_sqlstate_reraises_original() -> None:
    exc = _fake_integrity_error("40001")  # serialization_failure, not one we map
    with pytest.raises(IntegrityError):
        try:
            raise exc
        except IntegrityError as caught:
            raise_for_integrity(caught, not_found="unused", conflict="unused")
