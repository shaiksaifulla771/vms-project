"""Pure math ported from ERP-SYSTEM for Planning and Batch Execution.
requires_reason's boundary case (variance exactly at tolerance) is the one
most worth pinning down: it must pass WITHOUT a reason, since the check is
strictly ABS(variance) > tolerance, not >=."""

from decimal import Decimal

import pytest

from app.utils.formulas import (
    batches_required,
    long_short_status,
    qty_required,
    requires_reason,
    variance_pct,
)


@pytest.mark.parametrize(
    "demand,batch_size,expected",
    [
        (Decimal("1000"), Decimal("250"), 4),  # exact multiple
        (Decimal("1001"), Decimal("250"), 5),  # rounds up
        (Decimal("100"), Decimal("100"), 1),
        (Decimal("1"), Decimal("100"), 1),
    ],
)
def test_batches_required(demand: Decimal, batch_size: Decimal, expected: int) -> None:
    assert batches_required(demand, batch_size) == expected


def test_batches_required_rejects_nonpositive_batch_size() -> None:
    with pytest.raises(ValueError):
        batches_required(Decimal("100"), Decimal("0"))


@pytest.mark.parametrize(
    "demand,formula_pct,expected",
    [
        (Decimal("1000"), Decimal("10"), Decimal("100.0")),
        (Decimal("500"), Decimal("2.5"), Decimal("12.50")),
        (Decimal("0"), Decimal("50"), Decimal("0")),
    ],
)
def test_qty_required(demand: Decimal, formula_pct: Decimal, expected: Decimal) -> None:
    assert qty_required(demand, formula_pct) == expected


@pytest.mark.parametrize(
    "available,required,expected_status",
    [
        (Decimal("100"), Decimal("100"), "LONG"),  # exact match is LONG, not SHORT
        (Decimal("100.0001"), Decimal("100"), "LONG"),
        (Decimal("99.9999"), Decimal("100"), "SHORT"),
        (Decimal("0"), Decimal("0"), "LONG"),
    ],
)
def test_long_short_status(available: Decimal, required: Decimal, expected_status: str) -> None:
    delta, status = long_short_status(available, required)
    assert status == expected_status
    assert delta == available - required


@pytest.mark.parametrize(
    "actual,planned,expected",
    [
        (Decimal("110"), Decimal("100"), Decimal("10")),
        (Decimal("90"), Decimal("100"), Decimal("-10")),
        (Decimal("100"), Decimal("100"), Decimal("0")),
    ],
)
def test_variance_pct(actual: Decimal, planned: Decimal, expected: Decimal) -> None:
    assert variance_pct(actual, planned) == expected


def test_variance_pct_rejects_zero_planned() -> None:
    with pytest.raises(ValueError):
        variance_pct(Decimal("10"), Decimal("0"))


def test_requires_reason_exactly_at_tolerance_boundary_passes_without_reason() -> None:
    # abs(variance) > tolerance is the rule — strictly greater than, so a
    # variance sitting exactly on the tolerance line needs no reason.
    assert requires_reason(Decimal("5.00"), Decimal("5.00")) is False
    assert requires_reason(Decimal("-5.00"), Decimal("5.00")) is False


def test_requires_reason_just_over_tolerance_requires_a_reason() -> None:
    assert requires_reason(Decimal("5.01"), Decimal("5.00")) is True
    assert requires_reason(Decimal("-5.01"), Decimal("5.00")) is True


def test_requires_reason_well_under_tolerance() -> None:
    assert requires_reason(Decimal("1"), Decimal("5.00")) is False
