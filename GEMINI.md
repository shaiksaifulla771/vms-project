# Project Instructions: Perplexity-Augmented Engineering

- When prompted to analyze, rewrite, optimize, or build real-time features, actively use the configured Perplexity MCP tools to research the latest patterns, libraries, and benchmarks.
- Ensure all real-time architectures include low-latency streaming, reliable error-recovery, and full end-to-end type safety.

# Custom Slash Commands & Workflow Triggers

- **`unlock all powers`** (or `/unlock-all`, `/all-powers`):
  - **Trigger:** Activates the Full Multi-Agent Orchestration Protocol (`.agents/rules/unlock_all_powers_orchestration.md`).
  - **Collaborative Agent Engine:** Combines **Perplexity MCP** (real-time research), **NVIDIA Nemotron 3 Ultra 550B** (domain & state-machine reasoning), and **Gemini 3.7 Flash / Pro Guider** (architectural synthesis & rigorous code review).
  - **Mandatory Protocol:**
    1. **Pre-Analysis & Research:** Perplexity + NVIDIA + Gemini collaborate to analyze requirements.
    2. **Anticipated Gaps & Errors Matrix:** Explicitly list potential errors, edge cases, concurrency risks, and their exact solutions before writing code.
    3. **Mandatory Approval Gate:** Generate an implementation plan and stop for explicit user approval before modifying code.
    4. **Defect-Free Execution:** Apply precision code changes with progressive verification.
    5. **Automated Verification:** Execute unit tests, production build verification, and diagnostic health checks.

- **`/vendor-check`** or **`/po-check`** (Aliases: `/po-workflow`, `/check-workflow`):
  - **Trigger:** Activates the `vendor-po-workflow-check` skill (`.agents/skills/vendor-po-workflow-check/SKILL.md`).
  - **Action:** Analyzes and validates the vendor onboarding, purchase order approval, goods receipt, or invoice matching state machines against:
    1. Full legal state transitions (e.g. `Draft > Submitted > Approved > Fulfilled > Closed / Cancelled`).
    2. Audit trail logging (actor, timestamp, old state &rarr; new state diff).
    3. Inventory reservation / release side-effects.
    4. 3-way invoice matching constraints.
    5. Test coverage for the transition.

