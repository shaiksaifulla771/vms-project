---
name: vms-development
description: Guide for developing and maintaining VMS architecture, visitor flows, appointments, workflow engine, email service, and MCP tools.
---

# VMS Development Skill

## Architecture Guidelines
- **Frontend**: React 18 + Vite 5 + TailwindCSS 3.4
- **Backend**: Express 4.19 + Node.js (CommonJS)
- **Database**: MongoDB + Mongoose 8.3
- **Event Bus**: Custom EventEmitter (`backend/events/eventBus.js`)
- **Audit System**: Append-only hash chained audit log (`AuditLog.js` & `auditService.js`)

## Principles
1. Never bypass authentication or RBAC guards.
2. Ensure all physical inventory or appointment status changes publish domain events.
3. Keep business logic strictly inside backend service classes, never inside React components.

## Production Planning & MRP Action Contract Checklist
1. **Zero Dead UI Buttons**:
   - Every action button in MRP and Production tables must have an active handler bound to an existing backend endpoint.
   - Live Inventory Check: `POST /api/production-plans/:id/material-check` (handles missing BOM ID fallback to active product BOM).
   - Pre-Release Validation: `POST /api/production-plans/:id/validate` (treats material shortages as warnings; transitions status to `VALIDATED`).
   - Shortage Procurement: 1-click generation creates `PurchaseRequirement` documents directly from `plan.materialStatus.shortages`.

2. **Validation vs. Approval Segregation**:
   - **Validation Phase (`validatePlanForRelease`)**: Verifies structural fields (Product, BOM, Warehouse, Quantity > 0). Shortages are non-fatal warnings with actionable next steps. Maker-Checker check is NOT enforced here.
   - **Approval Phase (`approvePlan`)**: Enforces Maker-Checker policy (`plan.createdBy !== approverId`) and user role permissions (`Production Manager` / `Admin`).

3. **Multi-Agent Simulation Testing**:
   - Automated testing agents/scripts (e.g., `backend/scripts/fullSystemAuditTest.js`) are used strictly for non-destructive verification, simulating 10–100 records across all lifecycle stages to ensure end-to-end functionality.
