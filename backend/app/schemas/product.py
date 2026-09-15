import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import Field

from app.models.enums import MasterDataStatus
from app.schemas.common import ORMModel


class ProductCreateRequest(ORMModel):
    sku: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=150)
    uom: str = Field(default="units", min_length=1, max_length=20)
    pack_size: Decimal | None = Field(default=None, gt=0)
    status: MasterDataStatus = MasterDataStatus.ACTIVE


class ProductUpdateRequest(ORMModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    uom: str | None = Field(default=None, min_length=1, max_length=20)
    pack_size: Decimal | None = Field(default=None, gt=0)
    status: MasterDataStatus | None = None


class ProductResponse(ORMModel):
    id: uuid.UUID
    sku: str
    name: str
    uom: str
    pack_size: Decimal | None
    status: MasterDataStatus
    created_by: uuid.UUID
    updated_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
