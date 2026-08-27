const express = require('express');
const cors = require('cors');

const path = require('path');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

// Models removed - seeding moved to scripts/seed.js
const { detectTransactionSupport } = require('./utils/transaction');

// Load environment variables (supports root and backend directory launches)
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config();

// Validate JWT secret & production guards at server boot time
const getJwtSecret = require('./config/jwt');
getJwtSecret();

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

    // Seed default templates, workflows, plugins, and master data (Sites, Warehouses, Materials, BOMs, Vendors)
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

    // Allow Redis a brief moment to initialize before finalizing startup logs
    setTimeout(() => {
      if (getRedisStatus()) {
        console.log('[VMS] Redis: READY');
      } else {
        console.log('[VMS] Redis: unavailable');
        console.log('[VMS] Rate Limiter: MEMORY FALLBACK ACTIVE');
        console.log('[VMS] Server startup continuing safely');
      }

const { execSync } = require('child_process');

function freePortIfBusy(port) {
  if (process.platform === 'win32') {
    try {
      const output = execSync(`powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique"`).toString().trim();
      if (output) {
        const pids = output.split(/\r?\n/).map(p => parseInt(p.trim(), 10)).filter(p => !isNaN(p) && p > 0 && p !== process.pid);
        for (const pid of pids) {
          try {
            process.kill(pid, 'SIGKILL');
          } catch (e) {
            try { execSync(`taskkill /F /PID ${pid}`); } catch (e2) {}
          }
        }
      }
    } catch (e) {}
  }
}

      const PORT = process.env.PORT || 5000;
      freePortIfBusy(PORT);

      const server = app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
      });

      // Initialize Socket.IO
      const { initSocket } = require('./utils/socket');
      initSocket(server);

      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.warn(`[VMS Boot] Port ${PORT} occupied, automatically releasing port and retrying...`);
          freePortIfBusy(PORT);
          setTimeout(() => {
            try {
              server.close();
            } catch (e) {}
            app.listen(PORT, () => {
              console.log(`Server running on port ${PORT}`);
            });
          }, 1000);
          return;
        }
        console.error(`[VMS Server Error]:`, err.message);
      });

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
        server.close(() => process.exit(1));
      });
    }, 1000);
  } catch (err) {
    console.error('[VMS Boot Fatal Error]:', err.message);
    process.exit(1);
  }
}

startServer();


