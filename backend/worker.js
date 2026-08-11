const dotenv = require('dotenv');
dotenv.config();

/**
 * Async Worker Process
 * Gracefully skips BullMQ workers when no real Redis server is available.
 * Falls back to a simple email queue polling interval.
 */
const mongoose = require('mongoose');

let workersStarted = false;

async function startWorker() {
  console.log('🔄 Starting Async Worker Process...');

  // Check if real Redis is available (not mock)
  const hasRealRedis = process.env.REDIS_URL || process.env.REDIS_HOST;

  if (hasRealRedis) {
    try {
      const { Worker } = require('bullmq');
      const connectDB = require('./config/db');
      const { connection, QUEUES } = require('./config/queue');
      const importProcessor = require('./workers/importWorker');
      const commitProcessor = require('./workers/commitWorker');

      await connectDB();

      const importWorker = new Worker(QUEUES.IMPORT, async job => {
        console.log(`[IMPORT] Processing job ${job.id}`);
        return importProcessor(job);
      }, { connection });

      importWorker.on('completed', job => console.log(`✅ [IMPORT] Job ${job.id} completed.`));
      importWorker.on('failed', (job, err) => console.error(`❌ [IMPORT] Job ${job.id} failed:`, err));

      const commitWorker = new Worker(QUEUES.COMMIT, async job => {
        console.log(`[COMMIT] Processing job ${job.id}`);
        return commitProcessor(job);
      }, { connection });

      commitWorker.on('completed', job => console.log(`✅ [COMMIT] Job ${job.id} completed.`));
      commitWorker.on('failed', (job, err) => console.error(`❌ [COMMIT] Job ${job.id} failed:`, err));

      console.log('👷 Workers are listening for jobs on Redis...');
      workersStarted = true;

      process.on('SIGTERM', async () => {
        console.log('Shutting down workers...');
        await importWorker.close();
        await commitWorker.close();
        await mongoose.connection.close();
        process.exit(0);
      });
    } catch (err) {
      console.warn('[Worker] BullMQ worker init failed (Redis unavailable):', err.message);
      console.log('[Worker] Continuing without BullMQ workers.');
    }
  } else {
    console.log('[Worker] No REDIS_HOST/REDIS_URL configured. BullMQ workers SKIPPED.');
    console.log('[Worker] Email queue will use in-process polling fallback.');
  }

  // Email queue polling (works with or without Redis)
  try {
    const emailService = require('./services/emailService');
    setInterval(async () => {
      try {
        await emailService.processEmailQueue();
      } catch (err) {
        // Silently continue — email queue errors should not crash the server
      }
    }, 15000);
  } catch (e) {
    console.warn('[Worker] Email service not available:', e.message);
  }
}

startWorker().catch(err => {
  console.error('[Worker] Failed to start:', err.message);
  // Don't exit — let the main server continue
});
