import uuid
from decimal import Decimal
from typing import Any

from sqlalchemy import ARRAY, Boolean, Enum, ForeignKey, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin
from app.models.enums import MasterDataStatus


class MaterialVendor(Base, TimestampMixin):
    __tablename__ = "material_vendors"
    __table_args__ = (
        UniqueConstraint("material_id", "vendor_id", name="uq_material_vendor"),
        UniqueConstraint("vendor_id", "mpn_code", name="uq_vendor_mpn_code"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    material_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("materials.id", ondelete="RESTRICT")
    )
    vendor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vendors.id", ondelete="RESTRICT")
    )
    mpn_code: Mapped[str] = mapped_column(String(80))
    specifications: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    certifications: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    is_hazardous: Mapped[bool] = mapped_column(Boolean, default=False)
    purchase_approved: Mapped[bool] = mapped_column(Boolean, default=True)
    is_preferred: Mapped[bool] = mapped_column(Boolean, default=False)
    moq: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal(1))
    lead_time_days: Mapped[int] = mapped_column(Integer, default=7)
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
