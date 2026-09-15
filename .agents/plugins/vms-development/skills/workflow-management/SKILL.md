---
name: workflow-management
description: Guide for creating, managing, and executing VMS workflows using the trigger-condition-action engine.
---

# Workflow Management Skill

## Workflow Pipeline Pattern
`Trigger Event` → `Condition Evaluation` → `Action Execution` → `Next Condition` → `Action`

## Core Functions
- `createWorkflow(data)`
- `executeWorkflow(triggerEvent, payload)`
- `pauseWorkflow(id)`
- `resumeWorkflow(id)`
- `cancelWorkflow(id)`
