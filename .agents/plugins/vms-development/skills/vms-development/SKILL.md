---
name: vms-development
description: Guide for developing and maintaining VMS architecture, visitor flows, appointments, workflow engine, email service, and MCP tools.
---

# VMS Development Skill

## Architecture Guidelines
- **Frontend**: React 18 + Vite 5 + TailwindCSS 3.4
- **Backend**: Express 4.19 + Node.js (CommonJS)
- **Database**: MongoDB + Mongoose 8.3
- **Event Bus**: Custom EventEmitter (`backend/events/eventBus.js`)
- **Audit System**: Append-only hash chained audit log (`AuditLog.js` & `auditService.js`)

## Principles
1. Never bypass authentication or RBAC guards.
2. Ensure all physical inventory or appointment status changes publish domain events.
3. Keep business logic strictly inside backend service classes, never inside React components.
