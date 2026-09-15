import pytest

from app.models.enums import PrStatus
from app.services.purchase_request_service import _ALLOWED


@pytest.mark.parametrize(
    "start,target",
    [
        (PrStatus.DRAFT, PrStatus.SUBMITTED),
        (PrStatus.DRAFT, PrStatus.CANCELLED),
        (PrStatus.SUBMITTED, PrStatus.APPROVED),
        (PrStatus.SUBMITTED, PrStatus.REJECTED),
        (PrStatus.SUBMITTED, PrStatus.CANCELLED),
        (PrStatus.APPROVED, PrStatus.CONVERTED),
    ],
)
def test_allowed_transition(start: PrStatus, target: PrStatus) -> None:
    assert target in _ALLOWED[start]


@pytest.mark.parametrize(
    "start,target",
    [
        (PrStatus.DRAFT, PrStatus.APPROVED),  # must be SUBMITTED first
        (PrStatus.DRAFT, PrStatus.CONVERTED),
        (PrStatus.SUBMITTED, PrStatus.CONVERTED),  # must be APPROVED first
        (PrStatus.SUBMITTED, PrStatus.DRAFT),
        (PrStatus.APPROVED, PrStatus.REJECTED),  # decision already made
        (PrStatus.APPROVED, PrStatus.CANCELLED),
        (PrStatus.REJECTED, PrStatus.APPROVED),  # terminal
        (PrStatus.CONVERTED, PrStatus.CANCELLED),  # terminal
        (PrStatus.CANCELLED, PrStatus.DRAFT),  # terminal
    ],
)
def test_disallowed_transition(start: PrStatus, target: PrStatus) -> None:
    assert target not in _ALLOWED[start]


def test_terminal_states_have_no_outgoing_transitions() -> None:
    for terminal in (PrStatus.REJECTED, PrStatus.CONVERTED, PrStatus.CANCELLED):
        assert _ALLOWED[terminal] == set()


def test_every_status_has_a_transition_entry() -> None:
    assert set(_ALLOWED.keys()) == set(PrStatus)
