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


class LocationNotFoundError(NotFoundError):
    pass


class WarehouseNotFoundError(NotFoundError):
    pass


class PlanNotFoundError(NotFoundError):
    pass


class BatchNotFoundError(NotFoundError):
    pass


class InputLineNotFoundError(NotFoundError):
    pass


class NoActiveBomError(NotFoundError):
    pass


class ValidationFailedError(DomainError):
    """Maps to HTTP 422 — malformed input or a business-rule validation
    failure discovered before any write."""


class InvalidLineNumbersError(ValidationFailedError):
    pass


class EmptyLinesError(ValidationFailedError):
    pass


class ToleranceExceededError(ValidationFailedError):
    """Output or input variance exceeds the product's
    variance_tolerance_percent and no reason was supplied."""


class OverrideReasonRequiredError(ValidationFailedError):
    """A manual consumed_lot_id override was supplied without reason_notes."""


class DuplicatePlanLineError(ValidationFailedError):
    """A plan-create request listed the same (product_id, location_id)
    pair more than once."""


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


class InsufficientStockError(ConflictError):
    """No unexpired lot(s) at this location/warehouse cover the required
    quantity — raised both at pre-lock candidate selection and again if a
    concurrent transaction drained a candidate lot before this one's lock."""


class LotScopeMismatchError(ConflictError):
    """A manual consumed_lot_id override does not match the batch's
    material/location/warehouse scope."""


class CorrectionWouldGoNegativeError(ConflictError):
    """A Dynamic IP/OP correction would drive a lot's quantity_on_hand
    below zero given downstream consumption already posted against it."""


class DuplicatePlanIdError(ConflictError):
    """A client-supplied idempotency_key already names an existing Plan
    whose lines don't match this request."""
