import uuid
from decimal import Decimal

from sqlalchemy import Enum, ForeignKey, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedAtMixin, TimestampMixin
from app.models.enums import PlanStatus


class Plan(Base, TimestampMixin):
    """A Plan is a group header only — its per-(product, location) demand
    lines live in PlanProduct. Mirrors the source Plan Summary / Batch
    Summary / Material Summary report, which covers several products across
    several locations at once."""

    __tablename__ = "plans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    plan_number: Mapped[str] = mapped_column(String(30), unique=True)
    status: Mapped[PlanStatus] = mapped_column(
        Enum(PlanStatus, name="plan_status", create_type=False), default=PlanStatus.ACTIVE
    )
    idempotency_key: Mapped[str | None] = mapped_column(String(80), unique=True, nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user_profiles.id", ondelete="RESTRICT")
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user_profiles.id", ondelete="SET NULL"), nullable=True
    )


class PlanProduct(Base, CreatedAtMixin):
    __tablename__ = "plan_products"
    __table_args__ = (
        UniqueConstraint("plan_id", "product_id", "location_id", name="uq_plan_product_location"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    plan_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("plans.id", ondelete="CASCADE"))
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="RESTRICT")
    )
    location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id", ondelete="RESTRICT")
    )
    demand_target_qty: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    # Planner-supplied (not read off boms, which this domain never touches)
    # — see docs/schema.sql section 15's comment. Purely feeds
    # batches_required, a reporting figure only.
    batch_size_output: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    bom_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("boms.id", ondelete="RESTRICT"))
    batches_required: Mapped[int] = mapped_column(Integer)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user_profiles.id", ondelete="RESTRICT")
    )
