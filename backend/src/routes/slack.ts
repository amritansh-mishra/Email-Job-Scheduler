import { Router } from 'express';
import { eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { db, schema } from '../db/index.js';
import { HttpError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { requireAuth, uid } from '../middleware/auth.js';
import { exchangeSlackCode, notifySlack, slackAuthorizeUrl, slackConfigured } from '../services/slack.js';

export const slackRouter = Router();

slackRouter.get('/', requireAuth, async (req, res) => {
  const conn = await db.query.slackConnections.findFirst({ where: eq(schema.slackConnections.userId, uid(req)) });
  res.json({
    configured: slackConfigured(),
    connected: Boolean(conn),
    teamName: conn?.teamName ?? null,
    channel: conn?.channel ?? null,
  });
});

slackRouter.get('/install', requireAuth, (req, res) => {
  if (!slackConfigured()) throw new HttpError(503, 'Slack is not configured on the server');
  // The callback may arrive on a different host (HTTPS tunnel) without our session
  // cookie, so the user id travels in a short-lived signed state instead.
  const state = jwt.sign({ uid: uid(req), purpose: 'slack' }, env.JWT_SECRET, { expiresIn: '10m' });
  res.redirect(slackAuthorizeUrl(state));
});

slackRouter.get('/oauth/callback', async (req, res) => {
  const done = (status: string) => res.redirect(`${env.FRONTEND_URL}/?slack=${status}`);
  const { code, state, error } = req.query as Record<string, string | undefined>;
  if (error || !code || !state) return done('cancelled');

  let userId: string;
  try {
    const payload = jwt.verify(state, env.JWT_SECRET) as { uid: string; purpose: string };
    if (payload.purpose !== 'slack') throw new Error('wrong purpose');
    userId = payload.uid;
  } catch {
    return done('expired');
  }

  try {
    const conn = await exchangeSlackCode(code);
    await db
      .insert(schema.slackConnections)
      .values({ userId, ...conn })
      .onConflictDoUpdate({ target: schema.slackConnections.userId, set: { ...conn, createdAt: new Date() } });
    await notifySlack(userId, ':white_check_mark: ReachInbox is connected. You will be notified here when a sender hits its hourly limit.');
    done('connected');
  } catch (err) {
    logger.error('Slack OAuth callback failed', { err: String(err) });
    done('error');
  }
});

slackRouter.post('/test', requireAuth, async (req, res) => {
  const ok = await notifySlack(uid(req), ':bell: Test notification from ReachInbox.');
  if (!ok) throw new HttpError(400, 'Slack is not connected');
  res.json({ ok });
});

slackRouter.delete('/', requireAuth, async (req, res) => {
  await db.delete(schema.slackConnections).where(eq(schema.slackConnections.userId, uid(req)));
  res.status(204).end();
});
