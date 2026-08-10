---
name: email-management
description: Guide for rendering email templates, managing email queues, and handling dispatches safely.
---

# Email Management Skill

## Provider Abstraction Architecture
VMS → Backend → Email Service → Email Provider (Console/Mock or SMTP)

## Core Functions
- `sendEmail(options)`
- `sendTemplateEmail(templateCode, recipient, data)`
- `queueEmail(options)`
- `scheduleEmail(options, scheduleTime)`
- `retryEmail(emailQueueId)`
