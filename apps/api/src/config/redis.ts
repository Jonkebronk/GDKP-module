import Redis from 'ioredis';
import { env } from './env.js';
import { logger } from './logger.js';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redis.on('connect', () => {
  logger.info('Redis connected');
});

redis.on('error', (err) => {
  logger.error({ error: err.message }, 'Redis error');
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

// Pub/Sub clients for Socket.io adapter
export const redisPub = redis.duplicate();
export const redisSub = redis.duplicate();
