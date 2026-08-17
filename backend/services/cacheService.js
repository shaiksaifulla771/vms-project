const { getClient, getRedisStatus } = require('../config/redis');

class CacheService {
  constructor() {
    this.defaultTTL = 300; // 5 minutes default
  }

  async get(key) {
    try {
      if (!getRedisStatus()) return null;
      const client = getClient();
      if (!client) return null;
      const data = await client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (err) {
      console.warn(`[CacheService] GET error on ${key}:`, err.message);
      return null;
    }
  }

  async set(key, value, ttlSeconds = this.defaultTTL) {
    try {
      if (!getRedisStatus()) return false;
      const client = getClient();
      if (!client) return false;
      await client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
      return true;
    } catch (err) {
      console.warn(`[CacheService] SET error on ${key}:`, err.message);
      return false;
    }
  }

  async del(key) {
    try {
      if (!getRedisStatus()) return false;
      const client = getClient();
      if (!client) return false;
      await client.del(key);
      return true;
    } catch (err) {
      console.warn(`[CacheService] DEL error on ${key}:`, err.message);
      return false;
    }
  }

  async invalidatePattern(pattern) {
    try {
      if (!getRedisStatus()) return false;
      const client = getClient();
      if (!client) return false;

      // Handle redis-mock vs real ioredis
      if (typeof client.keys === 'function') {
        const keys = await client.keys(pattern);
        if (keys && keys.length > 0) {
          await client.del(...keys);
        }
      }
      return true;
    } catch (err) {
      console.warn(`[CacheService] Invalidation error on ${pattern}:`, err.message);
      return false;
    }
  }
}

module.exports = new CacheService();
