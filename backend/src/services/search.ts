import { Client } from '@elastic/elasticsearch';
import { env } from '../config/env.js';
import type { Email, EmailStatus } from '../db/schema.js';
import { htmlToText } from '../lib/html.js';
import { logger } from '../lib/logger.js';

const INDEX = 'emails';
const es = new Client({ node: env.ELASTICSEARCH_URL });

export async function ensureSearchIndex() {
  try {
    if (await es.indices.exists({ index: INDEX })) return;
    await es.indices.create({
      index: INDEX,
      mappings: {
        properties: {
          userId: { type: 'keyword' },
          status: { type: 'keyword' },
          starred: { type: 'boolean' },
          toEmail: { type: 'text', fields: { raw: { type: 'keyword' } } },
          senderEmail: { type: 'text', fields: { raw: { type: 'keyword' } } },
          subject: { type: 'text' },
          body: { type: 'text' },
          scheduledAt: { type: 'date' },
          sentAt: { type: 'date' },
        },
      },
    });
    logger.info('Created Elasticsearch index', { index: INDEX });
  } catch (err) {
    // The API and worker both run this on boot; whichever loses the race sees this.
    if (String(err).includes('resource_already_exists_exception')) return;
    logger.error('Elasticsearch unavailable; search will fall back to Postgres', { err: String(err) });
  }
}

function toDoc(e: Email, senderEmail: string) {
  return {
    userId: e.userId,
    status: e.status,
    starred: e.starred,
    toEmail: e.toEmail,
    senderEmail,
    subject: e.subject,
    body: htmlToText(e.bodyHtml),
    scheduledAt: e.scheduledAt,
    sentAt: e.sentAt,
  };
}

/** Indexing is best-effort: Postgres is the source of truth, ES is a read model. */
export async function indexEmails(rows: Email[], senderEmail: string) {
  if (!rows.length) return;
  try {
    const operations = rows.flatMap((e) => [{ index: { _index: INDEX, _id: e.id } }, toDoc(e, senderEmail)]);
    const res = await es.bulk({ operations, refresh: false });
    if (res.errors) logger.warn('Some emails failed to index');
  } catch (err) {
    logger.error('Bulk index failed', { err: String(err) });
  }
}

export async function updateIndexedEmail(id: string, fields: Partial<{ status: EmailStatus; sentAt: Date | null; scheduledAt: Date; starred: boolean }>) {
  try {
    await es.update({ index: INDEX, id, doc: fields, retry_on_conflict: 3 });
  } catch (err) {
    logger.warn('Index update failed', { id, err: String(err) });
  }
}

export async function removeIndexedEmail(id: string) {
  try {
    await es.delete({ index: INDEX, id });
  } catch {
    /* already gone */
  }
}

/** Returns matching email ids in relevance order, or null if ES is unavailable. */
export async function searchEmailIds(
  userId: string,
  statuses: EmailStatus[],
  q: string,
  from: number,
  size: number,
  starredOnly = false,
) {
  try {
    const res = await es.search<unknown>({
      index: INDEX,
      from,
      size,
      _source: false,
      track_total_hits: true,
      query: {
        bool: {
          filter: [
            { term: { userId } },
            { terms: { status: statuses } },
            ...(starredOnly ? [{ term: { starred: true } }] : []),
          ],
          should: [
            { multi_match: { query: q, fields: ['subject^3', 'toEmail^2', 'senderEmail', 'body'], fuzziness: 'AUTO' } },
            { multi_match: { query: q, fields: ['subject^3', 'toEmail^2', 'senderEmail', 'body'], type: 'phrase_prefix' } },
          ],
          minimum_should_match: 1,
        },
      },
    });
    const total = typeof res.hits.total === 'number' ? res.hits.total : (res.hits.total?.value ?? 0);
    return { ids: res.hits.hits.map((h) => h._id!), total };
  } catch (err) {
    logger.warn('Elasticsearch search failed, falling back to Postgres', { err: String(err) });
    return null;
  }
}
