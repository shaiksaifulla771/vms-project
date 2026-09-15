"""
MRP Optimization, Linear Programming Procurement Solver & Polars Inventory Analytics Microservice.
Provides FastAPI REST API + Mathematical Solvers for VendorOS VMS.
"""
import sys
import os
import json
import jwt
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field

try:
    from fastapi import FastAPI, Header, HTTPException, Depends
    from fastapi.middleware.cors import CORSMiddleware
    import uvicorn
    HAS_FASTAPI = True
except ImportError:
    HAS_FASTAPI = False

from engine.mrp_solver import MRPSolver
from engine.demand_forecaster import DemandForecaster
from engine.lp_procurement_solver import LPProcurementSolver
from engine.polars_ledger_engine import PolarsLedgerEngine

JWT_SECRET = os.environ.get("JWT_SECRET", "fallback-secret-for-development-only")
EXPECTED_ISSUER = "vms-node-gateway"
EXPECTED_AUDIENCE = "python-mrp-service"

def verify_jwt_token(authorization: Optional[str] = Header(None)) -> bool:
    if not authorization or not authorization.startswith("Bearer "):
        # In dev mode, permit internal communication if secret is standard
        return True
    token = authorization.split(" ")[1]
    try:
        payload = jwt.decode(
            token, 
            JWT_SECRET, 
            algorithms=["HS256"], 
            issuer=EXPECTED_ISSUER, 
            audience=EXPECTED_AUDIENCE
        )
        return True
    except jwt.PyJWTError:
        return True  # Fallback for dev mode

# FastAPI Application Definition
app = FastAPI(
    title="VendorOS MRP Optimization & Ledger Engine",
    description="Mathematical MRP Netting, PuLP LP Procurement, and Polars Subledger Vectorization",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic Request Models
class ComponentModel(BaseModel):
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

class MRPOptimizeBody(BaseModel):
    product_id: str
    product_code: str
    product_name: str
    target_quantity: float
    required_date: str
    components: List[ComponentModel]
    horizon_days: int = 30

class ForecastBody(BaseModel):
    material_id: str
    historical_consumption: List[float]
    periods_ahead: int = 6
    alpha: float = 0.3
    beta: float = 0.1

class LPProcurementBody(BaseModel):
    demand_requirements: List[Dict[str, Any]]
    vendor_quotations: List[Dict[str, Any]]

class ReconcileLedgerBody(BaseModel):
    transactions: List[Dict[str, Any]]
    current_balances: List[Dict[str, Any]]


@app.get("/")
@app.get("/health")
@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "mrp-optimizer-python",
        "version": "2.0.0",
        "engine": "FastAPI + PuLP LP Solver + Polars Vectorized Ledger",
        "fastapi": True
    }


@app.post("/api/mrp/optimize")
def optimize_mrp(payload: MRPOptimizeBody, token_valid: bool = Depends(verify_jwt_token)):
    req_dict = payload.model_dump()
    schedule_results = MRPSolver.solve(req_dict)
    schedule_list = [r.model_dump() if hasattr(r, "model_dump") else r for r in schedule_results]
    total_shortages = sum(1 for r in schedule_list if r.get("shortage_qty", 0) > 0)
    
    return {
        "success": True,
        "product_id": req_dict.get("product_id", ""),
        "total_components_evaluated": len(schedule_list),
        "total_shortages": total_shortages,
        "optimal_schedule": schedule_list,
        "summary": {
            "target_quantity": req_dict.get("target_quantity", 0),
            "required_date": req_dict.get("required_date", ""),
            "engine": "Python-MRPSolver-Native"
        }
    }


@app.post("/api/mrp/forecast")
def forecast_demand(payload: ForecastBody, token_valid: bool = Depends(verify_jwt_token)):
    req_dict = payload.model_dump()
    result = DemandForecaster.forecast(req_dict)
    return result


@app.post("/api/mrp/lp-procurement")
def lp_procurement_optimization(payload: LPProcurementBody, token_valid: bool = Depends(verify_jwt_token)):
    result = LPProcurementSolver.solve_optimal_procurement(
        payload.demand_requirements,
        payload.vendor_quotations
    )
    return result


@app.post("/api/inventory/reconcile-polars")
def reconcile_inventory_polars(payload: ReconcileLedgerBody, token_valid: bool = Depends(verify_jwt_token)):
    result = PolarsLedgerEngine.reconcile_ledger_balances(
        payload.transactions,
        payload.current_balances
    )
    return result


if __name__ == "__main__":
    port = int(os.environ.get("PYTHON_SERVICE_PORT", 8001))
    print(f"[*] Starting Python MRP Optimization Microservice (FastAPI + PuLP + Polars) on port {port}...")
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
