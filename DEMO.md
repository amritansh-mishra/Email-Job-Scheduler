# Demo Script (≤ 5 minutes)

A step-by-step script for recording the submission video. It covers everything the assignment asks to see: creating scheduled emails, the Scheduled and Sent views, a **restart scenario**, and (bonus) **rate limiting under load**, plus the Slack alert, search and Bull Board.

---

## Before recording

### 1. Start everything in separate terminals

Use separate terminals, not `npm run dev`, so you can stop **only the worker** during the restart scene.

| Terminal | Command |
|---|---|
| 1 · Infra | `npm run infra:up` (once; wait until Postgres, Redis and Elasticsearch are up) |
| 2 · API | `npm run dev --prefix backend` |
| 3 · Worker | `npm run dev:worker --prefix backend` ← this is the one you'll stop |
| 4 · Web | `npm run dev --prefix frontend` |
| 5 · Tunnel | `cloudflared tunnel --url http://localhost:4000` (Slack only) |

### 2. Slack tunnel check

The free cloudflared address changes every time it restarts. If it changed, update it in both places, then restart the API (terminal 2):

- api.slack.com → your app → **OAuth & Permissions → Redirect URLs**: `https://<tunnel>/api/slack/oauth/callback`
- `backend/.env` → `SLACK_REDIRECT_URI=https://<tunnel>/api/slack/oauth/callback`

### 3. Start from a clean slate (optional)

Clears old test emails and rate-limit counters so the numbers on screen are easy to follow:

```bash
docker compose exec -T postgres psql -U reachinbox -c "truncate emails, campaigns cascade"
docker compose exec -T redis redis-cli --scan --pattern 'rl:*' | xargs -r docker compose exec -T redis redis-cli del
curl -s -X POST "localhost:9200/emails/_delete_by_query?refresh=true" -H 'content-type: application/json' -d '{"query":{"match_all":{}}}'
```

### 4. Arrange the screen

- **Browser tab 1:** http://localhost:5173 (logged out)
- **Browser tab 2:** http://localhost:5173/admin/queues (Bull Board)
- **Slack:** open on the channel you connected
- **Worker terminal:** visible, with a large font
- Have `demo/leads.csv` ready to upload (8 leads plus 1 duplicate row)

---

## The script

### Scene 1 · Login — *0:00 → 0:30*

> "This is a full-stack email scheduler: Express, BullMQ on Redis, Postgres, and a React dashboard built from the Figma."

1. On the login screen, click **Login with Google** and pick your account.
2. Point at the sidebar: **name, email, avatar**.
3. Open the user dropdown to show **Logout** (don't click it).
4. Point at **Slack alerts → Connected to #channel**.

> "Login is real Google OAuth. On first login, the backend creates an Ethereal SMTP account to use as my sender."

### Scene 2 · Compose & schedule — *0:30 → 1:30*

1. Click **Compose**.
2. **From:** open the dropdown to show the Ethereal sender and **Add sender** ("each sender gets its own rate limit").
3. **To:** click **Upload List** and choose `demo/leads.csv`.
   > "It finds every email address in the file. The duplicate row is removed: 9 rows, **8 addresses detected**."

   Point at the green chips and the **+5** chip.
4. **Subject:** `Meeting follow-up`
5. **Body:** type a short message, then use **Bold**, a **bullet list** and a **quote** from the toolbar.
6. **Delay between 2 emails:** `5`, **Hourly Limit:** `3`
   > "Delay is in seconds between sends. The hourly limit is per sender, enforced in Redis."
7. Click the **clock** icon. Show the presets, then use **Pick date & time** to choose a time **about 1 minute from now**. Click **Done**.
8. The button now reads **Send Later**. Click it. A toast shows *"Scheduled 8 emails"*.

### Scene 3 · Scheduled view, search, Bull Board — *1:30 → 2:15*

1. The **Scheduled** tab shows 8 rows with orange time labels 5 seconds apart, and the sidebar count shows **8**.
2. Type **`folow`** (misspelled) in the search box. Results still appear.
   > "Search runs on Elasticsearch with fuzzy matching. If Elasticsearch is down, it falls back to Postgres."

   Clear the search.
3. Switch to the **Bull Board** tab and open **Delayed**: there are 8 jobs.
   > "Each email is one BullMQ delayed job whose job id is the email's database id, so it can never be queued twice. No cron anywhere."

### Scene 4 · Restart scenario ⭐ — *2:15 → 3:30*

> "Now the important part: what happens if the server goes down before the send time?"

1. Go to the **worker terminal** and press **Ctrl+C**. The log shows *"letting in-flight sends finish…"*.
2. *(Optional, stronger)* Restart Redis too: `docker compose restart redis`
   > "Redis saves to disk (AOF), so the delayed jobs survive even a Redis restart."
3. Wait until the scheduled time **passes**. Show the Scheduled tab: the emails are still waiting and nothing has been lost.
4. Start the worker again: `npm run dev:worker --prefix backend`
5. Point at the log line: **`Reconciled scheduled emails with queue { pending: 8 }`**
   > "On startup the worker checks the database against the queue and re-adds any missing jobs. Because of the job id, nothing is duplicated."
6. Watch the first emails move from **Scheduled → Sent** (the list refreshes every 5 seconds).

### Scene 5 · Rate limit + Slack ⭐ — *3:30 → 4:30*

1. After **3** emails are sent, the remaining 5 **jump to the next hour** in the Scheduled tab, in the same order and still 5 seconds apart.
   > "The hourly limit is 3. Extra emails are never dropped; they move to the next hour, keeping their order."
2. Switch to **Slack**: the *"Hourly sending limit reached"* alert has just arrived.
   > "This is a live Slack webhook call, sent the moment the limit is hit, once per sender per hour."
3. Open the **Sent** tab and click an email:
   - Point at the status and sent time.
   - Click **"Delivered to Ethereal: view the captured message"** to show the actual email captured by Ethereal.
4. Prove there were no duplicates. In a terminal:
   ```bash
   docker compose exec -T postgres psql -U reachinbox -c "select to_email, status, attempts from emails order by scheduled_at"
   ```
   > "Every sent email has **attempts = 1**. Nothing was re-sent after the restart." 

### Scene 6 · Under load (bonus) + wrap-up — *4:30 → 5:00*

1. In a spare terminal:
   ```bash
   npm run loadtest --prefix backend -- <your-google-email> 1000 50
   ```
   > "1000 emails at once, limit 50 per hour: inserted and queued in batches."
2. Switch to **Bull Board**. The Delayed count shows 1000, and the Completed count increases steadily, 2 seconds apart.
3. Briefly scroll the **README → Architecture** section:
   > "Postgres is the source of truth, Redis saves jobs to disk, the worker reconciles the queue on startup, an atomic claim makes sends idempotent, and one Redis Lua script enforces concurrency, delay and hourly limits across any number of workers."

---

## Talking points if you have extra seconds

- **Concurrency:** `WORKER_CONCURRENCY=5`. Running parallel jobs is safe because of the atomic `scheduled → sending` claim in Postgres.
- **Min delay:** at least 2 seconds between sends per sender (`MIN_DELAY_BETWEEN_SENDS_MS`), configurable in `.env`.
- **Crash during an SMTP send:** the email is marked *failed* instead of retried. The system delivers at most once and never sends a duplicate.
- **Slack disconnected:** a limit hit simply doesn't notify. Reconnecting works immediately, without restarting anything.

## Troubleshooting during recording

| Symptom | Fix |
|---|---|
| Slack "redirect_uri did not match" | The tunnel address changed. Update Slack's redirect URL and `.env`, then restart the API. |
| Emails stay in Scheduled after the time passes | The worker isn't running (terminal 3). |
| Rate limit triggers immediately | There are leftover counters from earlier tests. Run the clean-slate commands. |
| Search returns nothing for a brand-new email | Elasticsearch takes about 1 second to make new data searchable. Wait a moment. |

After recording, **cancel the load test's remaining emails** if you don't want 1000 emails trickling out (they only reach Ethereal). Mark them cancelled in Postgres; otherwise the worker would re-queue them on its next startup:

```bash
docker compose exec -T postgres psql -U reachinbox -c "update emails set status='cancelled' where status='scheduled' and subject like 'Load test%'"
```

The worker skips cancelled emails when their jobs come up.
