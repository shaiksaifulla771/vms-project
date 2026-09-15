import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, Enum, ForeignKey, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedAtMixin, TimestampMixin
from app.models.enums import BatchStatus


class BatchRecord(Base, TimestampMixin):
    __tablename__ = "batch_records"
    __table_args__ = (
        CheckConstraint(
            "(status = 'COMPLETED' AND actual_output_qty IS NOT NULL) OR "
            "(status != 'COMPLETED' AND actual_output_qty IS NULL)",
            name="chk_completed_has_actual_output",
        ),
        CheckConstraint("expiry_date > mfg_date", name="chk_expiry_after_mfg"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    batch_number: Mapped[str] = mapped_column(String(30), unique=True)
    # Nullable: ad-hoc (off-plan) batches are supported, validated
    # identically to plan-linked ones — no reduced-validation path.
    plan_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("plans.id", ondelete="SET NULL"), nullable=True
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="RESTRICT")
    )
    location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id", ondelete="RESTRICT")
    )
    warehouse_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("warehouses.id", ondelete="RESTRICT")
    )
    planned_output_qty: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    actual_output_qty: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    output_variance_qty: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    output_variance_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    output_variance_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    mfg_date: Mapped[date] = mapped_column(Date)
    expiry_date: Mapped[date] = mapped_column(Date)
    status: Mapped[BatchStatus] = mapped_column(
        Enum(BatchStatus, name="batch_status", create_type=False), default=BatchStatus.SCHEDULED
    )
    # Free-text operator name/badge (unverified) — distinct from created_by,
    # the actual authenticated actor and real audit-trail column.
    executed_by: Mapped[str] = mapped_column(String(100))
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user_profiles.id", ondelete="RESTRICT")
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user_profiles.id", ondelete="SET NULL"), nullable=True
    )


class BatchActualInput(Base, TimestampMixin):
    """One row per (batch, material) — the aggregate planned/actual/variance
    for that BOM line. The specific lot(s) drawn on live in
    BatchActualInputLot: a material line's consumption may be satisfied by
    splitting across several FEFO-ordered lots, not just one."""

    __tablename__ = "batch_actual_inputs"
    __table_args__ = (UniqueConstraint("batch_record_id", "material_id", name="uq_batch_input_per_material"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    batch_record_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("batch_records.id", ondelete="CASCADE")
    )
    material_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("materials.id", ondelete="RESTRICT")
    )
    bom_percentage: Mapped[Decimal] = mapped_column(Numeric(6, 3))
    planned_input_qty: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    actual_input_qty: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    variance_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    variance_reason: Mapped[str | None] = mapped_column(Text, nullable=True)


class BatchActualInputLot(Base, CreatedAtMixin):
    """Per-lot breakdown of one BatchActualInput's consumption — one row per
    distinct lot actually drawn from."""

    __tablename__ = "batch_actual_input_lots"
    __table_args__ = (
        UniqueConstraint("batch_actual_input_id", "consumed_lot_id", name="uq_batch_input_lot"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    batch_actual_input_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("batch_actual_inputs.id", ondelete="CASCADE")
    )
    consumed_lot_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inventory_lots.id", ondelete="RESTRICT")
    )
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4))
