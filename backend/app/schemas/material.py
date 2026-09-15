import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import Field

from app.models.enums import ItemClassification, MasterDataStatus
from app.schemas.common import ORMModel


class MaterialCreateRequest(ORMModel):
    code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=150)
    classification: ItemClassification
    uom: str = Field(default="kg", min_length=1, max_length=20)
    hsn_code: str | None = Field(default=None, max_length=20)
    safety_stock: Decimal = Field(default=Decimal(0), ge=0)
    reorder_point: Decimal = Field(default=Decimal(0), ge=0)
    moq: Decimal = Field(default=Decimal(1), gt=0)
    lead_time_days: int = Field(default=7, ge=0, le=365)
    is_hazardous: bool = False
    status: MasterDataStatus = MasterDataStatus.ACTIVE


class MaterialUpdateRequest(ORMModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    classification: ItemClassification | None = None
    uom: str | None = Field(default=None, min_length=1, max_length=20)
    hsn_code: str | None = Field(default=None, max_length=20)
    safety_stock: Decimal | None = Field(default=None, ge=0)
    reorder_point: Decimal | None = Field(default=None, ge=0)
    moq: Decimal | None = Field(default=None, gt=0)
    lead_time_days: int | None = Field(default=None, ge=0, le=365)
    is_hazardous: bool | None = None
    status: MasterDataStatus | None = None


class MaterialResponse(ORMModel):
    id: uuid.UUID
    code: str
    name: str
    classification: ItemClassification
    uom: str
    hsn_code: str | None
    safety_stock: Decimal
    reorder_point: Decimal
    moq: Decimal
    lead_time_days: int
    is_hazardous: bool
    status: MasterDataStatus
    created_by: uuid.UUID
    updated_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
