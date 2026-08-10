const dotenv = require('dotenv');
dotenv.config();

const { Worker } = require('bullmq');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const { connection, QUEUES } = require('./config/queue');

const importProcessor = require('./workers/importWorker');
const commitProcessor = require('./workers/commitWorker');

async function startWorker() {
  console.log('🔄 Starting Async Worker Process...');
  
  // Connect to DB (workers need DB access)
  await connectDB();

  // Initialize Import Worker
  const importWorker = new Worker(QUEUES.IMPORT, async job => {
    console.log(`[IMPORT] Processing job ${job.id}`);
    return importProcessor(job);
  }, { connection });

  importWorker.on('completed', job => console.log(`✅ [IMPORT] Job ${job.id} completed.`));
  importWorker.on('failed', (job, err) => console.error(`❌ [IMPORT] Job ${job.id} failed:`, err));

  // Initialize Commit Worker
  const commitWorker = new Worker(QUEUES.COMMIT, async job => {
    console.log(`[COMMIT] Processing job ${job.id}`);
    return commitProcessor(job);
  }, { connection });

  commitWorker.on('completed', job => console.log(`✅ [COMMIT] Job ${job.id} completed.`));
  commitWorker.on('failed', (job, err) => console.error(`❌ [COMMIT] Job ${job.id} failed:`, err));

  console.log('👷 Workers are listening for jobs on Redis...');

  const emailService = require('./services/emailService');
  setInterval(async () => {
    try {
      await emailService.processEmailQueue();
    } catch (err) {
      console.error('[EMAIL QUEUE] Error processing queue:', err);
    }
  }, 10000);
  
  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('Shutting down workers...');
    await importWorker.close();
    await commitWorker.close();
    await mongoose.connection.close();
    process.exit(0);
  });
}

startWorker().catch(err => {
  console.error('Worker failed to start', err);
  process.exit(1);
});
