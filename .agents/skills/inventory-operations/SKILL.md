---
name: inventory-operations
description: Skill for real-time stock ledger, double-entry adjustments, inter-warehouse transfers, lot/batch tracking, and inventory valuation.
---

# Inventory Operations & Stock Control Skill

## Overview
Equips AI agents to analyze stock levels, verify safety stock buffers, execute inter-plant transfers, and reconcile cycle count variances with immutable audit logging.

## Capabilities & Tools
1. `calculate_available_stock`: Formula: `onHand - reservedBalance`.
2. `reorder_point_monitor`: Detects items below reorder threshold and flags purchase triggers.
3. `safety_stock_optimization`: Computes dynamic buffer stock using lead-time variability.
4. `inter_warehouse_transfer`: Manages dispatch, transit, and receipt status state machines.
5. `stock_adjustment_validation`: Guards against negative stock and over-withdrawal deficits.
6. `fifo_batch_allocator`: Selects oldest unexpired batches for production consumption.
7. `cycle_count_discrepancy`: Computes physical count variance and drafts adjustment ledger entries.
8. `inventory_valuation_calculator`: Multiplies available balance by standard or purchase cost.
9. `expiry_date_tracker`: Alerts on perishable raw materials approaching threshold dates.
10. `warehouse_capacity_utilization`: Analyzes bin and zone utilization percentages.
