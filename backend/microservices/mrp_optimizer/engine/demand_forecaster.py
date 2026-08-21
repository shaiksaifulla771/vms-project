"""
Demand Forecasting Engine — Exponential Smoothing & Dynamic Safety Stock Calculation.
"""
import math
from typing import List, Dict


class DemandForecaster:
    @staticmethod
    def double_exponential_smoothing(
        series: List[float], periods_ahead: int = 6, alpha: float = 0.3, beta: float = 0.1
    ) -> List[float]:
        """
        Holt's linear exponential smoothing for level and trend.
        """
        if not series:
            return [0.0] * periods_ahead

        if len(series) == 1:
            return [round(series[0], 2)] * periods_ahead

        # Initialize level and trend
        level = series[0]
        trend = series[1] - series[0]

        for val in series[1:]:
            last_level = level
            level = alpha * val + (1 - alpha) * (level + trend)
            trend = beta * (level - last_level) + (1 - beta) * trend

        # Forecast future periods
        forecasts = []
        for m in range(1, periods_ahead + 1):
            pred = max(0.0, level + m * trend)
            forecasts.append(round(pred, 2))

        return forecasts

    @staticmethod
    def calculate_recommended_safety_stock(series: List[float], lead_time_days: int = 7) -> float:
        """
        Calculates buffer using standard deviation of demand * Z (95% service level = 1.65) * sqrt(L).
        """
        if len(series) < 2:
            return round((series[0] if series else 0) * 0.2, 2)

        mean = sum(series) / len(series)
        variance = sum((x - mean) ** 2 for x in series) / (len(series) - 1)
        std_dev = math.sqrt(variance)

        # Service level factor Z = 1.65 (95% in-stock probability)
        z_factor = 1.65
        lead_time_factor = math.sqrt(max(1.0, lead_time_days / 7.0))

        safety_stock = z_factor * std_dev * lead_time_factor
        return round(safety_stock, 2)
