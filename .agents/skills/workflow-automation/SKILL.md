---
name: workflow-automation
description: Skill for trigger-condition-action rule engine, domain event bus, async background queues, webhook dispatch, and automated workflows.
---

# Workflow Automation & Rule Engine Skill

## Overview
Equips AI agents to configure, validate, test, and execute event-driven workflows across ERP lifecycle events (e.g. `material.created`, `qc.failed`, `stock.low`, `po.approved`).

## Capabilities & Tools
1. `trigger_event_listener`: Subscribes to domain events published on the internal event bus.
2. `condition_evaluator`: Evaluates JSON logical expressions (`==`, `!=`, `>`, `<`, `in`, `contains`).
3. `action_executor`: Dispatches multi-step automated actions (emails, notifications, status updates, webhooks).
4. `workflow_dag_validator`: Verifies rule graphs have no infinite execution loops.
5. `async_queue_dispatcher`: Offloads heavy tasks to BullMQ / In-Memory Redis workers.
6. `webhook_signature_signer`: Signs outgoing webhook payloads with HMAC-SHA256 headers.
7. `retry_exponential_backoff`: Handles transient network failures with automated retries.
8. `dead_letter_queue_monitor`: Captures failed job payloads for debugging and replay.
9. `notification_broadcaster`: Dispatches live WebSocket alerts to connected browser sessions.
10. `event_stream_subscriber`: Listens for Server-Sent Events (SSE) from real-time ERP microservices.
