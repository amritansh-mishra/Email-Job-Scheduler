import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import type { User } from '../db/schema.js';
import { logger } from '../lib/logger.js';
import { createEtherealAccount } from './mailer.js';

export async function upsertGoogleUser(profile: { googleId: string; email: string; name: string; avatarUrl?: string }) {
  const [user] = await db
    .insert(schema.users)
    .values(profile)
    .onConflictDoUpdate({
      target: schema.users.googleId,
      set: { email: profile.email, name: profile.name, avatarUrl: profile.avatarUrl },
    })
    .returning();
  return user!;
}

export async function createSender(user: Pick<User, 'id' | 'name'>, name?: string) {
  const account = await createEtherealAccount();
  const [sender] = await db
    .insert(schema.senders)
    .values({ userId: user.id, name: name || user.name, ...account })
    .returning();
  return sender!;
}

/** Gives a new user one Ethereal sender so they can schedule right away. */
export async function ensureDefaultSender(user: User) {
  const existing = await db.query.senders.findFirst({ where: eq(schema.senders.userId, user.id) });
  if (existing) return;
  try {
    await createSender(user);
  } catch (err) {
    logger.error('Could not create Ethereal sender at login', { userId: user.id, err: String(err) });
  }
}
