const Redis = require('ioredis');
const RedisMock = require('ioredis-mock');

let redisClient = null;

// Graceful fallback state
let isRedisAvailable = false;

const initRedis = () => {
  if (redisClient) return redisClient;

  // PHASE 14: Use in-memory mock for test isolation to prevent touching any real Redis data
  if (process.env.NODE_ENV === 'test') {
    redisClient = new RedisMock();
    isRedisAvailable = true;
    return redisClient;
  }

  // PHASE 2 & 3: Safely connect using env variables, don't hardcode URLs
  const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  
  redisClient = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    retryStrategy(times) {
      if (times > 2) return null; // Stop retrying after 2 attempts
      return 1000;
    },
    enableOfflineQueue: false // Fail fast if Redis is down
  });

  redisClient.on('connect', () => {
    isRedisAvailable = true;
  });

  redisClient.on('error', (err) => {
    isRedisAvailable = false;
    // Silence continuous errors to prevent log spam
  });

  redisClient.on('end', () => {
    isRedisAvailable = false;
  });

  return redisClient;
};

// Singleton initialization
const getClient = () => {
  if (!redisClient) initRedis();
  return redisClient;
};

const getRedisStatus = () => isRedisAvailable;

const closeRedis = async () => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    isRedisAvailable = false;
  }
};

module.exports = {
  getClient,
  getRedisStatus,
  closeRedis
};
