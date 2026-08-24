const Redis = require('ioredis');
const RedisMock = require('ioredis-mock');

let redisClient = null;
let pubClient = null;
let subClient = null;

// Graceful fallback state
let isRedisAvailable = false;

const initRedis = () => {
  if (redisClient) return redisClient;

  // PHASE 14: Use in-memory mock for test isolation to prevent touching any real Redis data
  if (process.env.NODE_ENV === 'test') {
    redisClient = new RedisMock();
    pubClient = new RedisMock();
    subClient = new RedisMock();
    isRedisAvailable = true;
    return redisClient;
  }

  // PHASE 2 & 3: Safely connect using env variables, don't hardcode URLs
  const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  
  const options = {
    maxRetriesPerRequest: 1,
    retryStrategy(times) {
      if (times > 2) return null; // Stop retrying after 2 attempts
      return 1000;
    },
    enableOfflineQueue: false // Fail fast if Redis is down
  };

  redisClient = new Redis(redisUrl, options);
  pubClient = new Redis(redisUrl, options);
  subClient = new Redis(redisUrl, options);

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

const getPubClient = () => {
  if (!pubClient) initRedis();
  return pubClient;
};

const getSubClient = () => {
  if (!subClient) initRedis();
  return subClient;
};

const getRedisStatus = () => {
  if (!redisClient) initRedis();
  return isRedisAvailable;
};

const closeRedis = async () => {
  if (redisClient) {
    await redisClient.quit();
    if (pubClient) await pubClient.quit();
    if (subClient) await subClient.quit();
    redisClient = null;
    pubClient = null;
    subClient = null;
    isRedisAvailable = false;
  }
};

module.exports = {
  getClient,
  getPubClient,
  getSubClient,
  getRedisStatus,
  closeRedis
};
