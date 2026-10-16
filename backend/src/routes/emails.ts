import { Router } from 'express';
import { and, asc, count, desc, eq, ilike, inArray, or } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../db/index.js';
import type { Email, EmailStatus } from '../db/schema.js';
import { HttpError } from '../lib/errors.js';
import { htmlToText } from '../lib/html.js';
import { requireAuth, uid } from '../middleware/auth.js';
import { deleteEmail } from '../services/scheduler.js';
import { searchEmailIds, updateIndexedEmail } from '../services/search.js';

export const emailsRouter = Router();
emailsRouter.use(requireAuth);

const TAB_STATUSES: Record<'scheduled' | 'sent', EmailStatus[]> = {
  scheduled: ['scheduled', 'sending'],
  sent: ['sent', 'failed'],
};

const { emails, senders } = schema;

const listColumns = {
  id: emails.id,
  toEmail: emails.toEmail,
  subject: emails.subject,
  bodyHtml: emails.bodyHtml,
  status: emails.status,
  scheduledAt: emails.scheduledAt,
  sentAt: emails.sentAt,
  starred: emails.starred,
  senderEmail: senders.email,
};

type ListRow = Pick<Email, 'id' | 'toEmail' | 'subject' | 'bodyHtml' | 'status' | 'scheduledAt' | 'sentAt' | 'starred'> & {
  senderEmail: string;
};

function toListItem({ bodyHtml, ...row }: ListRow) {
  return { ...row, preview: htmlToText(bodyHtml).slice(0, 160) };
}

const listQuery = z.object({
  tab: z.enum(['scheduled', 'sent']).default('scheduled'),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  starred: z.enum(['true', 'false']).optional(),
});

emailsRouter.get('/', async (req, res) => {
  const { tab, q, page, limit, starred } = listQuery.parse(req.query);
  const starredOnly = starred === 'true';
  const userId = uid(req);
  const statuses = TAB_STATUSES[tab];
  const offset = (page - 1) * limit;
  const base = and(eq(emails.userId, userId), inArray(emails.status, statuses), starredOnly ? eq(emails.starred, true) : undefined);
  const order = tab === 'scheduled' ? [asc(emails.scheduledAt)] : [desc(emails.sentAt)];

  if (q) {
    const hit = await searchEmailIds(userId, statuses, q, offset, limit, starredOnly);
    if (hit) {
      const rows = hit.ids.length
        ? await db.select(listColumns).from(emails).innerJoin(senders, eq(senders.id, emails.senderId)).where(and(base, inArray(emails.id, hit.ids)))
        : [];
      const byId = new Map(rows.map((r) => [r.id, r]));
      const items = hit.ids.flatMap((id) => (byId.has(id) ? [toListItem(byId.get(id)!)] : []));
      return res.json({ items, total: hit.total, page, limit, source: 'elasticsearch' });
    }
  }

  // No query, or Elasticsearch is down: serve from Postgres.
  const where = q
    ? and(base, or(ilike(emails.subject, `%${q}%`), ilike(emails.toEmail, `%${q}%`)))
    : base;
  const [rows, [total]] = await Promise.all([
    db.select(listColumns).from(emails).innerJoin(senders, eq(senders.id, emails.senderId)).where(where).orderBy(...order).limit(limit).offset(offset),
    db.select({ n: count() }).from(emails).where(where),
  ]);
  res.json({ items: rows.map(toListItem), total: total?.n ?? 0, page, limit, source: 'postgres' });
});

emailsRouter.get('/counts', async (req, res) => {
  const rows = await db
    .select({ status: emails.status, n: count() })
    .from(emails)
    .where(eq(emails.userId, uid(req)))
    .groupBy(emails.status);
  const sum = (s: EmailStatus[]) => rows.filter((r) => s.includes(r.status)).reduce((a, r) => a + r.n, 0);
  res.json({ scheduled: sum(TAB_STATUSES.scheduled), sent: sum(TAB_STATUSES.sent) });
});

emailsRouter.get('/:id', async (req, res) => {
  const [row] = await db
    .select({
      id: emails.id,
      toEmail: emails.toEmail,
      subject: emails.subject,
      bodyHtml: emails.bodyHtml,
      status: emails.status,
      scheduledAt: emails.scheduledAt,
      sentAt: emails.sentAt,
      starred: emails.starred,
      previewUrl: emails.previewUrl,
      error: emails.error,
      attempts: emails.attempts,
      senderName: senders.name,
      senderEmail: senders.email,
    })
    .from(emails)
    .innerJoin(senders, eq(senders.id, emails.senderId))
    .where(and(eq(emails.id, req.params.id!), eq(emails.userId, uid(req))));
  if (!row) throw new HttpError(404, 'Email not found');
  res.json(row);
});

emailsRouter.patch('/:id', async (req, res) => {
  const { starred } = z.object({ starred: z.boolean() }).parse(req.body);
  const [row] = await db
    .update(emails)
    .set({ starred })
    .where(and(eq(emails.id, req.params.id!), eq(emails.userId, uid(req))))
    .returning({ id: emails.id, starred: emails.starred });
  if (!row) throw new HttpError(404, 'Email not found');
  await updateIndexedEmail(row.id, { starred: row.starred });
  res.json(row);
});

emailsRouter.delete('/:id', async (req, res) => {
  await deleteEmail(uid(req), req.params.id!);
  res.status(204).end();
});
