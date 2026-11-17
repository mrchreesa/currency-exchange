import assert from 'node:assert/strict';
import { after, beforeEach, mock, test } from 'node:test';

for (const name of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) {
  delete process.env[name];
}
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('Network access is disabled in tests'); };
const store = await import('../lib/store.js');
const { submitReservation } = await import('../lib/reservations.js');

beforeEach(() => {
  globalThis.__qceMemory.clear();
  delete process.env.VERCEL;
  mock.timers.reset();
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-17T12:00:00Z') });
});
after(() => { globalThis.fetch = originalFetch; mock.timers.reset(); });

test('Vercel refuses reservations if shared Redis is not configured', async () => {
  process.env.VERCEL = '1';
  assert.equal(store.storeKind, 'memory');
  await assert.rejects(submitReservation({}, '192.0.2.1'), { status: 503 });
});

test('local memory counters block excess attempts and reset in the next window', async () => {
  const results = await Promise.all(Array.from({ length: 4 }, () => store.withinLimit('test', 'ip', 3, 600)));
  assert.deepEqual(results, [true, true, true, false]);
  mock.timers.setTime(Date.now() + 600000);
  assert.equal(await store.withinLimit('test', 'ip', 3, 600), true);
});

test('local duplicate locks expire at exactly 24 hours', async () => {
  assert.equal(await store.set('dup:test', 'ref', { ex: 86400, nx: true }), true);
  assert.equal(await store.set('dup:test', 'second', { ex: 86400, nx: true }), false);
  mock.timers.setTime(Date.now() + 86400000);
  assert.equal(await store.set('dup:test', 'next-day', { ex: 86400, nx: true }), true);
});
