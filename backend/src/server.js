require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createApp } = require('./app');
const { migrate } = require('../db/migrate');
const { close } = require('./db/pool');

async function main() {
  if (process.env.AUTO_MIGRATE !== 'false') {
    await migrate({ silent: true });
  }
  const port = parseInt(process.env.PORT || '5000', 10);
  const server = createApp().listen(port, () => {
    console.log(`[api] listening on http://localhost:${port}`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[api] Port ${port} is already in use - another copy of the API is already running. `
        + 'Close the other terminal or run "npm run stop", then start again.');
    } else {
      console.error('[api] server error:', err.message);
    }
    process.exit(1);
  });
  const shutdown = () => server.close(() => close().then(() => process.exit(0)));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[api] failed to start:', err.message);
  process.exit(1);
});
