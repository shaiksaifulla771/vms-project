const { Queue } = require('bullmq');

// Only create real Redis connections when REDIS_HOST or REDIS_URL is set
const hasRealRedis = process.env.REDIS_URL || process.env.REDIS_HOST;

let connection = null;
let importQueue = null;
let commitQueue = null;

const QUEUES = {
  IMPORT: 'import-queue',
  COMMIT: 'commit-queue',
  EMAIL: 'email-queue'
};

let emailQueue = null;

if (hasRealRedis) {
  try {
    const Redis = require('ioredis');
    const redisOptions = {
      port: process.env.REDIS_PORT || 6379,
      host: process.env.REDIS_HOST || '127.0.0.1',
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
      retryStrategy: (times) => {
        if (times > 5) return null; // stop reconnecting if offline
        return Math.min(times * 500, 2000);
      }
    };
    
    connection = process.env.REDIS_URL
      ? new Redis(process.env.REDIS_URL, { 
          maxRetriesPerRequest: null, 
          enableOfflineQueue: false,
          retryStrategy: (times) => (times > 5 ? null : Math.min(times * 500, 2000))
        })
      : new Redis(redisOptions);

    connection.on('error', () => {
      // Silently handle offline Redis without crashing process or flooding logs
    });

    importQueue = new Queue(QUEUES.IMPORT, { connection });
    commitQueue = new Queue(QUEUES.COMMIT, { connection });
    emailQueue = new Queue(QUEUES.EMAIL, { connection });

    importQueue.on('error', () => {});
    commitQueue.on('error', () => {});
    emailQueue.on('error', () => {});

    console.log('[Queue] BullMQ queues initialized with Redis adapter.');
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
  commitQueue,
  emailQueue
};

