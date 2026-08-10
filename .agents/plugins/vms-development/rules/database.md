# VMS Database Rules
1. Audit logs are append-only. Updates and deletes are forbidden.
2. Always write to database before emitting domain events.
3. Validate schema types and enums before saving.
