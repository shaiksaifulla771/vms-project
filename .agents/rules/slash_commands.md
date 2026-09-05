# Workspace Custom Slash Commands & Triggers

The following slash commands are registered to trigger domain-specific skills and workflows:

| Command | Aliases | Skill Activated | Purpose |
|:---|:---|:---|:---|
| **`/vendor-check`** | `/po-check`, `/po-workflow`, `/check-workflow` | [`vendor-po-workflow-check`](../skills/vendor-po-workflow-check/SKILL.md) | Analyzes and validates vendor onboarding, PO approval, goods receipt, or invoice matching state machines before code is written. |
| **`/clear-cache`** | `/flush-vite` | [`clear-vite-cache`](../skills/clear-vite-cache/SKILL.md) | Clears Vite pre-bundled cache and restarts development server cleanly. |
| **`/schema-migrate`** | `/db-migrate` | [`safe-schema-migration`](../skills/safe-schema-migration/SKILL.md) | Validates additive, non-breaking database schema changes. |
| **`/governance-check`** | `/audit-scope` | [`enterprise-vms-governance`](../skills/enterprise-vms-governance/SKILL.md) | Enforces 3-level site scoping, soft deactivation, and immutable audit trails. |
| **`agent go`** | `/agent-go`, `agents go` | Synchronized 4-Agent Protocol ([`agent_go_orchestration.md`](agent_go_orchestration.md)) | Triggers all 4 specialized agents (`code-reviewer`, `security-auditor`, `test-engineer`, `web-performance-auditor`) concurrently to review, harden, test, and optimize target code. |
