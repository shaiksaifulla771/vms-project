---
name: perplexity-architect
description: Comprehensive workflow to analyze codebases, research cutting-edge patterns via Perplexity MCP, plan architectural refactors, and build low-latency real-time applications.
---

# Perplexity Code Architect & Real-Time Builder

Use this skill when tasked with analyzing a repository, optimizing code quality, planning large-scale refactors, or architecting real-time systems.

## Workflow

1. **Repository & Code Scan**:
   - Inspect files, imports, dependencies, data structures, and concurrency models.
   - Detect bottlenecks: CPU-bound blocking calls, N+1 query patterns, unindexed storage, or missing stream backpressure.

2. **Perplexity Research**:
   - Query Perplexity MCP for:
     - Modern framework comparisons and benchmarks (e.g., FastAPI vs Go vs Node for specific real-time workloads).
     - Optimal WebSocket / SSE libraries and scaling techniques (e.g., Redis pub/sub backplanes).
     - Security considerations (token auth over WebSockets, rate limiting).

3. **Implementation Planning**:
   - Break down the architecture into modular components (transport, state, business logic, storage).
   - Document data flows and protocol contracts.

4. **Code Generation & Verification**:
   - Implement clean, production-ready modules with comprehensive error handling and type annotations.
   - Add verification scripts to simulate real-time client-server interactions.
