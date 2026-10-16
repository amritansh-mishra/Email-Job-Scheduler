import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { ensureSearchIndex } from './services/search.js';

await ensureSearchIndex();

createApp().listen(env.PORT, () => {
  logger.info(`API listening on http://localhost:${env.PORT}`);
  logger.info(`Bull Board at http://localhost:${env.PORT}/admin/queues`);
});
