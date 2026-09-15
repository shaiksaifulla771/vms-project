from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class CreatedAtMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.timezone("utc", func.now())
    )


class TimestampMixin(CreatedAtMixin):
    """There is no BEFORE UPDATE trigger for `updated_at` — every service
    layer UPDATE on one of these tables must set
    `updated_at = func.timezone('utc', func.now())` explicitly."""

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.timezone("utc", func.now())
    )
