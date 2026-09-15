"""BatchExecutionService._BATCH_ALLOWED is the single source of truth the
service consults on every status-change call. These tests exercise it
directly, no live DB required (same pattern as
test_vendor_transitions.py / test_purchase_order_transitions.py)."""

import pytest

from app.models.enums import BatchStatus
from app.services.batch_service import _BATCH_ALLOWED


@pytest.mark.parametrize(
    "start,target",
    [
        (BatchStatus.SCHEDULED, BatchStatus.IN_PROGRESS),
        (BatchStatus.SCHEDULED, BatchStatus.CANCELLED),
        (BatchStatus.IN_PROGRESS, BatchStatus.COMPLETED),
        (BatchStatus.IN_PROGRESS, BatchStatus.CANCELLED),
    ],
)
def test_allowed_transition(start: BatchStatus, target: BatchStatus) -> None:
    assert target in _BATCH_ALLOWED[start]


@pytest.mark.parametrize(
    "start,target",
    [
        (BatchStatus.SCHEDULED, BatchStatus.COMPLETED),  # must go through IN_PROGRESS
        (BatchStatus.IN_PROGRESS, BatchStatus.SCHEDULED),  # no going back
        (BatchStatus.COMPLETED, BatchStatus.IN_PROGRESS),  # terminal — corrections only
        (BatchStatus.COMPLETED, BatchStatus.CANCELLED),
        (BatchStatus.CANCELLED, BatchStatus.SCHEDULED),  # terminal
        (BatchStatus.CANCELLED, BatchStatus.IN_PROGRESS),
    ],
)
def test_disallowed_transition(start: BatchStatus, target: BatchStatus) -> None:
    assert target not in _BATCH_ALLOWED[start]


def test_terminal_states_have_no_outgoing_transitions() -> None:
    for terminal in (BatchStatus.COMPLETED, BatchStatus.CANCELLED):
        assert _BATCH_ALLOWED[terminal] == set()


def test_every_status_has_a_transition_entry() -> None:
    assert set(_BATCH_ALLOWED.keys()) == set(BatchStatus)
