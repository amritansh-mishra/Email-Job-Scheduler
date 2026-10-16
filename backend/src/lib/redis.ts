import { Redis } from 'ioredis';
import { env } from '../config/env.js';

/** BullMQ requires maxRetriesPerRequest=null on connections used by workers. */
export function createRedis() {
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
}

export const redis = createRedis();
