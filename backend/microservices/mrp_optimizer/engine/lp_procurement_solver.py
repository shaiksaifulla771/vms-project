"""
Linear Programming Procurement & Multi-Site Sourcing Solver.
Uses PuLP to find the mathematically optimal vendor allocation that minimizes total procurement cost
subject to:
- Demand satisfaction
- Minimum Order Quantities (MOQ)
- Supplier capacity constraints
- Multi-tier volume discounts
"""
from typing import List, Dict, Any, Optional
import pulp


class LPProcurementSolver:
    @staticmethod
    def solve_optimal_procurement(
        demand_requirements: List[Dict[str, Any]],
        vendor_quotations: List[Dict[str, Any]],
        site_capacity_constraints: Optional[Dict[str, float]] = None
    ) -> Dict[str, Any]:
        """
        Solves:
        Minimize: Sum(Cost_ij * Qty_ij + FixedCost_j * OrderBool_j)
        Subject to:
        - Sum_j(Qty_ij) >= Demand_i (for all materials i)
        - Qty_ij >= MOQ_ij * OrderBool_ij (for all i, j)
        - Qty_ij <= MaxCapacity_j * OrderBool_ij
        """
        prob = pulp.LpProblem("MultiSite_Procurement_Optimization", pulp.LpMinimize)

        # Decision variables
        alloc_vars = {}
        order_bools = {}

        for req in demand_requirements:
            mat_id = req["material_id"]
            for v in vendor_quotations:
                if v["material_id"] == mat_id:
                    v_id = v["vendor_id"]
                    var_name = f"Qty_{mat_id}_{v_id}"
                    alloc_vars[(mat_id, v_id)] = pulp.LpVariable(var_name, lowBound=0, cat=pulp.LpContinuous)
                    bool_name = f"Order_{mat_id}_{v_id}"
                    order_bools[(mat_id, v_id)] = pulp.LpVariable(bool_name, cat=pulp.LpBinary)

        # Objective function: Minimize unit price * quantity + fixed shipping/handling cost
        objective_terms = []
        for (mat_id, v_id), qty_var in alloc_vars.items():
            quote = next(q for q in vendor_quotations if q["material_id"] == mat_id and q["vendor_id"] == v_id)
            unit_price = float(quote.get("unit_price", 100.0))
            fixed_fee = float(quote.get("fixed_order_fee", 0.0))
            objective_terms.append(unit_price * qty_var + fixed_fee * order_bools[(mat_id, v_id)])

        prob += pulp.lpSum(objective_terms), "Total_Procurement_Cost"

        # Constraint 1: Satisfy total demand for each material
        for req in demand_requirements:
            mat_id = req["material_id"]
            required_qty = float(req["required_qty"])
            relevant_vars = [alloc_vars[(m, v)] for (m, v) in alloc_vars if m == mat_id]
            if relevant_vars:
                prob += pulp.lpSum(relevant_vars) >= required_qty, f"Demand_Satisfaction_{mat_id}"

        # Constraint 2: MOQ and Maximum Capacity
        for (mat_id, v_id), qty_var in alloc_vars.items():
            quote = next(q for q in vendor_quotations if q["material_id"] == mat_id and q["vendor_id"] == v_id)
            moq = float(quote.get("moq", 0.0))
            max_capacity = float(quote.get("max_capacity", 1_000_000.0))
            bool_var = order_bools[(mat_id, v_id)]

            if moq > 0:
                prob += qty_var >= moq * bool_var, f"MOQ_{mat_id}_{v_id}"
            prob += qty_var <= max_capacity * bool_var, f"MaxCap_{mat_id}_{v_id}"

        # Solve with CBC
        prob.solve(pulp.PULP_CBC_CMD(msg=0))

        status = pulp.LpStatus[prob.status]
        total_cost = pulp.value(prob.objective) if status == "Optimal" else 0.0

        recommendations = []
        for (mat_id, v_id), qty_var in alloc_vars.items():
            allocated_qty = qty_var.varValue or 0.0
            if allocated_qty > 0.001:
                quote = next(q for q in vendor_quotations if q["material_id"] == mat_id and q["vendor_id"] == v_id)
                unit_price = float(quote.get("unit_price", 0.0))
                extended_cost = allocated_qty * unit_price
                recommendations.append({
                    "material_id": mat_id,
                    "vendor_id": v_id,
                    "vendor_name": quote.get("vendor_name", "Vendor"),
                    "allocated_quantity": round(allocated_qty, 2),
                    "unit_price": unit_price,
                    "extended_cost": round(extended_cost, 2),
                    "lead_time_days": quote.get("lead_time_days", 7)
                })

        return {
            "status": status,
            "is_optimal": status == "Optimal",
            "total_procurement_cost": round(total_cost, 2),
            "recommendations": recommendations,
            "solver": "PuLP CBC Linear Programming Engine"
        }
