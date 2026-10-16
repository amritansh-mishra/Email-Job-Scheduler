import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, uid } from '../middleware/auth.js';
import { createCampaign } from '../services/scheduler.js';

export const campaignsRouter = Router();
campaignsRouter.use(requireAuth);

const createSchema = z.object({
  senderId: z.string().uuid('Pick a sender'),
  subject: z.string().trim().min(1, 'Subject is required').max(300),
  bodyHtml: z.string().min(1, 'Body is required').max(200_000),
  recipients: z
    .array(z.string().trim().email('Invalid recipient email'))
    .min(1, 'Add at least one recipient')
    .max(10_000, 'At most 10,000 recipients per campaign'),
  startAt: z.coerce.date(),
  delayBetweenSeconds: z.coerce.number().int().min(0).max(3600).default(0),
  /** 0 = use the server default (MAX_EMAILS_PER_HOUR_PER_SENDER). */
  hourlyLimit: z.coerce.number().int().min(0).max(100_000).default(0),
});

campaignsRouter.post('/', async (req, res) => {
  const input = createSchema.parse(req.body);
  const result = await createCampaign({ ...input, userId: uid(req) });
  res.status(201).json(result);
});
