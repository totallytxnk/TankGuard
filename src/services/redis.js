import Redis from 'ioredis';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

/**
 * Production-ready ioredis client.
 *
 * - Uses REDIS_URL from environment
 * - Lazy connection (explicit connect() in bootstrap)
 * - Bounded retry strategy
 * - Error listeners so the process does not crash on transient issues
 *
 * @type {import('ioredis').Redis}
 */
const redis = new Redis(config.redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    logger.warn('Redis reconnect attempt', { attempt: times, delayMs: delay });
    return delay;
  },
});

redis.on('error', (err) => {
  logger.error('Redis client error', { message: err.message });
});

redis.on('connect', () => {
  logger.info('Redis connected');
});

redis.on('ready', () => {
  logger.info('Redis ready');
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

/**
 * Gracefully closes the Redis connection.
 * Call this during process shutdown.
 * @returns {Promise<void>}
 */
export async function closeRedis() {
  try {
    await redis.quit();
    logger.info('Redis connection closed cleanly');
  } catch (err) {
    logger.error('Error while closing Redis', { message: err.message });
    redis.disconnect();
  }
}

export default redis;
