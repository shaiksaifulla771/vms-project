---
name: vendor-po-workflow-check
command: /vendor-check
aliases:
  - /po-check
  - /po-workflow
  - /check-workflow
description: Use when implementing or modifying vendor onboarding, purchase-order approval, or invoice-matching logic. Validates the change against the platform's state-machine rules before code is written.
---

# Vendor / PO Workflow Change Check (`/vendor-check`)

## How to Trigger
Type **`/vendor-check`** (or `/po-check`, `/check-workflow`) followed by the specific module, file, or proposed workflow change you want to analyze.

### Examples:
- `/vendor-check`
- `/vendor-check backend/routes/purchaseOrderRoutes.js`
- `/po-check validate invoice 3-way matching logic`
- `/check-workflow vendor approval state transitions`

---

## State Machine Rules (§5.2)

Purchase orders, vendor onboarding, and invoice matching are finite state machines. Before writing or changing code in this area:

## Step-by-Step Validation Procedure
1. **Identify the Full Valid State Graph**:
   - **Purchase Orders:** `Draft` &rarr; `Submitted` &rarr; `Approved` &rarr; `Fulfilled` &rarr; `Closed` (or `Cancelled` from `Draft`/`Submitted`/`Approved`).
   - **Vendor Onboarding:** `Draft` &rarr; `Pending_KYC` &rarr; `Under_Review` &rarr; `Approved` (or `Rejected` / `Suspended`).
   - **Invoices:** `Received` &rarr; `3_Way_Matched` &rarr; `Approved` &rarr; `Paid` (or `Disputed` / `Rejected`).
2. **Map Status Transition Code Paths**:
   - Verify that every new way to reach a state is strictly reachable from a legal predecessor state.
3. **Audit Trail Logging**:
   - Confirm every transition writes an immutable audit log entry (`actorId`, `timestamp`, `oldStatus` &rarr; `newStatus`, `reason`).
4. **Side-Effect Reconciliation**:
   - **Approval:** Are component quantities properly reserved / supplier notified?
   - **Cancellation:** Is reserved inventory released correctly, accounting for partial receipts?
   - **Invoice Mismatch:** Is payment blocked and flagged for managerial review?
5. **End-to-End Regression Test Coverage**:
   - Exercise the new transition end-to-end with unit/integration tests (`tests/unit/`).

---

## Red Flags — Stop and Warn
- A transition that skips a required approval step "just for this case".
- Direct property mutation (e.g. `record.status = 'Approved'`) instead of calling the centralized state-machine service.
- Missing rollback/recovery logic on failed transactions.
- Zero test coverage for the new transition.
