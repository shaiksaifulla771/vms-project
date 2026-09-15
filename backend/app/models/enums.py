import enum


class UserRole(str, enum.Enum):
    admin = "admin"
    editor = "editor"
    viewer = "viewer"


class MasterDataStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"


class ItemClassification(str, enum.Enum):
    RAW_MATERIAL = "RAW_MATERIAL"
    PACKAGING = "PACKAGING"
    EMULSIFIER = "EMULSIFIER"
    CONSUMABLE = "CONSUMABLE"
    FINISHED_GOOD = "FINISHED_GOOD"


class VendorStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    APPROVED = "APPROVED"
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"
    BLACKLISTED = "BLACKLISTED"


class PriceSource(str, enum.Enum):
    QUOTE = "QUOTE"
    CONTRACT = "CONTRACT"
    SPOT = "SPOT"
    PO_HISTORY = "PO_HISTORY"


class PrStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    CONVERTED = "CONVERTED"
    CANCELLED = "CANCELLED"


class PoStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    ISSUED = "ISSUED"
    PARTIALLY_RECEIVED = "PARTIALLY_RECEIVED"
    RECEIVED = "RECEIVED"
    CLOSED = "CLOSED"
    CANCELLED = "CANCELLED"


class AuditAction(str, enum.Enum):
    INSERT = "INSERT"
    UPDATE = "UPDATE"
    DELETE = "DELETE"
    STATUS_CHANGE = "STATUS_CHANGE"
    APPROVE = "APPROVE"
    REJECT = "REJECT"
    CONVERT = "CONVERT"
    ISSUE = "ISSUE"
    RECEIVE = "RECEIVE"
    CLOSE = "CLOSE"
    CANCEL = "CANCEL"


class InventoryTxnType(str, enum.Enum):
    INWARD_PURCHASE = "INWARD_PURCHASE"
    OUTWARD_DISPOSAL = "OUTWARD_DISPOSAL"
    STOCK_ADJUSTMENT = "STOCK_ADJUSTMENT"
    MFG_CONSUMPTION = "MFG_CONSUMPTION"
    MFG_PRODUCTION = "MFG_PRODUCTION"
    DYNAMIC_RECONCILIATION = "DYNAMIC_RECONCILIATION"


class PlanStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class BatchStatus(str, enum.Enum):
    SCHEDULED = "SCHEDULED"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"
