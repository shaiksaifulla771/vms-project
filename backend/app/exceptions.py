"""Domain exception hierarchy. Every exception here maps to exactly one
HTTP status at the API boundary (see app/main.py's registered handlers).
Route/handler code must not catch these and rewrap as a generic 500 — let
FastAPI's registered handlers do the mapping."""


class DomainError(Exception):
    """Base for every typed domain error this system raises."""


class NotFoundError(DomainError):
    """Maps to HTTP 404."""


class VendorNotFoundError(NotFoundError):
    pass


class MaterialNotFoundError(NotFoundError):
    pass


class ProductNotFoundError(NotFoundError):
    pass


class MpnNotFoundError(NotFoundError):
    pass


class VendorPriceNotFoundError(NotFoundError):
    pass


class PurchaseRequestNotFoundError(NotFoundError):
    pass


class PurchaseOrderNotFoundError(NotFoundError):
    pass


class ValidationFailedError(DomainError):
    """Maps to HTTP 422 — malformed input or a business-rule validation
    failure discovered before any write."""


class InvalidLineNumbersError(ValidationFailedError):
    pass


class EmptyLinesError(ValidationFailedError):
    pass


class ConflictError(DomainError):
    """Maps to HTTP 409 — state / uniqueness / concurrency conflicts."""


class DuplicateCodeError(ConflictError):
    pass


class DuplicateMpnError(ConflictError):
    pass


class OverlappingVendorPriceError(ConflictError):
    """Postgres refused a vendor_prices insert because its daterange
    overlaps an existing row (EXCLUDE USING gist)."""


class InvalidStateTransitionError(ConflictError):
    """A caller asked for a lifecycle move the current state does not
    allow (e.g. approving a REJECTED PR, issuing an already-ISSUED PO)."""


class VendorNotOrderableError(ConflictError):
    """PO issue attempted against a vendor not in APPROVED or ACTIVE."""


class ReceiptOverdrawnError(ConflictError):
    """A receipt would push quantity_received past quantity_ordered."""


class BlacklistedVendorError(ConflictError):
    pass
