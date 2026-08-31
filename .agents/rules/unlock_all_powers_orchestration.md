# Multi-Agent Collaborative Orchestration Protocol (`unlock all powers`)

This rule is activated when the user says **`unlock all powers`**, **`/unlock-all`**, or **`/all-powers`**.

It mandates a synchronized, multi-agent engineering workflow combining:
- **Perplexity MCP:** External intelligence, real-time benchmarks, live dependency checks, and API reference standards.
- **NVIDIA Nemotron 3 Ultra 550B:** Supply chain domain reasoning, finite state-machine constraint validation, and business logic auditing.
- **Gemini 3.7 Flash / Pro Guider:** Lead software architect, component structure, clean code standards, and consensus reviewer.
- **104+ Enterprise Skills Suite:** Master data, inventory, BOMs, MRP, procurement, QC, RBAC, and workflows.

---

## The 5-Phase Collaborative Workflow

```
[User Command: "unlock all powers <task>"]
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ Phase 1: Collaborative Multi-Agent Pre-Analysis         │
│ • Perplexity: Researches API patterns & best practices  │
│ • NVIDIA: Audits domain state-machine constraints       │
│ • Gemini Guider: Synthesizes modular system plan        │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│ Phase 2: Anticipated Gaps, Errors & Solutions Matrix    │
│ • Enumerates potential edge-case failures & race conds  │
│ • Pairs every risk with a concrete, robust solution     │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│ Phase 3: Mandatory User Approval Gate                   │
│ • Generates detailed implementation plan                │
│ • ⛔ STOPS AND WAITS FOR USER APPROVAL                  │
└────────────────────────────┬────────────────────────────┘
                             │ (User Approves)
                             ▼
┌─────────────────────────────────────────────────────────┐
│ Phase 4: Defect-Free Execution & Inline Review          │
│ • Implements code with zero breaking changes            │
│ • Ensures atomic error handling & type safety           │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│ Phase 5: Automated Verification & Walkthrough           │
│ • Executes unit & integration tests (`npm run test:unit`)│
│ • Validates production build (`npm run build`)           │
│ • Generates verified walkthrough artifact               │
└─────────────────────────────────────────────────────────┘
```

---

## Detailed Phase Requirements

### Phase 1: Multi-Agent Task Sharing & Research
- **Perplexity MCP:** Query relevant external docs, library specifications, and performance benchmarks.
- **NVIDIA Nemotron:** Trace database schema impacts, audit trail requirements, and Segregation of Duties constraints.
- **Gemini Guider:** Formulate an architectural strategy with explicit file boundaries.

### Phase 2: Mandatory Gaps & Expected Errors Matrix
Every plan must include a dedicated **"Gaps & Risk Mitigation Matrix"** formatted as:

| Potential Gap / Error | Where It Could Occur | Probability / Impact | Preventative Solution Implemented |
|:---|:---|:---|:---|
| *e.g., Concurrency conflict on stock balance* | `InventoryLedgerService.js` | Medium / High | Implemented OCC (Optimistic Concurrency Control) version check + atomic increment |
| *e.g., Orphaned foreign key on deactivation* | `User.js` / `PurchaseOrder.js` | High / High | Enforced soft-deactivation toggle; blocked hard deletion |
| *e.g., Unhandled async rejection in event bus* | `eventBus.js` | Low / Medium | Wrapped all event listeners in try/catch with logger & dead-letter queue |

### Phase 3: Strict Approval Gate
- Write the complete plan to `implementation_plan.md` with `RequestFeedback: true`.
- **STOP.** Do not make source code modifications until the user explicitly reviews and approves the plan.

### Phase 4: Execution Standards
- Code changes must adhere to zero-jargon, clean typography, and low-latency performance.
- All database mutations must maintain auditability and backward compatibility.

### Phase 5: Automated Verification
- Run test suites: `npm run test:unit`
- Run production build: `npm run build`
- Confirm server status and produce a detailed `walkthrough.md`.
