import uuid
from decimal import Decimal

from sqlalchemy import Boolean, Enum, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin
from app.models.enums import ItemClassification, MasterDataStatus


class Material(Base, TimestampMixin):
    __tablename__ = "materials"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(50), unique=True)
    name: Mapped[str] = mapped_column(String(150))
    classification: Mapped[ItemClassification] = mapped_column(
        Enum(ItemClassification, name="item_classification", create_type=False)
    )
    uom: Mapped[str] = mapped_column(String(20), default="kg")
    hsn_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    safety_stock: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal(0))
    reorder_point: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal(0))
    moq: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal(1))
    lead_time_days: Mapped[int] = mapped_column(Integer, default=7)
    is_hazardous: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[MasterDataStatus] = mapped_column(
        Enum(MasterDataStatus, name="master_data_status", create_type=False),
        default=MasterDataStatus.ACTIVE,
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user_profiles.id", ondelete="RESTRICT")
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user_profiles.id", ondelete="SET NULL"), nullable=True
    )
