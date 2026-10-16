import { Queue } from 'bullmq';
import { env } from '../config/env.js';
import { createRedis } from '../lib/redis.js';

export const EMAIL_QUEUE = 'email-send';

export interface SendEmailJob {
  emailId: string;
  /** Set when the throttle gate already reserved a send slot for this job. */
  reservedSlot?: number;
}

export const emailQueue = new Queue<SendEmailJob>(EMAIL_QUEUE, {
  connection: createRedis(),
  defaultJobOptions: {
    attempts: env.SEND_MAX_ATTEMPTS,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: { age: 7 * 24 * 3600, count: 50_000 },
    removeOnFail: { age: 30 * 24 * 3600 },
  },
});
