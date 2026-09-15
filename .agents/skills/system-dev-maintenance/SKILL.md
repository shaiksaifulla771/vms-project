---
name: system-dev-maintenance
description: Skill for zero-downtime cache invalidation, database migrations, health diagnostics, test runner execution, and real-time error recovery.
---

# System Development, Analytics & Maintenance Skill

## Overview
Equips AI agents to monitor system health, flush and re-index caches, run regression test suites, execute additive database migrations, and handle automatic fallback recovery.

## Capabilities & Tools
1. `flush_vite_cache`: Clears local frontend node_modules and Vite pre-bundled asset cache.
2. `redis_cache_invalidator`: Flushes stale Redis cache keys upon master data updates.
3. `additive_schema_migrator`: Executes zero-downtime MongoDB schema migrations with rollback support.
4. `database_health_check`: Pings MongoDB replica sets and memory server fallbacks.
5. `unit_test_suite_runner`: Executes Jest unit and integration test suites (`npm run test:unit`).
6. `memory_leak_watchdog`: Monitors Node.js process heap allocation and garbage collection.
7. `slow_query_detector`: Flags database queries taking longer than 200ms with correlation IDs.
8. `rate_limiter_inspector`: Monitors sliding window rate limit tokens per client IP/user.
9. `perplexity_web_researcher`: Performs real-time Perplexity MCP searches for cutting-edge architectural patterns.
10. `hot_reload_verifier`: Validates frontend HMR socket connections and bundle transforms.
