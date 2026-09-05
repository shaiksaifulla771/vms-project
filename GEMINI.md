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

- **`agent go`** (Aliases: `/agent-go`, `agents go`, `agent go <task>`):
  - **Trigger:** Activates the 4-Agent Synchronized Execution Protocol (`.agents/rules/agent_go_orchestration.md`).
  - **Collaborative 4-Agent Engine:** Fires all 4 installed plugin agents simultaneously:
    1. **`code-reviewer`**: Audits correctness, design patterns, clean code, and module boundaries.
    2. **`security-auditor`**: Scans for OWASP vulnerabilities, authorization leaks, injection vectors, and sensitive data exposure.
    3. **`test-engineer`**: Identifies test coverage gaps, edge cases, and designs rigorous test suites.
    4. **`web-performance-auditor`**: Detects rendering bottlenecks, CWV degradation, network waterfalls, and bundle bloat.
  - **Result:** Delivers a consolidated multi-agent executive scorecard, prioritized severity matrix (Critical, High, Medium, Low), and unified actionable patch plan.

