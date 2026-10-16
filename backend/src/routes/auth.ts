import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env.js';
import { db, schema } from '../db/index.js';
import { logger } from '../lib/logger.js';
import { requireAuth, SESSION_COOKIE, signSession, uid } from '../middleware/auth.js';
import { ensureDefaultSender, upsertGoogleUser } from '../services/users.js';

const STATE_COOKIE = 'oauth_state';
const google = new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI);
const cookieBase = { httpOnly: true, sameSite: 'lax' as const, secure: env.NODE_ENV === 'production' };

export const authRouter = Router();

authRouter.get('/google', (_req, res) => {
  const state = randomBytes(16).toString('hex');
  res.cookie(STATE_COOKIE, state, { ...cookieBase, maxAge: 10 * 60 * 1000 });
  res.redirect(
    google.generateAuthUrl({ scope: ['openid', 'email', 'profile'], state, prompt: 'select_account' }),
  );
});

authRouter.get('/google/callback', async (req, res) => {
  const fail = (reason: string) => res.redirect(`${env.FRONTEND_URL}/login?error=${encodeURIComponent(reason)}`);
  const { code, state } = req.query as { code?: string; state?: string };
  if (!code || !state || state !== req.cookies?.[STATE_COOKIE]) return fail('Login expired, please try again');
  res.clearCookie(STATE_COOKIE);

  try {
    const { tokens } = await google.getToken(code);
    const ticket = await google.verifyIdToken({ idToken: tokens.id_token!, audience: env.GOOGLE_CLIENT_ID });
    const p = ticket.getPayload();
    if (!p?.sub || !p.email) return fail('Google did not return an email');

    const user = await upsertGoogleUser({
      googleId: p.sub,
      email: p.email,
      name: p.name ?? p.email.split('@')[0]!,
      avatarUrl: p.picture,
    });
    await ensureDefaultSender(user);

    res.cookie(SESSION_COOKIE, signSession(user.id), { ...cookieBase, maxAge: 7 * 24 * 3600 * 1000 });
    res.redirect(`${env.FRONTEND_URL}/`);
  } catch (err) {
    logger.error('Google OAuth callback failed', { err: String(err) });
    fail('Google sign-in failed');
  }
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, uid(req)) });
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  res.json({ id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl });
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE);
  res.status(204).end();
});
