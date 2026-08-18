const express = require('express');
const cors = require('cors');

const dotenv = require('dotenv');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

// Models removed - seeding moved to scripts/seed.js
const { detectTransactionSupport } = require('./utils/transaction');

// Load environment variables
dotenv.config();

// Validate JWT secret & production guards at server boot time
const getJwtSecret = require('./config/jwt');
getJwtSecret();

// Connect to database
console.log(`[VMS] Environment: ${process.env.NODE_ENV || 'development'}`);
console.log('[VMS] MongoDB: connecting...');

connectDB().then(async () => {
  await detectTransactionSupport();
  console.log('[VMS] MongoDB: connected');

  // Start the background queue worker
  require('./worker');

  // Seed default templates, workflows, and plugins
  try {
    await require('./services/emailTemplateService').seedDefaultTemplates();
    await require('./services/workflowEngineService').seedDefaultWorkflows();
    await require('./services/pluginManagerService').seedDefaultPlugins();
  } catch (err) {
    console.error('[VMS] Initial Seeding Error:', err.message);
  }

  console.log('[VMS] Redis: connecting...');

  const app = require('./app');
  const { getRedisStatus } = require('./config/redis');

  // Give Redis a brief moment to connect (max 1000ms delay) before finalizing logs
  setTimeout(() => {
    if (getRedisStatus()) {
      console.log('[VMS] Redis: READY');
    } else {
      console.log('[VMS] Redis: unavailable');
      console.log('[VMS] Rate Limiter: MEMORY FALLBACK ACTIVE');
      console.log('[VMS] Server startup continuing safely');
    }

    const PORT = process.env.PORT || 5000;
    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`[VMS Boot] Port ${PORT} is already in use by another instance. Run: Stop-Process -Id (Get-NetTCPConnection -LocalPort ${PORT}).OwningProcess -Force`);
        process.exit(1);
      }
    });

    // Server restart trigger
    process.on('unhandledRejection', (err, promise) => {
      console.error(`Unhandled Rejection Error: ${err.message}`);
      server.close(() => process.exit(1));
    });
  }, 1000);
});

