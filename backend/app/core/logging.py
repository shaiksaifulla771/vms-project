import logging
import sys

logger = logging.getLogger("vms")


def configure_logging() -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    logger.handlers = [handler]
    logger.setLevel(logging.INFO)
    logger.propagate = False


def log_event(event: str, *, level: int = logging.INFO, **fields) -> None:
    """Structured key=value logging. Used for auth denials, RBAC denials,
    lock-contention retries, PR/PO state transitions, and every other
    operationally significant event — never a free-text log line."""
    rendered = " ".join(f"{k}={v}" for k, v in fields.items())
    logger.log(level, "%s %s", event, rendered)
