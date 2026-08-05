const { Queue, Worker, QueueEvents } = require('bullmq');
const Redis = require('ioredis-mock');

// Shared Redis connection for BullMQ (Mocked)
const redisOptions = {
  port: process.env.REDIS_PORT || 6379,
  host: process.env.REDIS_HOST || '127.0.0.1',
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null // Required by BullMQ
};

// Use provided REDIS_URL if available, otherwise fallback to options
const connection = new Redis(redisOptions);

// Define Queue names
const QUEUES = {
  IMPORT: 'import-queue',
  COMMIT: 'commit-queue'
};

// Instantiate Queues
const importQueue = new Queue(QUEUES.IMPORT, { connection });
const commitQueue = new Queue(QUEUES.COMMIT, { connection });

module.exports = {
  connection,
  QUEUES,
  importQueue,
  commitQueue
};
