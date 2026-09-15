import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import EmailStr, Field

from app.models.enums import VendorStatus
from app.schemas.common import ORMModel


class VendorCreateRequest(ORMModel):
    code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=150)
    legal_name: str | None = Field(default=None, max_length=200)
    contact_email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=20)
    gstin: str | None = Field(default=None, pattern=r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$")
    pan: str | None = Field(default=None, pattern=r"^[A-Z]{5}[0-9]{4}[A-Z]$")
    payment_terms_days: int = Field(default=30, ge=0, le=365)
    credit_limit: Decimal = Field(default=Decimal(0), ge=0)
    address_line1: str | None = Field(default=None, max_length=200)
    address_line2: str | None = Field(default=None, max_length=200)
    city: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    country: str | None = Field(default=None, max_length=100)
    postal_code: str | None = Field(default=None, max_length=20)
    notes: str | None = None


class VendorUpdateRequest(ORMModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    legal_name: str | None = Field(default=None, max_length=200)
    contact_email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=20)
    gstin: str | None = Field(default=None, pattern=r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$")
    pan: str | None = Field(default=None, pattern=r"^[A-Z]{5}[0-9]{4}[A-Z]$")
    payment_terms_days: int | None = Field(default=None, ge=0, le=365)
    credit_limit: Decimal | None = Field(default=None, ge=0)
    address_line1: str | None = Field(default=None, max_length=200)
    address_line2: str | None = Field(default=None, max_length=200)
    city: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    country: str | None = Field(default=None, max_length=100)
    postal_code: str | None = Field(default=None, max_length=20)
    notes: str | None = None


class VendorStatusChangeRequest(ORMModel):
    status: VendorStatus
    reason: str | None = Field(default=None, max_length=500)


class VendorResponse(ORMModel):
    id: uuid.UUID
    code: str
    name: str
    legal_name: str | None
    status: VendorStatus
    contact_email: str | None
    phone: str | None
    gstin: str | None
    pan: str | None
    payment_terms_days: int
    credit_limit: Decimal
    address_line1: str | None
    address_line2: str | None
    city: str | None
    state: str | None
    country: str | None
    postal_code: str | None
    notes: str | None
    created_by: uuid.UUID
    updated_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
