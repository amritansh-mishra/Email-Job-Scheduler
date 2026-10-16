/**
 * Schedules N emails for (roughly) the same moment straight through the service
 * layer, to watch throttling + hourly limits in Bull Board and the worker logs.
 *
 *   npm run loadtest -- <userEmail> [count=1000] [hourlyLimit=50]
 *
 * The user must have signed in once (so they have a sender). Recipients are
 * @example.com addresses; Ethereal accepts and captures them, nothing is delivered.
 */
import { eq } from 'drizzle-orm';
import { db, pool, schema } from '../src/db/index.js';
import { emailQueue } from '../src/queue/emailQueue.js';
import { createCampaign } from '../src/services/scheduler.js';

const [userEmail, countArg = '1000', limitArg = '50'] = process.argv.slice(2);
if (!userEmail) {
  console.error('Usage: npm run loadtest -- <userEmail> [count] [hourlyLimit]');
  process.exit(1);
}

const user = await db.query.users.findFirst({ where: eq(schema.users.email, userEmail) });
const sender = user && (await db.query.senders.findFirst({ where: eq(schema.senders.userId, user.id) }));
if (!user || !sender) {
  console.error(`No user/sender for ${userEmail}. Sign in through the app first.`);
  process.exit(1);
}

const count = Number(countArg);
const started = Date.now();
const result = await createCampaign({
  userId: user.id,
  senderId: sender.id,
  subject: `Load test ${new Date().toISOString()}`,
  bodyHtml: '<p>Load test email</p>',
  recipients: Array.from({ length: count }, (_, i) => `lead${i}@example.com`),
  startAt: new Date(),
  delayBetweenSeconds: 0,
  hourlyLimit: Number(limitArg),
});
console.log(`Scheduled ${result.scheduled} emails in ${Date.now() - started}ms`, result);

await emailQueue.close();
await pool.end();
