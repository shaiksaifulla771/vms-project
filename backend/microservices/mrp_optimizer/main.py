"""
MRP Optimization & Demand Forecasting Python Microservice.
Provides mathematical computation, netting, and time-series forecasting for VendorOS VMS.
"""
import sys
import os
import json
import importlib
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from typing import Dict, Any, List

try:
    from .models.schemas import (
        BOMComponent,
        MRPOptimizationRequest,
        MRPOptimizationResponse,
        DemandForecastRequest,
        DemandForecastResponse,
    )
    from .engine.mrp_solver import MRPSolver
    from .engine.demand_forecaster import DemandForecaster
except (ImportError, ValueError):
    from models.schemas import (
        BOMComponent,
        MRPOptimizationRequest,
        MRPOptimizationResponse,
        DemandForecastRequest,
        DemandForecastResponse,
    )
    from engine.mrp_solver import MRPSolver
    from engine.demand_forecaster import DemandForecaster


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    """Handle requests in separate threads for high concurrent throughput."""
    daemon_threads = True


class MRPServiceHandler(BaseHTTPRequestHandler):
    """
    High-performance REST API handler with CORS and JSON serialization.
    """

    def _send_json(self, status: int, payload: Dict[str, Any]):
        try:
            body = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def do_GET(self):
        if self.path in ("/health", "/api/health", "/"):
            self._send_json(200, {
                "status": "healthy",
                "service": "mrp-optimizer-python",
                "version": "1.0.0",
                "engine": "MRPSolver + DemandForecaster (Pure Python)"
            })
        else:
            self._send_json(404, {"error": "Not Found", "path": self.path})

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        raw_body = self.rfile.read(content_length).decode("utf-8") if content_length > 0 else "{}"
        
        try:
            data = json.loads(raw_body)
        except Exception as e:
            return self._send_json(400, {"error": f"Invalid JSON payload: {str(e)}"})

        # Route: /api/mrp/optimize
        if self.path in ("/api/mrp/optimize", "/optimize"):
            try:
                target_quantity = float(data.get("target_quantity", 1))
                required_date = str(data.get("required_date", ""))
                raw_components = data.get("components", [])

                components: List[BOMComponent] = []
                for c in raw_components:
                    components.append(BOMComponent(
                        material_id=str(c.get("material_id", "")),
                        material_code=str(c.get("material_code", "")),
                        material_name=str(c.get("material_name", "")),
                        qty_per_unit=float(c.get("qty_per_unit", 1.0)),
                        unit=str(c.get("unit", "pcs")),
                        make_or_buy=str(c.get("make_or_buy", "BUY")),
                        lead_time_days=int(c.get("lead_time_days", 7)),
                        safety_stock=float(c.get("safety_stock", 0.0)),
                        moq=float(c.get("moq", 1.0)),
                        lot_size=float(c.get("lot_size", 1.0)),
                        on_hand_inventory=float(c.get("on_hand_inventory", 0.0)),
                        reserved_inventory=float(c.get("reserved_inventory", 0.0)),
                        open_supply=float(c.get("open_supply", 0.0)),
                        eligible_supply=float(c.get("eligible_supply", 0.0)),
                        late_supply=float(c.get("late_supply", 0.0)),
                        requirement_date=str(c.get("requirement_date", "")),
                        level=int(c.get("level", 1)),
                        parent_material_id=str(c.get("parent_material_id", "")),
                    ))

                schedule = MRPSolver.solve(
                    target_quantity=target_quantity,
                    required_date=required_date,
                    components=components,
                )

                shortages = sum(1 for s in schedule if s.shortage_qty > 0)
                total_net = sum(s.net_required_qty for s in schedule)

                response_data = {
                    "success": True,
                    "product_id": data.get("product_id", ""),
                    "algorithm_version": data.get("algorithm_version", "MRP-2.1"),
                    "planning_rule_version": data.get("planning_rule_version", "RULESET-1.4"),
                    "total_components_evaluated": len(schedule),
                    "total_shortages": shortages,
                    "optimal_schedule": [s.model_dump() for s in schedule],
                    "summary": {
                        "totalComponents": len(schedule),
                        "totalShortages": shortages,
                        "totalNetQuantity": round(total_net, 4),
                        "hasShortage": shortages > 0,
                        "engineUsed": "Python-MRPSolver-Native",
                    }
                }
                self._send_json(200, response_data)
            except Exception as err:
                self._send_json(400, {"success": False, "error": str(err)})

        # Route: /api/mrp/forecast
        elif self.path in ("/api/mrp/forecast", "/forecast"):
            try:
                material_id = str(data.get("material_id", ""))
                historical = [float(x) for x in data.get("historical_consumption", [])]
                periods_ahead = int(data.get("periods_ahead", 6))
                alpha = float(data.get("alpha", 0.3))
                beta = float(data.get("beta", 0.1))

                forecasts = DemandForecaster.double_exponential_smoothing(
                    series=historical,
                    periods_ahead=periods_ahead,
                    alpha=alpha,
                    beta=beta,
                )

                safety_stock = DemandForecaster.calculate_recommended_safety_stock(series=historical)

                trend = "STABLE"
                if len(forecasts) >= 2:
                    trend = "UPWARD" if forecasts[-1] > forecasts[0] else ("DOWNWARD" if forecasts[-1] < forecasts[0] else "STABLE")

                response_data = {
                    "success": True,
                    "material_id": material_id,
                    "forecast_periods": forecasts,
                    "recommended_safety_stock": safety_stock,
                    "trend": trend,
                    "confidence_interval": {
                        "lower": [round(f * 0.85, 2) for f in forecasts],
                        "upper": [round(f * 1.15, 2) for f in forecasts],
                    }
                }
                self._send_json(200, response_data)
            except Exception as err:
                self._send_json(400, {"success": False, "error": str(err)})
        else:
            self._send_json(404, {"error": "Endpoint Not Found", "path": self.path})

    def log_message(self, format, *args):
        # Clean production logging
        pass


def self_check():
    """Ponytail: Self-contained assertion test for netting and forecasting."""
    comp = BOMComponent(
        material_id="1", material_code="M1", material_name="Steel",
        qty_per_unit=2.0, on_hand_inventory=10.0, reserved_inventory=0.0,
        moq=5.0, lot_size=5.0
    )
    res = MRPSolver.solve(target_quantity=10, required_date="2026-09-01", components=[comp])
    assert len(res) == 1, "Expected 1 component result"
    assert res[0].gross_required_qty == 20.0, "Gross requirement should be 20"
    assert res[0].net_required_qty == 10.0, "Net requirement should be 10"
    assert res[0].optimal_lot_qty == 10.0, "Optimal lot should be 10"

    forecast = DemandForecaster.double_exponential_smoothing([10.0, 12.0, 14.0, 16.0])
    assert len(forecast) == 6, "Expected 6 forecast periods"
    assert forecast[0] > 16.0, "Forecast should follow upward trend"
    print("[Python MRP Microservice] self_check passed: 0 errors.")


def run_server(port: int = 8001):
    server = ThreadedHTTPServer(("0.0.0.0", port), MRPServiceHandler)
    print(f"[Python MRP Microservice] Listening on http://0.0.0.0:{port}...")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[Python MRP Microservice] Shutting down cleanly.")
        server.shutdown()


if __name__ == "__main__":
    if "--test" in sys.argv:
        self_check()
    else:
        port = int(os.environ.get("PORT", 8001))
        run_server(port)
