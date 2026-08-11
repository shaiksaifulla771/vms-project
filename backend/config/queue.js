const { Queue } = require('bullmq');

// Only create real Redis connections when REDIS_HOST or REDIS_URL is set
const hasRealRedis = process.env.REDIS_URL || process.env.REDIS_HOST;

let connection = null;
let importQueue = null;
let commitQueue = null;

const QUEUES = {
  IMPORT: 'import-queue',
  COMMIT: 'commit-queue'
};

if (hasRealRedis) {
  try {
    const Redis = require('ioredis');
    const redisOptions = {
      port: process.env.REDIS_PORT || 6379,
      host: process.env.REDIS_HOST || '127.0.0.1',
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null
    };
    connection = process.env.REDIS_URL
      ? new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null })
      : new Redis(redisOptions);

    importQueue = new Queue(QUEUES.IMPORT, { connection });
    commitQueue = new Queue(QUEUES.COMMIT, { connection });
    console.log('[Queue] BullMQ queues initialized with Redis.');
  } catch (err) {
    console.warn('[Queue] Failed to connect to Redis:', err.message);
  }
} else {
  console.log('[Queue] No REDIS_HOST/REDIS_URL set. BullMQ queues disabled (in-memory fallback).');
}

module.exports = {
  connection,
  QUEUES,
  importQueue,
  commitQueue
};
