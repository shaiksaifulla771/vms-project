import uuid
from datetime import datetime

from pydantic import Field

from app.schemas.common import ORMModel


class LocationCreateRequest(ORMModel):
    name: str = Field(min_length=1, max_length=100)
    code: str = Field(min_length=1, max_length=20)
    address: str | None = None


class LocationResponse(ORMModel):
    id: uuid.UUID
    name: str
    code: str
    address: str | None
    created_by: uuid.UUID
    updated_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


class WarehouseCreateRequest(ORMModel):
    location_id: uuid.UUID
    name: str = Field(min_length=1, max_length=100)
    code: str = Field(min_length=1, max_length=20)
    is_default: bool = False


class WarehouseResponse(ORMModel):
    id: uuid.UUID
    location_id: uuid.UUID
    name: str
    code: str
    is_default: bool
    created_by: uuid.UUID
    updated_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
