import { and, eq } from 'drizzle-orm';
import { env } from '../config/env.js';
import { db, schema } from '../db/index.js';
import type { Email } from '../db/schema.js';
import { HttpError } from '../lib/errors.js';
import { sanitizeEmailHtml } from '../lib/html.js';
import { logger } from '../lib/logger.js';
import { emailQueue } from '../queue/emailQueue.js';
import { indexEmails, removeIndexedEmail } from './search.js';

const INSERT_CHUNK = 1000;
const ENQUEUE_CHUNK = 500;

export interface CreateCampaignInput {
  userId: string;
  senderId: string;
  subject: string;
  bodyHtml: string;
  recipients: string[];
  startAt: Date;
  delayBetweenSeconds: number;
  hourlyLimit: number;
}

function enqueue(rows: Pick<Email, 'id' | 'scheduledAt'>[]) {
  const now = Date.now();
  // jobId = email id: BullMQ ignores an add whose jobId already exists, so
  // re-enqueueing (e.g. on reconcile) can never create a second job.
  return emailQueue.addBulk(
    rows.map((r) => ({
      name: 'send',
      data: { emailId: r.id },
      opts: { jobId: r.id, delay: Math.max(0, r.scheduledAt.getTime() - now) },
    })),
  );
}

export async function createCampaign(input: CreateCampaignInput) {
  const sender = await db.query.senders.findFirst({
    where: and(eq(schema.senders.id, input.senderId), eq(schema.senders.userId, input.userId)),
  });
  if (!sender) throw new HttpError(404, 'Sender not found');

  const recipients = [...new Set(input.recipients.map((r) => r.trim().toLowerCase()))];
  const bodyHtml = sanitizeEmailHtml(input.bodyHtml);
  // The campaign's own delay can only make sends sparser than the global minimum.
  const gapMs = Math.max(input.delayBetweenSeconds * 1000, env.MIN_DELAY_BETWEEN_SENDS_MS);
  const start = Math.max(input.startAt.getTime(), Date.now());

  const { campaign, rows } = await db.transaction(async (tx) => {
    const [campaign] = await tx
      .insert(schema.campaigns)
      .values({
        userId: input.userId,
        senderId: sender.id,
        subject: input.subject,
        bodyHtml,
        startAt: new Date(start),
        delayBetweenMs: gapMs,
        hourlyLimit: input.hourlyLimit,
      })
      .returning();

    const rows: Email[] = [];
    for (let i = 0; i < recipients.length; i += INSERT_CHUNK) {
      const chunk = recipients.slice(i, i + INSERT_CHUNK).map((to, j) => ({
        campaignId: campaign!.id,
        userId: input.userId,
        senderId: sender.id,
        toEmail: to,
        subject: input.subject,
        bodyHtml,
        scheduledAt: new Date(start + (i + j) * gapMs),
      }));
      rows.push(...(await tx.insert(schema.emails).values(chunk).returning()));
    }
    return { campaign: campaign!, rows };
  });

  // Enqueue after commit so a worker never picks up a job whose row isn't visible yet.
  // If the process dies between commit and enqueue, reconcileScheduledJobs() repairs it.
  for (let i = 0; i < rows.length; i += ENQUEUE_CHUNK) await enqueue(rows.slice(i, i + ENQUEUE_CHUNK));
  await indexEmails(rows, sender.email);

  logger.info('Campaign scheduled', { campaignId: campaign.id, emails: rows.length });
  return { campaignId: campaign.id, scheduled: rows.length, firstSendAt: new Date(start) };
}

/**
 * Makes Redis agree with Postgres after a restart: every row still `scheduled`
 * gets its job re-added. Existing jobs are untouched (same jobId), so this is
 * safe to run on every boot and covers a wiped Redis or a crash mid-enqueue.
 */
export async function reconcileScheduledJobs() {
  const pending = await db
    .select({ id: schema.emails.id, scheduledAt: schema.emails.scheduledAt })
    .from(schema.emails)
    .where(eq(schema.emails.status, 'scheduled'));
  for (let i = 0; i < pending.length; i += ENQUEUE_CHUNK) await enqueue(pending.slice(i, i + ENQUEUE_CHUNK));
  logger.info('Reconciled scheduled emails with queue', { pending: pending.length });
}

/** Cancels a scheduled email or deletes a finished one. */
export async function deleteEmail(userId: string, id: string) {
  const email = await db.query.emails.findFirst({
    where: and(eq(schema.emails.id, id), eq(schema.emails.userId, userId)),
  });
  if (!email) throw new HttpError(404, 'Email not found');

  if (email.status === 'scheduled') {
    // Conditional update: if a worker claimed it in the meantime, the claim wins.
    const [cancelled] = await db
      .update(schema.emails)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(and(eq(schema.emails.id, id), eq(schema.emails.status, 'scheduled')))
      .returning();
    if (!cancelled) throw new HttpError(409, 'Email is already being sent');
    await emailQueue.remove(id).catch(() => undefined);
    await removeIndexedEmail(id);
    return;
  }
  if (email.status === 'sending') throw new HttpError(409, 'Email is being sent right now');
  await db.delete(schema.emails).where(eq(schema.emails.id, id));
  await removeIndexedEmail(id);
}
