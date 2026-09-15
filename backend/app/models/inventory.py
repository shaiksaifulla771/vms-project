import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, DateTime, Enum, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedAtMixin, TimestampMixin
from app.models.enums import InventoryTxnType


class InventoryLot(Base, TimestampMixin):
    __tablename__ = "inventory_lots"
    __table_args__ = (
        CheckConstraint(
            "(material_id IS NOT NULL AND product_id IS NULL) OR "
            "(material_id IS NULL AND product_id IS NOT NULL)",
            name="chk_material_or_product",
        ),
        CheckConstraint("quantity_on_hand >= 0", name="chk_positive_qty"),
        UniqueConstraint("lot_number", "warehouse_id", name="uq_lot_in_warehouse"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    lot_number: Mapped[str] = mapped_column(String(100))
    material_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("materials.id", ondelete="RESTRICT"), nullable=True
    )
    product_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="RESTRICT"), nullable=True
    )
    location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id", ondelete="RESTRICT")
    )
    warehouse_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("warehouses.id", ondelete="RESTRICT")
    )
    mfg_date: Mapped[date] = mapped_column(Date)
    expiry_date: Mapped[date] = mapped_column(Date)
    quantity_on_hand: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal(0))
    uom: Mapped[str] = mapped_column(String(20), default="kg")
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user_profiles.id", ondelete="RESTRICT")
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user_profiles.id", ondelete="SET NULL"), nullable=True
    )


class InventoryTransaction(Base, CreatedAtMixin):
    """Append-only by DB grant (INSERT/UPDATE/DELETE revoked from
    `authenticated` — docs/schema.sql section 14/18). The only writer is
    internal.post_inventory_transaction(), called from
    InventoryLedgerService.post_transaction — never construct this model
    directly for an INSERT."""

    __tablename__ = "inventory_transactions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    lot_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inventory_lots.id", ondelete="RESTRICT")
    )
    transaction_type: Mapped[InventoryTxnType] = mapped_column(
        Enum(InventoryTxnType, name="inventory_txn_type", create_type=False)
    )
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    balance_after: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    reference_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    reason_notes: Mapped[str | None] = mapped_column(String, nullable=True)
    executed_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user_profiles.id", ondelete="RESTRICT")
    )
