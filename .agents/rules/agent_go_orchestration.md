# 4-Agent Synchronized Execution Protocol (`agent go`)

This protocol is activated whenever the user says **`agent go`**, **`/agent-go`**, **`agents go`**, or **`agent go <task / files>`**.

It orchestrates all 4 specialized plugin agents simultaneously across their respective technical pillars to evaluate, harden, and execute on the user's codebase or prompt.

---

## The 4 Agents Activated Concurrently

When `agent go` is issued, the orchestrator triggers the following 4 agents in parallel:

| Agent | Core Specialization | Focus & Boundaries |
|:---|:---|:---|
| **`code-reviewer`** | Senior Staff Code Review | Correctness, readability, architecture, design patterns, module boundaries, error handling, clean abstractions. |
| **`security-auditor`** | Security & Hardening | OWASP Top 10, injection vectors, authentication & authorization (RBAC), sensitive data leaks, input sanitization, STRIDE threat model. |
| **`test-engineer`** | QA Strategy & Test Coverage | Unit/integration/E2E coverage gaps, test suite design, boundary & edge case tests, test independence, Prove-It regression tests. |
| **`web-performance-auditor`** | Web Performance & CWV | Core Web Vitals (LCP, INP, CLS), render loops, re-render cascading, React state colocation, bundle overhead, async query waterfalls. |

---

## Orchestration Workflow

```
               [User Command: "agent go <target / task>"]
                                   │
                                   ▼
      ┌─────────────────────────────────────────────────────────┐
      │          Parallel 4-Agent Multi-Analysis Phase          │
      └──────┬─────────────┬─────────────┬─────────────┬────────┘
             │             │             │             │
             ▼             ▼             ▼             ▼
      ┌────────────┐┌────────────┐┌────────────┐┌────────────┐
      │   Code     ││  Security  ││    Test    ││  Web Perf  │
      │  Reviewer  ││  Auditor   ││  Engineer  ││  Auditor   │
      └──────┬─────┘└──────┬─────┘└──────┬─────┘└──────┬─────┘
             │             │             │             │
             └──────┬──────┴─────────────┴──────┬──────┘
                    ▼                           ▼
      ┌─────────────────────────────────────────────────────────┐
      │       Consolidated 4-Agent Matrix & Action Plan         │
      │ • Unified Severity Matrix (Critical / High / Med / Low) │
      │ • Multi-Perspective Cross-Check & Consensus             │
      │ • Concrete Remediation Code / Test Suite / Optimizations│
      └─────────────────────────────────────────────────────────┘
```

---

## Output Standards for `agent go`

Whenever `agent go` is invoked, the response must provide a unified multi-agent report with:

1. **Executive Multi-Agent Scorecard**:
   - Status & verdict across all 4 dimensions.
   - Finding counts by severity: Critical, High, Medium, Low.

2. **Synchronized Agent Reports**:
   - **`[code-reviewer]`**: Architectural consistency, correctness bugs, and code cleanliness.
   - **`[security-auditor]`**: Vulnerability analysis, authorization checks, and defense-in-depth findings.
   - **`[test-engineer]`**: Coverage gaps, missing edge-case specifications, and concrete test cases.
   - **`[web-performance-auditor]`**: CWV impact, rendering/memory bottlenecks, and payload optimizations.

3. **Consolidated Action & Patch Plan**:
   - Concrete, unified code diffs or implementation steps resolving the identified items in order of priority.
