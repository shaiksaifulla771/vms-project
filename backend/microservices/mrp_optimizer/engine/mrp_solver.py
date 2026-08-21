"""
MRP Optimization Engine — Solves netting, lot-sizing, backward scheduling, and transparent calculation breakdowns.
"""
import math
from datetime import datetime, timedelta
from typing import List, Tuple, Dict, Any

try:
    from ..models.schemas import BOMComponent, NetRequirementResult
except (ImportError, ValueError):
    from models.schemas import BOMComponent, NetRequirementResult


class MRPSolver:
    @staticmethod
    def calculate_optimal_lot(net_qty: float, moq: float, lot_size: float) -> Tuple[float, int]:
        """
        Applies Minimum Order Quantity (MOQ) and Discrete Batch/Lot Multiples.
        Base Quantity = max(net_qty, moq)
        Optimal Quantity = ceil(Base Quantity / lot_size) * lot_size
        """
        if net_qty <= 0:
            return 0.0, 0

        target = max(net_qty, moq if moq > 0 else 0.0)
        lot = lot_size if lot_size > 0 else 1.0
        
        batches = math.ceil(target / lot)
        optimal_qty = batches * lot
        return round(optimal_qty, 4), batches

    @staticmethod
    def calculate_release_date(required_date_str: str, lead_time_days: int) -> str:
        """
        Backward-schedules from required completion date minus lead time.
        """
        try:
            req_date = datetime.fromisoformat(required_date_str.replace("Z", "+00:00"))
        except Exception:
            try:
                req_date = datetime.strptime(required_date_str[:10], "%Y-%m-%d")
            except Exception:
                req_date = datetime.utcnow()

        release_date = req_date - timedelta(days=max(0, int(lead_time_days)))
        return release_date.strftime("%Y-%m-%d")

    @classmethod
    def solve(
        cls,
        target_quantity: float,
        required_date: str,
        components: List[BOMComponent],
    ) -> List[NetRequirementResult]:
        results: List[NetRequirementResult] = []

        for comp in components:
            # 1. Demand & BOM quantities
            demand_qty = float(target_quantity)
            bom_qty = float(comp.qty_per_unit)
            scrap_factor = max(0.0, float(getattr(comp, 'scrap_factor', 0.0) or 0.0))
            gross_required = round(bom_qty * demand_qty * (1.0 + scrap_factor), 4)

            # 2. Current Stock, Reserved Stock, Available Stock
            current_stock = max(0.0, round(float(comp.on_hand_inventory), 4))
            reserved_stock = max(0.0, round(float(comp.reserved_inventory), 4))
            available_qty = max(0.0, round(current_stock - reserved_stock, 4))
            
            # 3. Safety Stock & Usable Available Stock (Safety stock is untouchable buffer)
            safety_stock = max(0.0, round(float(comp.safety_stock), 4))
            usable_available_stock = max(0.0, round(available_qty - safety_stock, 4))

            # 4. Incoming Supply & Production Coverage
            total_open_supply = max(0.0, round(float(comp.open_supply), 4))
            eligible_supply = max(0.0, round(float(comp.eligible_supply if comp.eligible_supply > 0 or comp.late_supply > 0 else total_open_supply), 4))
            late_supply = max(0.0, round(float(comp.late_supply), 4))
            is_make = str(comp.make_or_buy).upper() == "MAKE"

            incoming_supply = 0.0 if is_make else eligible_supply
            existing_prod_coverage = eligible_supply if is_make else 0.0

            # 5. Net Available & Net Requirement (16-Field Transparency)
            net_available = round(usable_available_stock + incoming_supply + existing_prod_coverage, 4)
            net_required = max(0.0, round(gross_required - net_available, 4))

            # 6. Shortage & Surplus (Ceil-rounded for fractional shortages to avoid under-ordering)
            shortage_qty = net_required if net_required > 0 else 0.0
            surplus_qty = round(net_available - gross_required, 4) if net_available > gross_required else 0.0

            # 7. Unit Cost & Financial Required Cost
            unit_cost = float(getattr(comp, 'unit_cost', 0.0) or getattr(comp, 'unitCost', 0.0) or 0.0)
            required_cost = round(shortage_qty * unit_cost, 2)

            # 8. Optimal Lot Sizing (Wagner-Whitin / Lot-sizing rule)
            optimal_lot = 0.0
            batches = 0
            if net_required > 0:
                target = max(net_required, comp.moq if comp.moq > 0 else 0.0)
                lot = comp.lot_size if comp.lot_size > 0 else 1.0
                batches = math.ceil(target / lot)
                optimal_lot = round(batches * lot, 4)

            # 9. Backward scheduling
            release_date = cls.calculate_release_date(
                comp.requirement_date or required_date,
                comp.lead_time_days
            )

            # 10. Reason Code Classification
            shortage_reason = "SUFFICIENT"
            if shortage_qty > 0:
                if current_stock == 0 and total_open_supply == 0:
                    shortage_reason = "STOCKOUT"
                elif late_supply > 0 and (available_qty + total_open_supply) >= gross_required:
                    shortage_reason = "LATE_SUPPLY"
                else:
                    shortage_reason = "INSUFFICIENT_STOCK"
            elif safety_stock > 0 and available_qty < safety_stock:
                shortage_reason = "SAFETY_STOCK_REPLENISHMENT"
            elif optimal_lot > net_required and net_required > 0:
                shortage_reason = "MOQ_EFFECT"

            # 11. Action mapping
            action = "Sufficient"
            if shortage_qty > 0 or net_required > 0:
                action = "Produce" if is_make else "Procure"

            # 12. Trace calculation chain
            calc_trace = {
                "demandQty": demand_qty,
                "bomQty": bom_qty,
                "grossRequirement": gross_required,
                "currentStock": current_stock,
                "reservedStock": reserved_stock,
                "availableStock": available_qty,
                "safetyStock": safety_stock,
                "usableAvailableStock": usable_available_stock,
                "incomingSupply": incoming_supply,
                "existingProductionCoverage": existing_prod_coverage,
                "netAvailable": net_available,
                "netRequirement": net_required,
                "shortage": shortage_qty,
                "surplus": surplus_qty,
                "unitCost": unit_cost,
                "requiredCost": required_cost,
                "shortageReason": shortage_reason,
            }

            res = NetRequirementResult(
                material_id=comp.material_id,
                material_code=comp.material_code,
                material_name=comp.material_name,
                gross_required_qty=gross_required,
                available_qty=available_qty,
                open_supply=total_open_supply,
                eligible_supply=eligible_supply,
                late_supply=late_supply,
                safety_stock=safety_stock,
                net_required_qty=net_required,
                shortage_qty=shortage_qty,
                optimal_lot_qty=optimal_lot,
                planned_order_release_date=release_date,
                action=action,
                shortage_reason=shortage_reason,
                recommended_order_batches=batches,
                level=comp.level,
                parent_material_id=comp.parent_material_id,
                requirement_date=comp_req_date,
                trace=calc_trace,
            )
            results.append(res)

        return results
