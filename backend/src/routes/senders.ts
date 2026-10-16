import { Router } from 'express';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../db/index.js';
import { HttpError } from '../lib/errors.js';
import { requireAuth, uid } from '../middleware/auth.js';
import { createSender } from '../services/users.js';

export const sendersRouter = Router();
sendersRouter.use(requireAuth);

const publicFields = {
  id: schema.senders.id,
  name: schema.senders.name,
  email: schema.senders.email,
  createdAt: schema.senders.createdAt,
};

sendersRouter.get('/', async (req, res) => {
  const rows = await db
    .select(publicFields)
    .from(schema.senders)
    .where(eq(schema.senders.userId, uid(req)))
    .orderBy(asc(schema.senders.createdAt));
  res.json(rows);
});

/** Adds another sender backed by a freshly created Ethereal account. */
sendersRouter.post('/', async (req, res) => {
  const { name } = z.object({ name: z.string().trim().max(100).optional() }).parse(req.body ?? {});
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, uid(req)) });
  if (!user) throw new HttpError(401, 'Not signed in');
  const s = await createSender(user, name);
  res.status(201).json({ id: s.id, name: s.name, email: s.email, createdAt: s.createdAt });
});
