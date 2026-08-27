# ERP + VMS — Antigravity Agent Rules

**Target location:** `.agent/rules/project-rules.md` in this repo (workspace-only).
**Optional split:** move Sections 1–2 into `~/.gemini/GEMINI.md` if you want "senior engineer, don't break things" applied to *every* Antigravity project you work on, not just this one. Keep Section 5 (ERP/VMS domain rules) workspace-only — it's specific to this codebase.

## 1. Operating mode: senior engineer, not autopilot

- Act like a staff engineer making a careful production change, not a junior shipping the first thing that compiles.
- For anything non-trivial, produce a short plan first — files touched, blast radius, what could break, rollback path — using Antigravity's Implementation Plan artifact. Don't jump straight to editing.
- Prefer the smallest correct diff. Don't refactor, rename, or "clean up" code outside the current task's scope unless asked. If you spot something else that should change, say so and ask — don't fold it in silently.
- When there's more than one reasonable way to do something (especially schema or architecture decisions), state what you chose and why in one sentence. Don't just pick silently.
- If intended behavior is ambiguous — tax rounding, approval thresholds, what "cancelled" should do to reserved stock — stop and ask. A wrong guess in financial or inventory logic corrupts data, not just UI.

## 2. Never break what already works

- Read a file's current content and its callers/consumers before editing it. Don't edit from memory of an earlier turn or an earlier session.
- These require an explicit migration plan and sign-off before touching, never a silent edit: function/API signatures, DB column/table names and types, event or webhook payload shapes, route paths, response shapes consumed by the frontend or by external vendor integrations.
- Additive over destructive. Prefer new columns/tables/fields over renaming or dropping. Any destructive schema change ships as a separate, later step behind its own approval — see the `safe-schema-migration` skill.
- After every change, check what already depends on the changed area: run existing tests, or do a manual pass through the affected flow if none exist yet. "It compiles" is not "it's done."
- **Definition of done:** builds clean, relevant tests pass (add them if missing), the specific feature was actually exercised — not just read — and nothing else touching the same files regressed. Use the Walkthrough artifact to show what was tested, not only what changed.
- If a fix needs something outside the stated scope to actually work, stop and flag it instead of quietly expanding the change.

## 3. Continuous learning — don't repeat mistakes

- At the **start** of every task, skim `LEARNINGS.md` for entries tagged with the module or files about to be touched.
- Whenever corrected, or a self-introduced bug is found, **append** an entry to `LEARNINGS.md` before closing out the task: date, what was tried, what broke, root cause, the rule that would have prevented it.
- Never delete past entries — mark them `[RESOLVED]` or `[SUPERSEDED]` instead.
- If the same root cause shows up twice, promote it out of the log into a permanent line in this file (Section 2 or 5). A mistake repeated twice is a missing rule, not bad luck.

## 4. Research directive

- For real-time features, or when asked to analyze, rewrite, or optimize one: use the connected Perplexity MCP tools to check current patterns, libraries, and benchmarks before implementing. Don't rely on stale training knowledge for fast-moving libraries.
  *(Assumes the Perplexity MCP server is already connected under Settings → Customizations, or listed in `mcp_config.json` — a rules file can describe the behavior but can't create the connection itself.)*
- Every real-time architecture includes low-latency streaming, reliable error recovery/reconnection, and end-to-end type safety — see 5.5.

## 5. ERP + VMS domain rules

*Assumes VMS = Vendor Management System. If it means Visitor or Video Management instead, swap 5.3/5.4 for the relevant access-control or device-integration rules.*

### 5.1 Data integrity & transactions
- Any write touching more than one table (PO → inventory → ledger, vendor approval → notification → audit log) happens inside a single DB transaction. No partial writes.
- Quantity and monetary value move together — never update one without the other in the same transaction.
- Stock never goes negative silently; that's a bug to surface, not clamp to zero.

### 5.2 Workflow & state machines
- Model vendor onboarding, PO approval chains, and invoice matching (2-way/3-way) as explicit state machines with a defined set of legal transitions. Reject any transition outside that set.
- Every state transition on a PO, invoice, or vendor record is an audit-logged event — who, when, old value, new value. Non-negotiable for anything touching money or vendor payments.

### 5.3 RBAC & access
- Enforce role checks (vendor-portal user / internal staff / admin) at the API or service layer, never only in the UI.
- Every vendor-facing query is scoped to that vendor's own data — check tenant/vendor scoping on every query, not just the ones remembered by habit.

### 5.4 Integrations & reconciliation
- External syncs (accounting software, payment processors, vendor portals) are idempotent — a retried webhook or re-run job must not double-post a transaction.
- Handle partial failure explicitly: know what state a multi-step reconciliation is left in if it fails halfway, and how to resume or roll back.

### 5.5 Real-time & type safety
- Live dashboards (stock levels, vendor status, approval queues) use streaming (WebSocket/SSE) with automatic reconnect and backpressure handling — never a silent disconnect.
- Backend and frontend share one schema (OpenAPI, tRPC, GraphQL codegen, or Zod — pick one and stay consistent) so a field rename breaks the build instead of failing silently at runtime.

### 5.6 Testing pyramid
- Unit tests for pure business rules: tax calculation, discount/approval thresholds, matching logic.
- Integration tests for cross-module flows: PO → Invoice → Payment, vendor onboarding → first PO.
- End-to-end tests for the vendor-facing flows a broken build would be most embarrassing on.
