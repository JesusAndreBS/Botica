import Redis from 'ioredis';
import { config } from '../config/env.js';

declare global {
  var redis: Redis | undefined;
}

export const redis = global.redis || new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  enableReadyCheck: true,
  lazyConnect: true
});

if (process.env.NODE_ENV !== 'production') global.redis = redis;

export async function connectRedis() {
  await redis.connect();
  console.log('✅ Redis connected');
}

export async function disconnectRedis() {
  await redis.quit();
}