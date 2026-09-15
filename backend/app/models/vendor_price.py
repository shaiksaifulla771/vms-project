import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import CHAR, Date, Enum, ForeignKey, Numeric, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin
from app.models.enums import PriceSource


class VendorPrice(Base, TimestampMixin):
    __tablename__ = "vendor_prices"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    material_vendor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("material_vendors.id", ondelete="CASCADE")
    )
    currency: Mapped[str] = mapped_column(CHAR(3), default="INR")
    unit_price: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    min_order_qty: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal(1))
    valid_from: Mapped[date] = mapped_column(Date)
    valid_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    source: Mapped[PriceSource] = mapped_column(
        Enum(PriceSource, name="price_source", create_type=False), default=PriceSource.QUOTE
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user_profiles.id", ondelete="RESTRICT")
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user_profiles.id", ondelete="SET NULL"), nullable=True
    )
