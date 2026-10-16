import { DelayedError, Worker, type Job } from 'bullmq';
import { and, eq, sql } from 'drizzle-orm';
import { env } from './config/env.js';
import { db, pool, schema } from './db/index.js';
import { logger } from './lib/logger.js';
import { createRedis } from './lib/redis.js';
import { EMAIL_QUEUE, type SendEmailJob } from './queue/emailQueue.js';
import { effectiveHourlyLimit, passSendGate } from './queue/rateLimiter.js';
import { sendMail } from './services/mailer.js';
import { reconcileScheduledJobs } from './services/scheduler.js';
import { ensureSearchIndex, updateIndexedEmail } from './services/search.js';
import { notifySlack } from './services/slack.js';

async function postpone(job: Job<SendEmailJob>, token: string | undefined, atMs: number, data: SendEmailJob) {
  await job.updateData(data);
  await job.moveToDelayed(atMs, token);
  // Tells BullMQ the job was moved on purpose; it does not count as a failed attempt.
  throw new DelayedError();
}

async function processSend(job: Job<SendEmailJob>, token?: string) {
  const { emailId } = job.data;
  const email = await db.query.emails.findFirst({ where: eq(schema.emails.id, emailId) });

  // Idempotency, layer 1: anything not waiting to be sent is a no-op.
  if (!email || email.status === 'sent' || email.status === 'cancelled' || email.status === 'failed') {
    return { skipped: email?.status ?? 'missing' };
  }
  if (email.status === 'sending') {
    // A previous attempt crashed mid-SMTP. We can't know whether the provider accepted it,
    // so we choose at-most-once delivery: mark it failed instead of risking a duplicate.
    await markFailed(email.id, 'Send interrupted by a worker crash; not retried to avoid a duplicate');
    return { skipped: 'interrupted' };
  }

  const campaign = await db.query.campaigns.findFirst({ where: eq(schema.campaigns.id, email.campaignId) });
  const limit = effectiveHourlyLimit(campaign?.hourlyLimit ?? 0);
  const gate = await passSendGate(email.senderId, limit, email.scheduledAt, job.data.reservedSlot ?? 0);

  if (gate.kind === 'throttled') {
    return postpone(job, token, gate.slotMs, { emailId, reservedSlot: gate.slotMs });
  }
  if (gate.kind === 'hourly-limit') {
    const retryAt = new Date(gate.retryAtMs);
    await db.update(schema.emails).set({ scheduledAt: retryAt, updatedAt: new Date() }).where(eq(schema.emails.id, emailId));
    await updateIndexedEmail(emailId, { scheduledAt: retryAt });
    if (gate.firstHitThisWindow) {
      const sender = await db.query.senders.findFirst({ where: eq(schema.senders.id, email.senderId) });
      logger.warn('Hourly limit reached', { senderId: email.senderId, limit });
      void notifySlack(
        email.userId,
        `:warning: *Hourly sending limit reached* for \`${sender?.email ?? email.senderId}\` (${limit}/hour).\n` +
          `Remaining emails are paused and will resume at ${retryAt.toUTCString()}.`,
      );
    }
    return postpone(job, token, gate.retryAtMs, { emailId });
  }

  // Idempotency, layer 2: atomic claim. Only one worker can move scheduled -> sending.
  const [claimed] = await db
    .update(schema.emails)
    .set({ status: 'sending', claimedAt: new Date(), attempts: sql`${schema.emails.attempts} + 1`, updatedAt: new Date() })
    .where(and(eq(schema.emails.id, emailId), eq(schema.emails.status, 'scheduled')))
    .returning();
  if (!claimed) return { skipped: 'claimed-elsewhere' };

  const sender = await db.query.senders.findFirst({ where: eq(schema.senders.id, claimed.senderId) });
  if (!sender) {
    await markFailed(emailId, 'Sender no longer exists');
    return { skipped: 'no-sender' };
  }

  try {
    const info = await sendMail(sender, { emailId, to: claimed.toEmail, subject: claimed.subject, html: claimed.bodyHtml });
    const sentAt = new Date();
    await db
      .update(schema.emails)
      .set({ status: 'sent', sentAt, messageId: info.messageId, previewUrl: info.previewUrl, error: null, updatedAt: sentAt })
      .where(eq(schema.emails.id, emailId));
    await updateIndexedEmail(emailId, { status: 'sent', sentAt });
    logger.info('Email sent', { emailId, to: claimed.toEmail, preview: info.previewUrl });
    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    if (finalAttempt) {
      await markFailed(emailId, message);
    } else {
      // SMTP rejected it before accepting, so a retry cannot duplicate it: hand it back.
      await db.update(schema.emails).set({ status: 'scheduled', error: message, updatedAt: new Date() }).where(eq(schema.emails.id, emailId));
    }
    throw err;
  }
}

async function markFailed(id: string, error: string) {
  const now = new Date();
  await db.update(schema.emails).set({ status: 'failed', error, sentAt: now, updatedAt: now }).where(eq(schema.emails.id, id));
  await updateIndexedEmail(id, { status: 'failed', sentAt: now });
}

await ensureSearchIndex();
await reconcileScheduledJobs();

const worker = new Worker<SendEmailJob>(EMAIL_QUEUE, processSend, {
  connection: createRedis(),
  concurrency: env.WORKER_CONCURRENCY,
});

worker.on('failed', (job, err) => {
  if (err instanceof DelayedError) return;
  logger.error('Send attempt failed', { jobId: job?.id, attempt: job?.attemptsMade, err: err.message });
});
worker.on('error', (err) => logger.error('Worker error', { err: err.message }));

logger.info('Email worker started', {
  concurrency: env.WORKER_CONCURRENCY,
  minDelayMs: env.MIN_DELAY_BETWEEN_SENDS_MS,
  maxPerHourPerSender: env.MAX_EMAILS_PER_HOUR_PER_SENDER,
});

async function shutdown(signal: string) {
  logger.info(`${signal} received, letting in-flight sends finish...`);
  await worker.close();
  await pool.end();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
