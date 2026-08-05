---
name: clear-vite-cache
description: Clears the Vite local dependency cache and restarts the development server
---

# Clear Vite Cache

When a React application using Vite is stuck in a broken state, showing a blank screen despite the code being correct, or if the user explicitly asks to clear the local cache:

1. Kill the running Vite background task using `manage_task`.
2. Run `Remove-Item -Recurse -Force node_modules/.vite` (or `rm -rf node_modules/.vite` on bash) in the frontend directory to clear the Vite dependency cache.
3. Restart the server using `npm run dev` as a background task.
