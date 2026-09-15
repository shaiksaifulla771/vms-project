"""Pure, DB-free math for Planning and Batch Execution. Services must call
these, never restate the arithmetic inline."""

import math
from decimal import Decimal
from typing import Literal

LongShortStatus = Literal["LONG", "SHORT"]


def batches_required(demand_target_qty: Decimal, batch_size_output: Decimal) -> int:
    """CEIL(demand_target_qty / batch_size_output). Purely informational —
    never feeds qty_required."""
    if batch_size_output <= 0:
        raise ValueError("batch_size_output must be positive")
    return math.ceil(demand_target_qty / batch_size_output)


def qty_required(demand_target_qty: Decimal, formula_percentage: Decimal) -> Decimal:
    """demand_target_qty * (formula_percentage / 100)."""
    return demand_target_qty * (formula_percentage / Decimal(100))


def long_short_status(qty_available: Decimal, qty_required_: Decimal) -> tuple[Decimal, LongShortStatus]:
    """delta = qty_available - qty_required; LONG if delta >= 0 else SHORT."""
    delta = qty_available - qty_required_
    status: LongShortStatus = "LONG" if delta >= 0 else "SHORT"
    return delta, status


def variance_pct(actual: Decimal, planned: Decimal) -> Decimal:
    """(actual - planned) / planned * 100."""
    if planned == 0:
        raise ValueError("planned quantity must be non-zero to compute variance")
    return (actual - planned) / planned * Decimal(100)


def requires_reason(variance_pct_value: Decimal, tolerance_percent: Decimal) -> bool:
    """A reason is mandatory when ABS(variance_pct) > tolerance — strictly
    greater than, so a variance exactly at the tolerance boundary passes
    without a reason."""
    return abs(variance_pct_value) > tolerance_percent
