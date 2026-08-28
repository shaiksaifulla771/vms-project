const http = require('http');
const path = require('path');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const { detectTransactionSupport } = require('./utils/transaction');
const getJwtSecret = require('./config/jwt');

// Load environment variables (supports root and backend directory launches)
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config();

// Validate JWT secret & production guards at server boot time
getJwtSecret();

let server = null;

// Start Server Function using modern async/await
async function startServer() {
  try {
    console.log(`[VMS] Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('[VMS] MongoDB: connecting...');

    await connectDB();
    await detectTransactionSupport();
    console.log('[VMS] MongoDB: connected');

    // Start the background queue worker
    require('./worker');

    // Seed default templates, workflows, plugins, and master data
    try {
      await require('./services/emailTemplateService').seedDefaultTemplates();
      await require('./services/workflowEngineService').seedDefaultWorkflows();
      await require('./services/pluginManagerService').seedDefaultPlugins();
      
      const MasterDataBootstrapService = require('./services/masterDataBootstrapService');
      await MasterDataBootstrapService.bootstrapMasterData();
    } catch (err) {
      console.error('[VMS] Initial Seeding Error:', err.message);
    }

    console.log('[VMS] Redis: connecting...');
    const app = require('./app');
    const { getRedisStatus } = require('./config/redis');

    if (getRedisStatus()) {
      console.log('[VMS] Redis: READY');
    } else {
      console.log('[VMS] Redis: unavailable');
      console.log('[VMS] Rate Limiter: MEMORY FALLBACK ACTIVE');
      console.log('[VMS] Server startup continuing safely');
    }

    const PORT = process.env.PORT || 5000;

    // Create HTTP Server & initialize Socket.IO
    server = http.createServer(app);
    const { initSocket } = require('./utils/socket');
    initSocket(server);

    server.listen(PORT, () => {
      console.log(`[VMS] Server running on port ${PORT}`);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        let occupyingPid = null;
        try {
          const { execSync } = require('child_process');
          if (process.platform === 'win32') {
            const out = execSync(
              `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${PORT} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique"`
            ).toString().trim();
            if (out) occupyingPid = out.split(/\r?\n/).map(s => s.trim()).filter(Boolean).join(', ');
          } else {
            const out = execSync(`lsof -t -i:${PORT} 2>/dev/null || fuser ${PORT}/tcp 2>/dev/null`).toString().trim();
            if (out) occupyingPid = out.split(/\r?\n/).map(s => s.trim()).filter(Boolean).join(', ');
          }
        } catch (e) {}

        const pidInfo = occupyingPid ? ` (PID: ${occupyingPid})` : '';
        console.error(`[VMS Boot Error] Port ${PORT} is already occupied by another running instance${pidInfo}.`);
        console.error(`Please terminate the process using port ${PORT} or configure a different PORT in .env.`);
        process.exit(1);
      } else {
        console.error(`[VMS Server Error]:`, err.message);
      }
    });

    // Graceful Shutdown Handler
    const gracefulShutdown = (signal) => {
      console.log(`\n[VMS] Received ${signal}. Closing server gracefully...`);
      if (server) {
        server.close(() => {
          console.log('[VMS] HTTP & Socket.IO server closed.');
          process.exit(0);
        });
      } else {
        process.exit(0);
      }
      setTimeout(() => {
        process.exit(0);
      }, 3000).unref();
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Server resilience on unhandled rejections
    process.on('unhandledRejection', (err) => {
      const isDbNetworkError = err && (
        err.name === 'MongoServerSelectionError' ||
        err.name === 'MongoNetworkError' ||
        err.name === 'MongooseServerSelectionError' ||
        err.message?.includes('ENOTFOUND') ||
        err.message?.includes('ECONNREFUSED') ||
        err.message?.includes('buffering timed out')
      );

      if (isDbNetworkError) {
        console.warn(`[MongoDB Watchdog] Handled transient network rejection: ${err.message}. Connection recovery active.`);
        return;
      }

      console.error(`Unhandled Rejection Error: ${err?.message || err}`);
      if (server) {
        server.close(() => process.exit(1));
      } else {
        process.exit(1);
      }
    });
  } catch (err) {
    console.error('[VMS Boot Fatal Error]:', err.message);
    process.exit(1);
  }
}

startServer();
