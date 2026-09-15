---
name: procurement-purchasing
description: Skill for automated purchase orders, 3-way invoice matching, supplier lead-time analysis, and procurement compliance.
---

# Procurement & Purchasing Skill

## Overview
Equips AI agents to generate purchase orders, evaluate supplier quotes, enforce approval hierarchies, and perform 3-way matching between PO, GRN, and invoices.

## Capabilities & Tools
1. `generate_purchase_order`: Creates standardized PO documents with MPN line items and tax calculations.
2. `three_way_matching`: Validates PO quantities and rates against Goods Receipt Notes (GRN) and Invoices.
3. `supplier_price_comparison`: Compares RFQ bids across multiple approved vendors.
4. `po_approval_matrix`: Routes purchase orders for authorization based on financial threshold limits.
5. `lead_time_performance_eval`: Tracks supplier on-time delivery percentages against SLAs.
6. `gstin_e_way_bill_validator`: Verifies tax registration numbers and transportation compliance.
7. `payment_terms_scheduler`: Computes net-30, net-60, and advance milestone payment dates.
8. `minimum_order_qty_checker`: Validates PO quantities meet vendor MOQ constraints.
9. `grn_creation_workflow`: Records incoming goods inspection and updates warehouse on-hand stock.
10. `purchase_spend_analytics`: Aggregates spend by material category, vendor, and facility.
