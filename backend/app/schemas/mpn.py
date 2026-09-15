import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import Field

from app.models.enums import MasterDataStatus
from app.schemas.common import ORMModel


class MaterialVendorCreateRequest(ORMModel):
    material_id: uuid.UUID
    vendor_id: uuid.UUID
    mpn_code: str = Field(min_length=1, max_length=80)
    specifications: dict[str, Any] = Field(default_factory=dict)
    certifications: list[str] = Field(default_factory=list)
    is_hazardous: bool = False
    purchase_approved: bool = True
    is_preferred: bool = False
    moq: Decimal = Field(default=Decimal(1), gt=0)
    lead_time_days: int = Field(default=7, ge=0, le=365)
    status: MasterDataStatus = MasterDataStatus.ACTIVE


class MaterialVendorUpdateRequest(ORMModel):
    mpn_code: str | None = Field(default=None, min_length=1, max_length=80)
    specifications: dict[str, Any] | None = None
    certifications: list[str] | None = None
    is_hazardous: bool | None = None
    purchase_approved: bool | None = None
    moq: Decimal | None = Field(default=None, gt=0)
    lead_time_days: int | None = Field(default=None, ge=0, le=365)
    status: MasterDataStatus | None = None


class MaterialVendorResponse(ORMModel):
    id: uuid.UUID
    material_id: uuid.UUID
    vendor_id: uuid.UUID
    mpn_code: str
    specifications: dict[str, Any]
    certifications: list[str]
    is_hazardous: bool
    purchase_approved: bool
    is_preferred: bool
    moq: Decimal
    lead_time_days: int
    status: MasterDataStatus
    created_by: uuid.UUID
    updated_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
