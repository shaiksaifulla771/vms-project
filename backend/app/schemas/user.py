import uuid
from datetime import datetime

from pydantic import EmailStr

from app.models.enums import UserRole
from app.schemas.common import ORMModel


class UserProfileResponse(ORMModel):
    id: uuid.UUID
    full_name: str
    email: EmailStr
    role: UserRole
    created_at: datetime
    updated_at: datetime


class UserRoleUpdateRequest(ORMModel):
    role: UserRole
