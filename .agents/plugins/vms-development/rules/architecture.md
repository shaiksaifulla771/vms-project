# VMS Architecture Rules
1. Never put business logic inside React components. Use backend services.
2. All domain events must be published through `eventBus.js`.
3. Use common REST API pathing (`/api/visitors`, `/api/appointments`, `/api/email`, `/api/workflows`).
