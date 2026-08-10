---
name: database-management
description: Guide for Mongoose schemas, relationships, indexing, and transactional integrity in VMS.
---

# Database Management Skill

## Conventions
- Use Mongoose 8.3 models.
- Always include `timestamps: true`.
- Index foreign key fields (`siteId`, `visitorId`, `workflowId`).
- Use Mongoose sessions for multi-document transactional integrity.
