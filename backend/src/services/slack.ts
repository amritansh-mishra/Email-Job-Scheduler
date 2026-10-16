import { eq } from 'drizzle-orm';
import { env } from '../config/env.js';
import { db, schema } from '../db/index.js';
import { logger } from '../lib/logger.js';

export function slackConfigured() {
  return Boolean(env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET && env.SLACK_REDIRECT_URI);
}

export function slackAuthorizeUrl(state: string) {
  const url = new URL('https://slack.com/oauth/v2/authorize');
  url.searchParams.set('client_id', env.SLACK_CLIENT_ID);
  url.searchParams.set('scope', 'incoming-webhook');
  url.searchParams.set('redirect_uri', env.SLACK_REDIRECT_URI);
  url.searchParams.set('state', state);
  return url.toString();
}

interface SlackOAuthResponse {
  ok: boolean;
  error?: string;
  team?: { id: string; name: string };
  incoming_webhook?: { url: string; channel: string };
}

export async function exchangeSlackCode(code: string) {
  const res = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.SLACK_CLIENT_ID,
      client_secret: env.SLACK_CLIENT_SECRET,
      code,
      redirect_uri: env.SLACK_REDIRECT_URI,
    }),
  });
  const data = (await res.json()) as SlackOAuthResponse;
  if (!data.ok || !data.incoming_webhook || !data.team) {
    throw new Error(`Slack OAuth failed: ${data.error ?? 'missing incoming_webhook'}`);
  }
  return {
    teamId: data.team.id,
    teamName: data.team.name,
    channel: data.incoming_webhook.channel,
    webhookUrl: data.incoming_webhook.url,
  };
}

/**
 * Posts to the user's connected Slack channel. The connection is read from the
 * DB on every call, so connecting/disconnecting takes effect without a restart.
 * No connection -> silently does nothing. Never throws.
 */
export async function notifySlack(userId: string, text: string) {
  try {
    const conn = await db.query.slackConnections.findFirst({ where: eq(schema.slackConnections.userId, userId) });
    if (!conn) return false;
    const res = await fetch(conn.webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (res.status === 404 || res.status === 410 || res.status === 403) {
      // Webhook revoked from the Slack side: drop it so the UI shows "Connect Slack" again.
      await db.delete(schema.slackConnections).where(eq(schema.slackConnections.userId, userId));
      logger.warn('Slack webhook revoked, connection removed', { userId });
      return false;
    }
    if (!res.ok) throw new Error(`Slack webhook ${res.status}: ${await res.text()}`);
    return true;
  } catch (err) {
    logger.error('Slack notification failed', { userId, err: String(err) });
    return false;
  }
}
