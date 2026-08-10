# VMS Security Rules
1. MCP tools MUST authenticate via JWT token and enforce RBAC roles.
2. Destructive raw SQL, shell execution, or database drops via MCP are strictly forbidden.
3. Passwords, JWT secrets, and SMTP credentials must never be committed or logged.
