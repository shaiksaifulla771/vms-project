---
name: security-rbac-governance
description: Skill for Role-Based Access Control (RBAC), 3-level site & warehouse scoping, Segregation of Duties (SoD), and immutable audit trails.
---

# Security & RBAC Governance Skill

## Overview
Equips AI agents to validate access permissions, enforce 3-level facility scoping (Global > Site > Warehouse), detect Segregation of Duties conflicts, and maintain tamper-proof audit trails.

## Capabilities & Tools
1. `rbac_permission_validator`: Verifies user roles against endpoint authorization matrix.
2. `location_scope_resolver`: Restricts query records to user's assigned sites and warehouses.
3. `sod_conflict_detector`: Flags toxic role combinations (e.g. creating PO + approving payment).
4. `self_protection_guard`: Prevents users from deleting or demoting their own accounts.
5. `last_admin_protection`: Enforces minimum threshold of active administrative accounts.
6. `soft_deactivation_enforcer`: Intercepts hard deletes and converts them to reversible archive states.
7. `immutable_audit_logger`: Records user ID, IP, timestamp, module, and state diff for every action.
8. `token_session_invalidator`: Revokes active JWT and Redis sessions upon password change or deactivation.
9. `password_policy_enforcer`: Validates entropy, expiry, and history reuse constraints.
10. `compliance_audit_exporter`: Formats tamper-evident logs for ISO/SOC2 enterprise audits.
