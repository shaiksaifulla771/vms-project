---
name: vendor-po-workflow-check
description: Use when implementing or modifying vendor onboarding, purchase-order approval, or invoice-matching logic. Validates the change against the platform's state-machine rules before code is written.
---

# Vendor / PO Workflow Change Check

**Target location:** rename this file to `SKILL.md` and place it at `.agents/skills/vendor-po-workflow-check/SKILL.md`.

Purchase orders, vendor onboarding, and invoice matching are state machines (see `project-rules.md` §5.2). Before writing or changing code in this area:

## Steps
1. Identify the full set of valid states for the entity being touched (e.g. PO: draft → submitted → approved → fulfilled → closed, plus cancelled from draft/submitted/approved).
2. Map every code path that can change status. If the change adds a new way to reach a state, confirm it's only reachable from a legal predecessor state.
3. Confirm every transition writes an audit log entry (who, when, old → new).
4. Check what the transition should do to related records:
   - Approval → reserve inventory / notify the vendor?
   - Cancellation → release reserved inventory correctly, accounting for partial fulfillment?
   - Invoice mismatch → block payment or just flag it?
5. Write or update a test that exercises the new transition end-to-end, not just the function in isolation.

## Red flags — stop and ask the user
- A transition that skips a required approval step "just for this case."
- Status set directly (`record.status = 'x'`) instead of through the state-machine function.
- No test covering the new transition.
