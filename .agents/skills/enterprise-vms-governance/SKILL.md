---
name: enterprise-vms-governance
description: >-
  Enterprise workflow skill for Network & Sites master hierarchy, soft deactivation with impact preview, 3-level scope access control, append-only audit trail, and operational location enforcement.
---

# Enterprise Network, Sites & Access Governance Skill

This skill defines the architectural blueprint and operational runbook for managing enterprise multi-site hierarchies, soft deactivations, location-enforced operations, append-only audit logging, and 3-level access scope control.

---

## 1. Master Hierarchy Architecture

- **Hierarchy Structure**:
  - `NETWORK & SITES` → `Sites` → `Warehouses` → `Site ↔ Warehouse Assignment`.
- **Site Entity**:
  - Represents physical plants, distribution centers, or R&D facilities.
  - Model: [`Site.js`](file:///C:/Users/DELL/.gemini/antigravity/scratch/vms-project/backend/models/Site.js)
  - Key Fields: `code`, `name`, `type`, `status` (`Active` / `Inactive`), `deactivatedAt`, `deactivatedBy`, `deactivationReason`.
- **Warehouse Entity**:
  - Belongs to a single parent Site (`siteId`).
  - Model: [`Warehouse.js`](file:///C:/Users/DELL/.gemini/antigravity/scratch/vms-project/backend/models/Warehouse.js)
  - Key Fields: `code`, `name`, `type`, `siteId`, `status`, `deactivatedAt`, `deactivatedBy`, `deactivationReason`, `siteTransferHistory`.

---

## 2. Deactivation & Impact Preview Protocol

- **Soft Deactivation Rule**:
  - Hard deletion of sites/warehouses is strictly prohibited to maintain transactional audit integrity.
  - Entities transition between `Active` and `Inactive` states.
- **Deactivation Impact Preview**:
  - Before deactivating a location, perform an impact analysis calculating:
    1. Assigned active users
    2. Active inventory records
    3. Open operations / work orders
    4. Pending stock transfers
    5. Assigned planners
  - Require a mandatory reason (minimum 10 characters) prior to confirmation.
- **System Notice**:
  - Display an amber alert banner for inactive entities:
    `⚠ This warehouse is currently inactive. Operations and new transactions are disabled. Historical records remain available for reference.`

---

## 3. Backend Operational Location Enforcement

- **Middleware**: [`locationEnforcement.js`](file:///C:/Users/DELL/.gemini/antigravity/scratch/vms-project/backend/middleware/locationEnforcement.js)
- Intercepts all operational write endpoints (`/api/transfers`, `/api/inventory`, `/api/productions`, `/api/appointments`).
- Checks if referenced `siteId`, `warehouseId`, `fromWarehouseId`, or `toWarehouseId` is marked `status === 'Inactive'`.
- Returns `HTTP 403 Forbidden` if an operation targets an inactive location.

---

## 4. Append-Only Audit Trail Standard

- **Model**: [`AuditLog.js`](file:///C:/Users/DELL/.gemini/antigravity/scratch/vms-project/backend/models/AuditLog.js)
- **Immutability Enforcement**:
  - Pre-hooks on Mongoose schema throw errors on `deleteOne`, `deleteMany`, `updateOne`, `updateMany`, `findOneAndUpdate` to guarantee audit trail tamper-resistance.
- **Audit Actions**:
  - `DEACTIVATE`, `REACTIVATE`, `TRANSFER_SITE`, `ACCESS_CHANGE`, `ROLE_CHANGE`, `CREATE`, `UPDATE`.

---

## 5. 3-Level Access Scope Governance

- **Permission Blueprint**: `User` → `Role` → `Module & Location Scope (Site/Warehouse)`.
- **User Model Fields**: `siteIds: [{ type: ObjectId, ref: 'Site' }]`, `warehouseIds: [{ type: ObjectId, ref: 'Warehouse' }]`.
- Restricting users to specific sites/warehouses scopes their visibility and operational permissions across VMS, Inventory, and Production.

---

## 6. Verification & Verification Workflows

- Run Unit Tests: `npm run test:unit` in `backend` (9 passed, 33/33 tests).
- Run Vite Build: `npm run build` in `frontend` (2031 modules transformed).
- Seed Network & Audit Data: `node scripts/seed_network_audit.js`.
