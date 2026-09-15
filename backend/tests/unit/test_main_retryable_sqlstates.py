"""app.main._RETRYABLE_SQLSTATES gates which Postgres lock-contention
errors the API maps to a 409 {retryable: true} response (see
docs/ARCHITECTURE.md's concurrency section). Verifies the exact set
without booting a live app or DB."""

import os

for _key in ("DATABASE_URL", "SUPABASE_URL", "CORS_ORIGINS"):
    os.environ.pop(_key, None)

from app.main import _RETRYABLE_SQLSTATES  # noqa: E402


def test_lock_timeout_is_retryable() -> None:
    assert "55P03" in _RETRYABLE_SQLSTATES  # lock_not_available


def test_deadlock_is_retryable() -> None:
    assert "40P01" in _RETRYABLE_SQLSTATES  # deadlock_detected


def test_unique_violation_is_not_retryable() -> None:
    """A uniqueness conflict is a business error (ConflictError), never a
    transient lock condition — resending it would just fail again."""
    assert "23505" not in _RETRYABLE_SQLSTATES


def test_exactly_two_retryable_codes() -> None:
    assert _RETRYABLE_SQLSTATES == {"55P03", "40P01"}
