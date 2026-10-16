# ReachInbox: Email Job Scheduler

A full-stack email scheduler. Emails are accepted through an API, stored in Postgres, and scheduled as **BullMQ delayed jobs** on Redis (no cron). They are sent through **Ethereal** (fake SMTP), indexed in **Elasticsearch** for search, and shown on a React dashboard built from the Figma design.

```
EJS/
├── docker-compose.yml   Postgres, Redis (AOF), Elasticsearch
├── backend/             Express + TypeScript API and BullMQ worker
│   ├── src/
│   │   ├── config/      env validation (zod)
│   │   ├── db/          Drizzle schema, client, migrator
│   │   ├── queue/       BullMQ queue + Redis rate-limit gate (Lua)
│   │   ├── services/    scheduler, mailer, search, slack, users
│   │   ├── routes/      auth, senders, campaigns, emails, slack
│   │   ├── server.ts    API process (+ Bull Board at /admin/queues)
│   │   └── worker.ts    worker process
│   ├── drizzle/         SQL migrations
│   └── scripts/loadtest.ts
├── frontend/            Vite + React + TypeScript + Tailwind
│   └── src/{pages,components/{ui,layout,email,compose},hooks,lib}
└── design/NOTES.md      Figma transcription
```

---

## Running it

**Prerequisites:** Node 20+ and Docker Desktop.

```bash
npm run setup                    # install root, backend and frontend deps
cp backend/.env.example backend/.env   # then fill in the values (see below)
npm run infra:up                 # Postgres :5433, Redis :6379, Elasticsearch :9200
npm run db:migrate               # create tables
npm run dev                      # API :4000, worker, web :5173 (all three)
```

Open http://localhost:5173. Bull Board (the live queue dashboard) is at http://localhost:5173/admin/queues, or directly at http://localhost:4000/admin/queues.

To run the processes separately (useful for the restart demo):

```bash
npm run dev --prefix backend          # API
npm run dev:worker --prefix backend   # worker
npm run dev --prefix frontend         # web
```

### Environment variables (`backend/.env`)

| Variable | Purpose |
|---|---|
| `JWT_SECRET` | Signs session cookies and OAuth state. Use a long random string. |
| `DATABASE_URL`, `REDIS_URL`, `ELASTICSEARCH_URL` | Already match `docker-compose.yml`. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth client (see below). |
| `GOOGLE_REDIRECT_URI` | `http://localhost:5173/api/auth/google/callback` |
| `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_REDIRECT_URI` | Slack app (see below). |
| `WORKER_CONCURRENCY` | Jobs processed in parallel per worker process (default `5`). |
| `MIN_DELAY_BETWEEN_SENDS_MS` | Minimum gap between two sends from the same sender (default `2000`). |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | Hourly cap per sender (default `200`). |
| `SEND_MAX_ATTEMPTS` | SMTP attempts before an email is marked failed (default `3`). |
| `BULL_BOARD_USER` / `BULL_BOARD_PASS` | Optional basic auth for Bull Board. |

### Ethereal Email

No setup needed. On a user's first Google login, the backend calls `nodemailer.createTestAccount()` and saves the account as that user's first **sender**. Use **From → "Add sender"** on the Compose screen to create more senders (each is a new Ethereal account). Rate limits apply per sender.

Ethereal captures emails instead of delivering them. Every sent email's detail page links to the captured message (**"Delivered to Ethereal: view the captured message"**). The link is also printed in the worker log.

### Google OAuth

1. Google Cloud Console → APIs & Services → Credentials → **Create OAuth client ID** (Web application).
2. Authorized JavaScript origin: `http://localhost:5173`
3. Authorized redirect URI: `http://localhost:5173/api/auth/google/callback`
4. Copy the client ID and secret into `.env`.

The callback goes through the Vite proxy, so the session cookie is first-party to the app.

### Slack OAuth

1. https://api.slack.com/apps → **Create New App** → From scratch.
2. **OAuth & Permissions** → Bot Token Scopes: add `incoming-webhook`.
3. Slack only accepts HTTPS redirect URLs, so expose the backend through a tunnel:
   `cloudflared tunnel --url http://localhost:4000` (or `ngrok http 4000`).
4. Add the redirect URL `https://<tunnel-host>/api/slack/oauth/callback` and set `SLACK_REDIRECT_URI` to the same value.
5. Copy the client ID and secret into `.env` and restart the API.

In the dashboard, open the sidebar → **Slack alerts → Connect Slack**. This runs the real authorize flow; you choose a channel, and the backend saves the incoming-webhook URL for your user. A confirmation message is posted right away, and the **Test** button posts another.

---

## Architecture

```
 React (5173) ──/api──▶ Express API ──insert──▶ Postgres (source of truth)
                           │                         ▲
                           │ addBulk(jobId=email.id) │ claim / status updates
                           ▼                         │
                     Redis (BullMQ, AOF) ──▶ Worker(s) ──SMTP──▶ Ethereal
                           ▲   rate-limit gate (Lua)  │
                           └──────────────────────────┤──▶ Elasticsearch (search index)
                                                      └──▶ Slack webhook (limit hit)
```

### How scheduling works

1. `POST /api/campaigns` receives a sender, subject, HTML body, list of recipients, start time, delay between emails and hourly limit.
2. In one Postgres transaction, it inserts a `campaigns` row and one `emails` row per recipient. Duplicates are removed, and a unique index on `(campaign_id, to_email)` enforces it. Each row's `scheduled_at` is `start + i × gap`, where `gap = max(campaign delay, MIN_DELAY_BETWEEN_SENDS_MS)`.
3. **After the commit**, each email gets a BullMQ job via `addBulk` (batches of 500), with `jobId = email.id` and `delay = scheduled_at − now`. Enqueueing after the commit means a worker never sees a job whose row isn't visible yet.
4. The emails are bulk-indexed into Elasticsearch.

BullMQ keeps delayed jobs in a Redis sorted set and moves each one to *waiting* when it becomes due. The worker picks it up from there. There is no cron or polling loop anywhere.

### Persistence across restarts

- **Redis runs with AOF** (`appendonly yes`, `appendfsync everysec`) and `noeviction`. Delayed jobs survive a Redis restart, and Redis never evicts job keys.
- **Postgres is the source of truth.** When the worker starts, it runs `reconcileScheduledJobs()`: it re-adds a job for every email still marked `scheduled`. Because the job id is the email id, BullMQ ignores the add when the job already exists. This makes reconciliation safe to run on every boot. It also repairs a wiped Redis, or a crash between the database commit and the enqueue.
- On a restart, nothing starts over. Already-sent emails stay `sent`, and their jobs either completed or are skipped. Future emails keep their original `scheduled_at`, so they still go out at the right time. Emails that came due while the worker was down are sent as soon as it returns, still subject to the rate limits.
- On `SIGINT`/`SIGTERM`, the worker calls `worker.close()` so in-flight sends finish before it exits.

### Idempotency (never send twice)

1. **One job per email:** `jobId = email.id`, so the same email can't be enqueued twice.
2. **Status check:** the worker does nothing if the row is already `sent`, `failed` or `cancelled`.
3. **Atomic claim:** `UPDATE emails SET status='sending' WHERE id=$1 AND status='scheduled' RETURNING *`. Only one worker can win, even if two pick up the same job.
4. **Crash during SMTP:** if a job finds its email still in `sending` (the previous attempt died partway through), we can't know whether Ethereal accepted it. We choose **at-most-once** delivery: the email is marked `failed` with a clear reason instead of being retried. The risk window is only the length of one SMTP call.
5. A **deterministic `Message-ID`** (`<email-id@reachinbox.local>`) makes any accidental duplicate easy to spot downstream.

SMTP errors (rejected before acceptance) are safe to retry. The row goes back to `scheduled`, and BullMQ retries with exponential backoff up to `SEND_MAX_ATTEMPTS` times. After the last attempt, the email is marked `failed`.

### Rate limiting and concurrency

All throttling runs in **one Lua script in Redis** (`backend/src/queue/rateLimiter.ts`). Redis runs it atomically, so it's safe across any number of worker processes or machines. It also uses Redis's clock (`TIME`), so instances with different clocks still agree on hour windows. Nothing is counted in memory.

| Concern | Mechanism |
|---|---|
| **Concurrency** | `new Worker(..., { concurrency: WORKER_CONCURRENCY })`. Parallel jobs are safe because of the atomic claim and the atomic gate. Run more worker processes to scale out. |
| **Delay between emails** | **Min 2 seconds between sends per sender** (`MIN_DELAY_BETWEEN_SENDS_MS=2000`). Enforced in two places: campaigns are spaced at least that far apart when scheduled, and at send time a Redis key `rl:{sender}:next` holds the earliest time the next send may start. A job that arrives too early **reserves** the next free slot, then is moved to that time (`moveToDelayed` + `DelayedError`, which doesn't count as a failed attempt). Each job is postponed at most once, so a burst doesn't repeatedly reshuffle the queue. The gap is measured between send **starts**. A slow SMTP handshake (Ethereal's first connection can take about 3 seconds) can make completion times closer together; with a warm connection they are 2 seconds apart too. |
| **Emails per hour** | Per sender. The counter `rl:{sender}:h:{hourWindow}` is checked and incremented in the same script. The limit is the campaign's **Hourly Limit**, capped by `MAX_EMAILS_PER_HOUR_PER_SENDER`; 0 means "use the server default". |
| **When the limit is reached** | Jobs are never dropped or failed. An over-limit job is moved forward by **whole hours from its own scheduled time** until it lands in the next window (for example 16:20:04 becomes 17:20:04). Overflow jobs therefore **keep their original order and spacing exactly**, even when parallel workers reach the limit in a random order. The row's `scheduled_at` is updated so the dashboard shows the new time. |
| **Slack alert** | The first job to hit the limit in a window sets `rl:{sender}:notified:{window}` (`SET NX`), and that job sends the Slack message: one alert per sender per hour, at the moment the limit is hit. The Slack connection is looked up from the database on every alert. If none exists, nothing is sent and nothing breaks. Connecting later works immediately, without a redeploy. A revoked webhook (404/410) is removed automatically. |

**Behaviour under load (1000+ emails at roughly the same time).** The API inserts in chunks of 1000 and enqueues in batches of 500. Within one campaign, sends are spaced at least 2 seconds apart when scheduled. When several campaigns share a sender, the send-time gate spaces them out through slot reservations, and once a sender reaches its hourly limit, the rest roll into following hours in their original order. Throughput per sender is therefore `min(3600 / 2s = 1800, hourly limit)` emails per hour. Using more senders increases the total. To watch it happen:

```bash
# sign in once first, then (with the API and worker running):
npm run loadtest --prefix backend -- you@gmail.com 1000 50
```

This schedules 1000 emails with a limit of 50 per hour. In Bull Board you can watch jobs move from delayed to active to completed, while the rest are pushed into later hours. If Slack is connected, the alert arrives when the 50th email goes out.

**Trade-offs**
- Different campaigns from the same sender share one hourly counter. Each job is checked against its own campaign's limit, so the strictest active campaign effectively controls the pace.
- The hourly counter is incremented when a send is *attempted*. A failed SMTP send still uses up a slot, which errs on the side of sending less.
- Hour windows are fixed UTC hours, not a rolling 60 minutes. That's simpler and makes it obvious when the next window opens.
- After downtime, overdue jobs are picked up `WORKER_CONCURRENCY` at a time and race for the gate, so within one such batch the send order can be off by a few places. Overflow into later hours always keeps the exact original order. In normal operation emails are already spaced out and arrive one at a time, so order is preserved.

### Search

Postgres is the source of truth and Elasticsearch is a search index kept alongside it. Emails are indexed when scheduled and updated whenever their status, time or star changes. The search box queries `subject^3, toEmail^2, senderEmail, body` with fuzzy and prefix matching, filtered by user, tab and starred. If Elasticsearch is down, the API falls back to a Postgres `ILIKE` search, and the response's `source` field shows which one answered.

---

## API

| Method | Path | |
|---|---|---|
| GET | `/api/auth/google` → `/api/auth/google/callback` | Google OAuth |
| GET / POST | `/api/auth/me`, `/api/auth/logout` | session |
| GET / POST | `/api/senders` | list or add Ethereal senders |
| POST | `/api/campaigns` | schedule `{senderId, subject, bodyHtml, recipients[], startAt, delayBetweenSeconds, hourlyLimit}` |
| GET | `/api/emails?tab=scheduled\|sent&q=&page=&starred=` | list and search |
| GET | `/api/emails/counts` | sidebar counts |
| GET / PATCH / DELETE | `/api/emails/:id` | view, star, cancel or delete |
| GET / DELETE | `/api/slack` | Slack status, disconnect |
| GET | `/api/slack/install` → `/api/slack/oauth/callback` | Slack OAuth |
| POST | `/api/slack/test` | send a test message |
| GET | `/admin/queues` | Bull Board |

---

## Features implemented

**Backend**
- **Scheduler:** BullMQ delayed jobs, one per email (`jobId = email id`), no cron.
- **Persistence:** Postgres is the source of truth; Redis uses AOF; queue and database are reconciled at boot; graceful shutdown.
- **Idempotency:** unique job ids, status check, atomic `scheduled → sending` claim, at-most-once handling of crashes.
- **Rate limiting:** per-sender hourly counters in Redis, with overflow rescheduled to the next hour in order.
- **Delay between sends:** per-sender minimum gap with slot reservation.
- **Concurrency:** configurable worker concurrency; safe to run several worker processes.
- **Multiple senders:** each one is an Ethereal SMTP account.
- **Elasticsearch search**, with a Postgres fallback.
- **Bull Board** live queue dashboard.
- **Slack OAuth** (incoming webhook), live alert on limit hit, test button, disconnect/reconnect without a redeploy.
- Retries with exponential backoff, failed status with the reason, cancel a scheduled email.

**Frontend** (built from the Figma)
- **Login:** real Google OAuth.
- **Dashboard:** header with name, email and avatar; logout menu.
- **Scheduled and Sent tabs:** inbox rows showing recipient, status pill or scheduled time, subject and preview, sent time and star.
- Loading skeletons, empty states, error states with retry, toasts.
- **Search** (Elasticsearch), starred filter, refresh, pagination; refreshes every 5 seconds so you can watch emails move from Scheduled to Sent.
- **Compose:** sender picker (with "add sender"), recipient chips, CSV/TXT upload showing the number of addresses detected, subject, delay between emails, hourly limit, rich-text editor matching the Figma toolbar, and a Send Later picker with presets.
- **Email detail:** sanitized HTML body, status note, link to the captured message on Ethereal, star, delete or cancel.
- Slack connect card in the sidebar.

## Assumptions and shortcuts

- The email/password form on the login screen is shown for fidelity to the Figma but isn't wired up. The assignment requires Google login only.
- Attachments, and the Archive button on the detail view, are left out (not in scope).
- Each user's senders are Ethereal accounts created automatically. Using a real SMTP provider would only mean adding rows to `senders`.
- Recipients are stored by email address; the "To" column shows the address, since the CSV only has to contain emails.
- Slack uses the `incoming-webhook` scope (one channel chosen during OAuth) instead of a bot token, which is the simplest real OAuth flow that supports posting.
