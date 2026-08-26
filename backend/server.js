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

    // Seed default templates, workflows, and plugins
    try {
      await require('./services/emailTemplateService').seedDefaultTemplates();
      await require('./services/workflowEngineService').seedDefaultWorkflows();
      await require('./services/pluginManagerService').seedDefaultPlugins();
      
      // Auto-ensure Master Admin and Dev Admin credentials exist & active
      const User = require('./models/User');
      const masterEmail = 'shaiksaifulla771@gmail.com';
      let masterUser = await User.findOne({ email: masterEmail });
      if (!masterUser) {
        await User.create({
          username: 'Shaik Saifulla',
          email: masterEmail,
          password: 'Saif@2005',
          role: 'Admin',
          accountStatus: 'ACTIVE',
          approvalStatus: 'APPROVED',
          isVerified: true,
          emailVerified: true,
          fieldSecurityLevel: 'Restricted'
        });
        console.log('[VMS] Master Admin initialized: ' + masterEmail);
      }

      const defaultAdminEmail = 'admin@vms.com';
      let defaultAdmin = await User.findOne({ email: defaultAdminEmail });
      if (!defaultAdmin) {
        await User.create({
          username: 'System Admin',
          email: defaultAdminEmail,
          password: 'admin123',
          role: 'Admin',
          accountStatus: 'ACTIVE',
          approvalStatus: 'APPROVED',
          isVerified: true,
          emailVerified: true,
          fieldSecurityLevel: 'Restricted'
        });
        console.log('[VMS] Default Admin initialized: ' + defaultAdminEmail);
      }
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

      const PORT = process.env.PORT || 5000;
      const server = app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
      });

      // Initialize Socket.IO
      const { initSocket } = require('./utils/socket');
      initSocket(server);

      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.error(`[VMS Boot] Port ${PORT} is already in use by another instance. Run: Stop-Process -Id (Get-NetTCPConnection -LocalPort ${PORT}).OwningProcess -Force`);
          process.exit(1);
        }
      });

      // Server restart trigger on unhandled rejections
      process.on('unhandledRejection', (err) => {
        console.error(`Unhandled Rejection Error: ${err.message}`);
        server.close(() => process.exit(1));
      });
    }, 1000);
  } catch (err) {
    console.error('[VMS Boot Fatal Error]:', err.message);
    process.exit(1);
  }
}

startServer();


