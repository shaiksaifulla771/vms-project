from decimal import Decimal

import pytest

from app.models.enums import PoStatus
from app.services.purchase_order_service import _PO_ALLOWED, _round2


@pytest.mark.parametrize(
    "start,target",
    [
        (PoStatus.DRAFT, PoStatus.ISSUED),
        (PoStatus.DRAFT, PoStatus.CANCELLED),
        (PoStatus.ISSUED, PoStatus.PARTIALLY_RECEIVED),
        (PoStatus.ISSUED, PoStatus.RECEIVED),
        (PoStatus.ISSUED, PoStatus.CANCELLED),
        (PoStatus.PARTIALLY_RECEIVED, PoStatus.RECEIVED),
        (PoStatus.RECEIVED, PoStatus.CLOSED),
    ],
)
def test_allowed_transition(start: PoStatus, target: PoStatus) -> None:
    assert target in _PO_ALLOWED[start]


@pytest.mark.parametrize(
    "start,target",
    [
        (PoStatus.DRAFT, PoStatus.RECEIVED),  # must be ISSUED first
        (PoStatus.PARTIALLY_RECEIVED, PoStatus.CANCELLED),  # can't cancel once receiving started
        (PoStatus.PARTIALLY_RECEIVED, PoStatus.ISSUED),  # no going back
        (PoStatus.RECEIVED, PoStatus.ISSUED),
        (PoStatus.RECEIVED, PoStatus.CANCELLED),  # must close, not cancel, once received
        (PoStatus.CLOSED, PoStatus.RECEIVED),  # terminal
        (PoStatus.CANCELLED, PoStatus.DRAFT),  # terminal
    ],
)
def test_disallowed_transition(start: PoStatus, target: PoStatus) -> None:
    assert target not in _PO_ALLOWED[start]


def test_terminal_states_have_no_outgoing_transitions() -> None:
    for terminal in (PoStatus.CLOSED, PoStatus.CANCELLED):
        assert _PO_ALLOWED[terminal] == set()


def test_every_status_has_a_transition_entry() -> None:
    assert set(_PO_ALLOWED.keys()) == set(PoStatus)


@pytest.mark.parametrize(
    "value,expected",
    [
        (Decimal("10.005"), Decimal("10.01")),  # ROUND_HALF_UP, not banker's rounding
        (Decimal("10.004"), Decimal("10.00")),
        (Decimal("100"), Decimal("100.00")),
        (Decimal("0.125"), Decimal("0.13")),
    ],
)
def test_round2_uses_round_half_up(value: Decimal, expected: Decimal) -> None:
    assert _round2(value) == expected
