"""AnalyticsService — read-only aggregates over real procurement data
(purchase_orders, purchase_order_receipts). No mock/demo figures; a
vendor with no issued POs or receipts simply reports NULL/0 metrics
rather than a placeholder."""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.analytics import VendorScorecardRow

_VENDOR_SCORECARD_SQL = text(
    """
    WITH po_agg AS (
        SELECT vendor_id,
               COUNT(*) AS total_pos,
               SUM(grand_total) AS total_spend
        FROM public.purchase_orders
        WHERE status IN ('ISSUED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED')
        GROUP BY vendor_id
    ),
    receipt_agg AS (
        SELECT po.vendor_id,
               AVG(CASE WHEN r.on_time THEN 1.0 ELSE 0.0 END) * 100 AS on_time_pct,
               AVG(CASE WHEN r.quality_ok THEN 1.0 ELSE 0.0 END) * 100 AS quality_pct,
               AVG(EXTRACT(EPOCH FROM (r.received_at - po.issued_at)) / 86400.0) AS avg_lead_time_days
        FROM public.purchase_order_receipts r
        JOIN public.purchase_orders po ON po.id = r.po_id
        WHERE po.issued_at IS NOT NULL
        GROUP BY po.vendor_id
    )
    SELECT
        v.id AS vendor_id,
        v.name AS vendor_name,
        COALESCE(po_agg.total_pos, 0) AS total_purchase_orders,
        COALESCE(po_agg.total_spend, 0) AS total_spend,
        receipt_agg.on_time_pct AS on_time_delivery_pct,
        receipt_agg.quality_pct AS quality_acceptance_pct,
        receipt_agg.avg_lead_time_days AS avg_lead_time_days
    FROM public.vendors v
    LEFT JOIN po_agg ON po_agg.vendor_id = v.id
    LEFT JOIN receipt_agg ON receipt_agg.vendor_id = v.id
    ORDER BY total_spend DESC NULLS LAST, v.name ASC
    """
)


class AnalyticsService:
    async def vendor_scorecard(self, session: AsyncSession) -> list[VendorScorecardRow]:
        result = await session.execute(_VENDOR_SCORECARD_SQL)
        return [VendorScorecardRow.model_validate(row) for row in result.mappings().all()]
