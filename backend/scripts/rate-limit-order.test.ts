/**
 * Checks the Redis rate-limit gate keeps send order when an hourly limit is hit,
 * including emails natively scheduled in the next hour and random arrival order.
 * Needs Redis running (npm run infra:up). Uses throwaway sender keys.
 *
 *   npm run test:ratelimit --prefix backend
 */
import { passSendGate } from '../src/queue/rateLimiter.js';
import { redis } from '../src/lib/redis.js';

const H = 3_600_000;
let fails = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' ' + detail : ''}`);
  if (!ok) fails++;
};

async function run(label: string, shuffle: boolean) {
  const sender = `gate-test-${label}`;
  for (const k of await redis.keys(`rl:${sender}*`)) await redis.del(k);
  const [sec] = await redis.time();
  const nextStart = (Math.floor((Number(sec) * 1000) / H) + 1) * H;
  // 10 emails 2s apart: 5 before the hour boundary, 5 natively in the next hour.
  const orig = Array.from({ length: 10 }, (_, i) => nextStart - 10_000 + i * 2000);
  const first2 = [0, 1];
  const rest = [2, 3, 4, 5, 6, 7, 8, 9];
  if (shuffle) rest.sort(() => Math.random() - 0.5);

  const result = new Map<number, string>();
  for (const i of [...first2, ...rest]) {
    const g = await passSendGate({ senderId: sender, hourlyLimit: 2, origAt: orig[i]!, appliedShift: 0, reservedSlot: 0, minDelayMs: 0 });
    result.set(i, g.kind === 'postponed' ? `+${(g.retryAtMs - orig[i]!) / H}h` : g.kind);
  }
  const got = orig.map((_, i) => result.get(i));
  check(`${label}: first 2 allowed`, got[0] === 'allowed' && got[1] === 'allowed', JSON.stringify(got.slice(0, 2)));
  check(`${label}: other 8 (incl. 5 native next-hour) all shifted exactly +1h`, got.slice(2).every((x) => x === '+1h'), JSON.stringify(got.slice(2)));
  if (shuffle) console.log(`     arrival order: ${rest.join(',')}`);

  // A job already shifted by the current backlog is not shifted again by it.
  const again = await passSendGate({ senderId: sender, hourlyLimit: 99, origAt: orig[5]!, appliedShift: H, reservedSlot: 0, minDelayMs: 0 });
  check(`${label}: already-shifted job not shifted twice`, again.kind === 'allowed', again.kind);
  for (const k of await redis.keys(`rl:${sender}*`)) await redis.del(k);
}

await run('in-order', false);
await run('shuffled', true);
await run('shuffled-2', true);
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
process.exit(fails ? 1 : 0);
