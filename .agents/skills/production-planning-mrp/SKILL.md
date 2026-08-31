---
name: production-planning-mrp
description: Skill for Material Requirements Planning (MRP), production scheduling, capacity bottleneck detection, and work order dispatch.
---

# Production Planning & MRP Skill

## Overview
Equips AI agents to analyze supply chain lead times, compute net component deficits, sequence production orders, and optimize shop floor schedules.

## Capabilities & Tools
1. `mrp_net_requirement_run`: Calculates gross requirements minus on-hand and on-order stock.
2. `lead_time_offsetting`: Backward-schedules purchase and manufacturing start dates from due dates.
3. `capacity_bottleneck_detection`: Analyzes workstation loading vs available hours.
4. `production_order_sequencer`: Prioritizes work orders by customer priority and material availability.
5. `shortage_risk_alerting`: Predicts supply stockouts before production orders are dispatched.
6. `work_order_status_tracker`: Manages Draft > Scheduled > In-Progress > Completed state machine.
7. `shop_floor_dispatch_optimizer`: Groups batches of identical SKUs to reduce line changeover time.
8. `yield_variance_analysis`: Compares planned finished quantity vs actual produced quantity.
9. `auto_requisition_generator`: Generates purchase requisitions for MRP component shortages.
10. `reorder_cycle_simulation`: Simulates 30-day inventory trajectories based on scheduled plans.
