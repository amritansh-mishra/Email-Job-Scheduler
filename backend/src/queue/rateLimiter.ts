import type { Result } from 'ioredis';
import { env } from '../config/env.js';
import { redis } from '../lib/redis.js';

/**
 * One atomic gate per send attempt, run inside Redis so it is safe across any
 * number of worker processes. It uses Redis' clock, so instances with skewed
 * clocks still agree on the hour window.
 *
 * Returns one of:
 *   {0}                      -> allowed; the hourly counter was incremented
 *   {1, slotMs}              -> too soon after the previous send from this sender;
 *                               a slot at slotMs was reserved for this job
 *   {2, targetMs, firstHit}  -> hourly limit reached; move the job to targetMs in
 *                               the next window. firstHit=1 for the first job to
 *                               hit the limit in this window (used for Slack)
 *
 * Overflow jobs are shifted by whole hours from their own scheduled time, so they
 * keep their original order and spacing no matter which worker reaches the limit
 * first (parallel jobs hit the gate in arbitrary order).
 *
 * Keys (all prefixed rl:{senderId}):
 *   :h:{window}         sends counted in that hour window
 *   :next               earliest time the next send may start (min-delay throttle)
 *   :notified:{window}  set once per window when Slack has been notified
 */
const GATE_SCRIPT = `
local prefix = KEYS[1]
local limit = tonumber(ARGV[1])
local minDelay = tonumber(ARGV[2])
local reserved = tonumber(ARGV[3])
local scheduledAt = tonumber(ARGV[4])

local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local window = math.floor(now / 3600000)
local countKey = prefix .. ':h:' .. window

local count = tonumber(redis.call('GET', countKey) or '0')
if count >= limit then
  local nextWindowStart = (window + 1) * 3600000
  local hours = math.max(1, math.ceil((nextWindowStart - scheduledAt) / 3600000))
  local target = scheduledAt + hours * 3600000
  local first = redis.call('SET', prefix .. ':notified:' .. window, '1', 'NX', 'EX', 7200)
  return {2, target, first and 1 or 0}
end

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
    sendGate(prefix: string, limit: number, minDelay: number, reserved: number, scheduledAt: number): Result<number[], Context>;
  }
}

export type GateResult =
  | { kind: 'allowed' }
  | { kind: 'throttled'; slotMs: number }
  | { kind: 'hourly-limit'; retryAtMs: number; firstHitThisWindow: boolean };

export function effectiveHourlyLimit(campaignLimit: number) {
  return campaignLimit > 0 ? Math.min(campaignLimit, env.MAX_EMAILS_PER_HOUR_PER_SENDER) : env.MAX_EMAILS_PER_HOUR_PER_SENDER;
}

export async function passSendGate(senderId: string, hourlyLimit: number, scheduledAt: Date, reservedSlot = 0): Promise<GateResult> {
  const [code, value, flag] = await redis.sendGate(
    `rl:${senderId}`,
    hourlyLimit,
    env.MIN_DELAY_BETWEEN_SENDS_MS,
    reservedSlot,
    scheduledAt.getTime(),
  );
  if (code === 0) return { kind: 'allowed' };
  if (code === 1) return { kind: 'throttled', slotMs: value! };
  return { kind: 'hourly-limit', retryAtMs: value!, firstHitThisWindow: flag === 1 };
}
