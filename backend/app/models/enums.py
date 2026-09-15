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
