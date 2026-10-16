import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const emailStatus = pgEnum('email_status', [
  'scheduled',
  'sending',
  'sent',
  'failed',
  'cancelled',
]);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  googleId: text('google_id').notNull().unique(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** An SMTP identity emails are sent from. In this project, each is an Ethereal test account. */
export const senders = pgTable('senders', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  email: text('email').notNull(),
  smtpHost: text('smtp_host').notNull(),
  smtpPort: integer('smtp_port').notNull(),
  smtpSecure: boolean('smtp_secure').notNull().default(false),
  smtpUser: text('smtp_user').notNull(),
  smtpPass: text('smtp_pass').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** One "Compose" submission: a subject/body sent to many leads. */
export const campaigns = pgTable('campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  senderId: uuid('sender_id').notNull().references(() => senders.id, { onDelete: 'cascade' }),
  subject: text('subject').notNull(),
  bodyHtml: text('body_html').notNull(),
  startAt: timestamp('start_at', { withTimezone: true }).notNull(),
  delayBetweenMs: integer('delay_between_ms').notNull(),
  hourlyLimit: integer('hourly_limit').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** One row per recipient. The row id doubles as the BullMQ job id. */
export const emails = pgTable(
  'emails',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id').notNull().references(() => senders.id, { onDelete: 'cascade' }),
    toEmail: text('to_email').notNull(),
    subject: text('subject').notNull(),
    bodyHtml: text('body_html').notNull(),
    status: emailStatus('status').notNull().default('scheduled'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    messageId: text('message_id'),
    previewUrl: text('preview_url'),
    error: text('error'),
    starred: boolean('starred').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // A lead appears at most once per campaign, even if the CSV has duplicates.
    uniqueIndex('emails_campaign_recipient_uq').on(t.campaignId, t.toEmail),
    index('emails_user_status_idx').on(t.userId, t.status, t.scheduledAt),
  ],
);

export const slackConnections = pgTable('slack_connections', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  teamId: text('team_id').notNull(),
  teamName: text('team_name').notNull(),
  channel: text('channel').notNull(),
  webhookUrl: text('webhook_url').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Sender = typeof senders.$inferSelect;
export type Email = typeof emails.$inferSelect;
export type EmailStatus = (typeof emailStatus.enumValues)[number];
