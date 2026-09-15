# Perplexity-Powered Code Analysis & Real-Time Architecture Rule

Whenever the user asks to analyze, improve, rewrite, enhance code, or build real-time applications:

## 1. Live Research via Perplexity MCP
- Always invoke the Perplexity MCP tool (`perplexity_ask` or Composio `PERPLEXITYAI_SEARCH` / `PERPLEXITYAI_EXECUTE_AGENT`) to retrieve current (2026+) industry standards, best architectural patterns, library versions, and performance benchmarks.
- Never rely solely on older static weights when designing real-time pipelines or rewriting codebases.

## 2. Real-Time Application Standards
When designing or enhancing real-time systems, prioritize:
- **Transport Protocols**: WebSockets, Server-Sent Events (SSE), WebRTC data channels, HTTP/2 or HTTP/3 multiplexing.
- **State Management & Caching**: Redis Pub/Sub, Redis Streams, in-memory buffering, distributed state locks.
- **Asynchronous Architecture**: Non-blocking I/O (`asyncio` in Python, async/await event loops in Node/TypeScript, Go channels/goroutines).
- **Resilience & Scalability**: Automatic reconnects with exponential backoff, heartbeat/keepalive mechanisms, rate-limiting, and graceful failure degradation.

## 3. Workflow for Code Enhancement & Rewriting
1. **Deep Analysis**: Inspect existing files, dependency graphs, and identify performance bottlenecks, anti-patterns, or missing concurrency handling.
2. **Perplexity Grounding**: Query Perplexity for state-of-the-art solutions addressing the identified bottlenecks.
3. **Structured Plan**: Present an implementation plan with architectural diagrams, proposed changes, and performance gains.
4. **Execution & Code Generation**: Produce clean, fully typed, production-grade code without placeholders.
5. **Validation**: Test and verify the rewritten components with automated verification scripts.
