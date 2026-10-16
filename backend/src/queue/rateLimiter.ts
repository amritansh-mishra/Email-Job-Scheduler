import type { Result } from 'ioredis';
import { env } from '../config/env.js';
import { redis } from '../lib/redis.js';

/**
 * One atomic gate per send attempt, run inside Redis so it is safe across any
 * number of worker processes. It uses Redis' clock, so instances with skewed
 * clocks still agree on the hour window.
 *
 * Returns one of:
 *   {0}                         -> allowed; the hourly counter was incremented
 *   {1, slotMs}                 -> too soon after the previous send from this sender;
 *                                  a slot at slotMs was reserved for this job
 *   {2, targetMs, firstHit, ms} -> hourly limit reached; the job moves to targetMs in
 *                                  a later window. firstHit=1 for the first job to hit
 *                                  the limit in this window (used for Slack)
 *   {3, targetMs, 0, ms}        -> the sender has a backlog from an earlier limit hit
 *                                  and this job is scheduled after it, so it moves
 *                                  back by the same amount to stay behind it
 *
 * Order preservation: when a sender hits its limit, the overflowing job is shifted
 * by whole hours (`ms`) from its original time. Every later job of that sender
 * (by original time) that would otherwise run before the backlog drains is shifted
 * by the same `ms`. The whole remaining stream therefore moves as one block,
 * keeping its exact order and spacing - including jobs that were originally
 * scheduled in the next hour and would otherwise overtake the backlog.
 *
 * Keys (all prefixed rl:{senderId}):
 *   :h:{window}         sends counted in that hour window
 *   :next               earliest time the next send may start (min-delay throttle)
 *   :notified:{window}  set once per window when Slack has been notified
 *   :shift              hash {from, ms, last}: the current backlog shift applies to
 *                       jobs with original time >= from and < last
 */
const GATE_SCRIPT = `
local prefix = KEYS[1]
local limit = tonumber(ARGV[1])
local minDelay = tonumber(ARGV[2])
local reserved = tonumber(ARGV[3])
local origAt = tonumber(ARGV[4])
local applied = tonumber(ARGV[5])
local HOUR = 3600000

local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local window = math.floor(now / HOUR)
local countKey = prefix .. ':h:' .. window
local shiftKey = prefix .. ':shift'

local s = redis.call('HMGET', shiftKey, 'from', 'ms', 'last')
local sFrom, sMs, sLast = tonumber(s[1]), tonumber(s[2]), tonumber(s[3])

local function remember(from, ms, last)
  redis.call('HSET', shiftKey, 'from', from, 'ms', ms, 'last', last)
  redis.call('PEXPIRE', shiftKey, math.max(last - now, 0) + 2 * HOUR)
end

-- 1. Stay behind an existing backlog.
if sMs and applied < sMs and origAt >= sFrom and origAt < sLast then
  local target = origAt + sMs
  if target > sLast then remember(sFrom, sMs, target) end
  return {3, target, 0, sMs}
end

-- 2. Hourly limit.
local count = tonumber(redis.call('GET', countKey) or '0')
if count >= limit then
  local nextWindowStart = (window + 1) * HOUR
  local ms = math.max(1, math.ceil((nextWindowStart - origAt) / HOUR)) * HOUR
  local target = origAt + ms
  if not sMs or origAt >= sLast or ms > sMs then
    remember(origAt, ms, target)                                       -- new or deeper backlog
  else
    remember(math.min(sFrom, origAt), sMs, math.max(sLast, target))    -- same backlog
  end
  local first = redis.call('SET', prefix .. ':notified:' .. window, '1', 'NX', 'EX', 7200)
  return {2, target, first and 1 or 0, ms}
end

-- 3. Minimum delay between sends.
local nextKey = prefix .. ':next'
local hasReservation = reserved > 0 and now >= reserved - 250
if not hasReservation then
  local nextFree = tonumber(redis.call('GET', nextKey) or '0')
  if nextFree > now then
    redis.call('SET', nextKey, nextFree + minDelay, 'PX', nextFree + minDelay - now + 60000)
    return {1, nextFree}
  end
  redis.call('SET', nextKey, now + minDelay, 'PX', minDelay + 60000)
end

redis.call('INCR', countKey)
redis.call('EXPIRE', countKey, 7200)
return {0}
`;

redis.defineCommand('sendGate', { numberOfKeys: 1, lua: GATE_SCRIPT });

declare module 'ioredis' {
  interface RedisCommander<Context> {
    sendGate(
      prefix: string,
      limit: number,
      minDelay: number,
      reserved: number,
      origAt: number,
      appliedShift: number,
    ): Result<number[], Context>;
  }
}

export type GateResult =
  | { kind: 'allowed' }
  | { kind: 'throttled'; slotMs: number }
  | { kind: 'postponed'; retryAtMs: number; appliedShift: number; limitHit: boolean; firstHitThisWindow: boolean };

export function effectiveHourlyLimit(campaignLimit: number) {
  return campaignLimit > 0 ? Math.min(campaignLimit, env.MAX_EMAILS_PER_HOUR_PER_SENDER) : env.MAX_EMAILS_PER_HOUR_PER_SENDER;
}

export interface GateInput {
  senderId: string;
  hourlyLimit: number;
  /** The email's original scheduled time, before any rate-limit shifts. */
  origAt: number;
  /** How far (ms) this job has already been shifted by earlier limit hits. */
  appliedShift: number;
  reservedSlot: number;
  minDelayMs?: number;
}

export async function passSendGate(i: GateInput): Promise<GateResult> {
  const [code, value, flag, ms] = await redis.sendGate(
    `rl:${i.senderId}`,
    i.hourlyLimit,
    i.minDelayMs ?? env.MIN_DELAY_BETWEEN_SENDS_MS,
    i.reservedSlot,
    i.origAt,
    i.appliedShift,
  );
  if (code === 0) return { kind: 'allowed' };
  if (code === 1) return { kind: 'throttled', slotMs: value! };
  return { kind: 'postponed', retryAtMs: value!, appliedShift: ms!, limitHit: code === 2, firstHitThisWindow: flag === 1 };
}
