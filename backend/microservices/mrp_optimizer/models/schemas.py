"""
Data models for MRP Optimization and Demand Forecasting.
Uses Python standard library dataclasses for zero-dependency portability and high performance.
"""
from dataclasses import dataclass, field, asdict
from typing import List, Optional, Dict, Any


@dataclass
class BOMComponent:
    material_id: str
    material_code: str
    material_name: str
    qty_per_unit: float
    unit: str = "pcs"
    make_or_buy: str = "BUY"
    lead_time_days: int = 7
    safety_stock: float = 0.0
    moq: float = 1.0
    lot_size: float = 1.0
    on_hand_inventory: float = 0.0
    reserved_inventory: float = 0.0
    open_supply: float = 0.0
    eligible_supply: float = 0.0
    late_supply: float = 0.0
    requirement_date: str = ""
    level: int = 1
    parent_material_id: str = ""

    def model_dump(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class MRPOptimizationRequest:
    product_id: str
    product_code: str
    product_name: str
    target_quantity: float
    required_date: str
    components: List[BOMComponent]
    horizon_days: int = 30
    holding_cost_rate: float = 0.02
    ordering_cost: float = 50.0
    algorithm_version: str = "MRP-2.1"
    planning_rule_version: str = "RULESET-1.4"

    def model_dump(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class NetRequirementResult:
    material_id: str
    material_code: str
    material_name: str
    gross_required_qty: float
    available_qty: float
    open_supply: float
    eligible_supply: float
    late_supply: float
    safety_stock: float
    net_required_qty: float
    shortage_qty: float
    optimal_lot_qty: float
    planned_order_release_date: str
    action: str
    shortage_reason: str
    recommended_order_batches: int
    level: int = 1
    parent_material_id: str = ""
    requirement_date: str = ""
    trace: Dict[str, Any] = field(default_factory=dict)

    def model_dump(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class MRPOptimizationResponse:
    success: bool
    product_id: str
    total_components_evaluated: int
    total_shortages: int
    optimal_schedule: List[NetRequirementResult]
    summary: Dict[str, Any]

    def model_dump(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class DemandForecastRequest:
    material_id: str
    historical_consumption: List[float]
    periods_ahead: int = 6
    alpha: float = 0.3
    beta: float = 0.1

    def model_dump(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class DemandForecastResponse:
    success: bool
    material_id: str
    forecast_periods: List[float]
    recommended_safety_stock: float
    trend: str
    confidence_interval: Dict[str, List[float]]

    def model_dump(self) -> Dict[str, Any]:
        return asdict(self)
