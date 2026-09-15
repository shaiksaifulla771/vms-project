import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CHAR,
    Boolean,
    Computed,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedAtMixin, TimestampMixin
from app.models.enums import PoStatus


class PurchaseOrder(Base, TimestampMixin):
    __tablename__ = "purchase_orders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    po_number: Mapped[str] = mapped_column(String(30), unique=True)
    pr_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("purchase_requests.id", ondelete="SET NULL"), nullable=True
    )
    vendor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vendors.id", ondelete="RESTRICT")
    )
    status: Mapped[PoStatus] = mapped_column(
        Enum(PoStatus, name="po_status", create_type=False), default=PoStatus.DRAFT
    )
    currency: Mapped[str] = mapped_column(CHAR(3), default="INR")
    subtotal: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal(0))
    tax_total: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal(0))
    grand_total: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal(0))
    expected_delivery_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    issued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    issued_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user_profiles.id", ondelete="SET NULL"), nullable=True
    )
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user_profiles.id", ondelete="SET NULL"), nullable=True
    )
    idempotency_key: Mapped[str | None] = mapped_column(String(80), unique=True, nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user_profiles.id", ondelete="RESTRICT")
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user_profiles.id", ondelete="SET NULL"), nullable=True
    )


class PurchaseOrderItem(Base):
    __tablename__ = "purchase_order_items"
    __table_args__ = (UniqueConstraint("po_id", "line_no", name="uq_po_line"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    po_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("purchase_orders.id", ondelete="CASCADE")
    )
    line_no: Mapped[int] = mapped_column(Integer)
    material_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("materials.id", ondelete="RESTRICT")
    )
    material_vendor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("material_vendors.id", ondelete="SET NULL"), nullable=True
    )
    quantity_ordered: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    quantity_received: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal(0))
    unit_price: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    tax_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal(0))
    # GENERATED ALWAYS AS (docs/schema.sql) — Computed(..., persisted=True)
    # tells SQLAlchemy this column is server-computed so it is never
    # included in INSERT/UPDATE; the expression here is documentation only,
    # the database's own definition is authoritative.
    line_total: Mapped[Decimal] = mapped_column(
        Numeric(18, 2),
        Computed("ROUND(quantity_ordered * unit_price * (1 + tax_percent / 100), 2)", persisted=True),
    )


class PurchaseOrderReceipt(Base, CreatedAtMixin):
    __tablename__ = "purchase_order_receipts"
    __table_args__ = (UniqueConstraint("po_item_id", "receipt_number", name="uq_po_item_receipt_number"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    po_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("purchase_orders.id", ondelete="RESTRICT")
    )
    po_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("purchase_order_items.id", ondelete="RESTRICT")
    )
    receipt_number: Mapped[str] = mapped_column(String(30))
    received_qty: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    on_time: Mapped[bool] = mapped_column(Boolean, default=True)
    quality_ok: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user_profiles.id", ondelete="RESTRICT")
    )
