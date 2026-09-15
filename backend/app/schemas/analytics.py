import uuid
from decimal import Decimal

from app.schemas.common import ORMModel


class VendorScorecardRow(ORMModel):
    vendor_id: uuid.UUID
    vendor_name: str
    total_purchase_orders: int
    total_spend: Decimal
    on_time_delivery_pct: Decimal | None
    quality_acceptance_pct: Decimal | None
    avg_lead_time_days: Decimal | None
