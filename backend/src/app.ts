import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import cookieParser from 'cookie-parser';
import express, { type RequestHandler } from 'express';
import { env } from './config/env.js';
import { errorHandler } from './middleware/error.js';
import { emailQueue } from './queue/emailQueue.js';
import { authRouter } from './routes/auth.js';
import { campaignsRouter } from './routes/campaigns.js';
import { emailsRouter } from './routes/emails.js';
import { sendersRouter } from './routes/senders.js';
import { slackRouter } from './routes/slack.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '5mb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRouter);
  app.use('/api/senders', sendersRouter);
  app.use('/api/campaigns', campaignsRouter);
  app.use('/api/emails', emailsRouter);
  app.use('/api/slack', slackRouter);

  // Live queue dashboard (Bull Board).
  const board = new ExpressAdapter();
  board.setBasePath('/admin/queues');
  createBullBoard({ queues: [new BullMQAdapter(emailQueue)], serverAdapter: board });
  app.use('/admin/queues', basicAuth(), board.getRouter());

  app.use(errorHandler);
  return app;
}

/** Optional basic auth for Bull Board; open when BULL_BOARD_USER is unset (local dev). */
function basicAuth(): RequestHandler {
  return (req, res, next) => {
    if (!env.BULL_BOARD_USER) return next();
    const [user, pass] = Buffer.from((req.headers.authorization ?? '').replace(/^Basic /, ''), 'base64')
      .toString()
      .split(':');
    if (user === env.BULL_BOARD_USER && pass === env.BULL_BOARD_PASS) return next();
    res.set('WWW-Authenticate', 'Basic realm="queues"').status(401).end();
  };
}
