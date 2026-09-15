"""VendorService._ALLOWED_TRANSITIONS is the single source of truth the
service consults on every status-change call. These tests exercise it
directly rather than through a live DB, so they run with no Supabase
credentials configured."""

import pytest

from app.models.enums import VendorStatus
from app.services.vendor_service import _ALLOWED_TRANSITIONS


@pytest.mark.parametrize(
    "start,target",
    [
        (VendorStatus.DRAFT, VendorStatus.APPROVED),
        (VendorStatus.DRAFT, VendorStatus.BLACKLISTED),
        (VendorStatus.APPROVED, VendorStatus.ACTIVE),
        (VendorStatus.APPROVED, VendorStatus.SUSPENDED),
        (VendorStatus.APPROVED, VendorStatus.BLACKLISTED),
        (VendorStatus.ACTIVE, VendorStatus.SUSPENDED),
        (VendorStatus.ACTIVE, VendorStatus.BLACKLISTED),
        (VendorStatus.SUSPENDED, VendorStatus.ACTIVE),
        (VendorStatus.SUSPENDED, VendorStatus.BLACKLISTED),
    ],
)
def test_allowed_transition(start: VendorStatus, target: VendorStatus) -> None:
    assert target in _ALLOWED_TRANSITIONS[start]


@pytest.mark.parametrize(
    "start,target",
    [
        (VendorStatus.DRAFT, VendorStatus.ACTIVE),  # must pass through APPROVED
        (VendorStatus.DRAFT, VendorStatus.SUSPENDED),
        (VendorStatus.ACTIVE, VendorStatus.DRAFT),
        (VendorStatus.ACTIVE, VendorStatus.APPROVED),  # no going back
        (VendorStatus.SUSPENDED, VendorStatus.DRAFT),
        (VendorStatus.BLACKLISTED, VendorStatus.ACTIVE),  # terminal
        (VendorStatus.BLACKLISTED, VendorStatus.APPROVED),
        (VendorStatus.BLACKLISTED, VendorStatus.DRAFT),
    ],
)
def test_disallowed_transition(start: VendorStatus, target: VendorStatus) -> None:
    assert target not in _ALLOWED_TRANSITIONS[start]


def test_blacklisted_is_terminal() -> None:
    assert _ALLOWED_TRANSITIONS[VendorStatus.BLACKLISTED] == set()


def test_every_status_has_a_transition_entry() -> None:
    assert set(_ALLOWED_TRANSITIONS.keys()) == set(VendorStatus)
