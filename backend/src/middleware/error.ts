import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: err.issues[0]?.message ?? 'Invalid request', issues: err.issues });
  }
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  logger.error('Unhandled error', { err: err instanceof Error ? err.stack : String(err) });
  res.status(500).json({ error: 'Something went wrong' });
}
