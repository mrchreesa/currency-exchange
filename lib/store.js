// Small key-value store on Upstash Redis, spoken to over its REST API so the site needs no packages.
// Connect it in Vercel (Storage > Upstash for Redis); the integration adds the KV_REST_API_* variables.
// Without them it falls back to memory, which is fine locally but forgets everything on Vercel.

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const storeKind = URL_ && TOKEN ? 'redis' : 'memory';
if (storeKind === 'memory') console.warn('[store] No Upstash Redis variables found: using memory only.');

const memory = (globalThis.__qceMemory ??= new Map());

async function call(path, body) {
  const res = await fetch(`${URL_}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  const data = await res.json();
  const error = data.error || (Array.isArray(data) && data.find(item => item.error)?.error);
  if (!res.ok || error) throw new Error(`Redis: ${error || res.status}`);
  return data;
}

const redis = async (...command) => (await call('', command)).result;

const memGet = (key) => {
  const item = memory.get(key);
  if (!item) return null;
  if (item.expires && item.expires <= Date.now()) {
    memory.delete(key);
    return null;
  }
  return item.value;
};

/** Reads a JSON value, or null. */
export async function get(key) {
  const raw = storeKind === 'redis' ? await redis('GET', key) : memGet(key);
  return raw == null ? null : JSON.parse(raw);
}

/** Writes a JSON value. With nx, only writes when the key is free and returns whether it did. */
export async function set(key, value, { ex, nx } = {}) {
  const raw = JSON.stringify(value);
  if (storeKind === 'redis') {
    const command = ['SET', key, raw];
    if (ex) command.push('EX', ex);
    if (nx) command.push('NX');
    return (await redis(...command)) === 'OK';
  }
  if (nx && memGet(key) != null) return false;
  memory.set(key, { value: raw, expires: ex ? Date.now() + ex * 1000 : 0 });
  return true;
}

export async function del(key) {
  if (storeKind === 'redis') await redis('DEL', key);
  else memory.delete(key);
}

/** Adds to the front of a list and keeps only the newest `max` items. */
export async function pushCapped(key, value, max) {
  const raw = JSON.stringify(value);
  if (storeKind === 'redis') {
    await call('/pipeline', [['LPUSH', key, raw], ['LTRIM', key, 0, max - 1]]);
    return;
  }
  const list = memGet(key) ?? [];
  memory.set(key, { value: [raw, ...list].slice(0, max), expires: 0 });
}

export async function listRange(key, count) {
  const raw = storeKind === 'redis' ? await redis('LRANGE', key, 0, count - 1) : (memGet(key) ?? []).slice(0, count);
  return raw.map((item) => JSON.parse(item));
}

/**
 * Fixed-window counter. Returns true while `id` has made no more than `limit`
 * calls to `name` in the current window of `windowSec` seconds.
 */
export async function withinLimit(name, id, limit, windowSec) {
  const key = `rl:${name}:${id}:${Math.floor(Date.now() / 1000 / windowSec)}`;
  let count;
  if (storeKind === 'redis') {
    const [incr] = await call('/pipeline', [['INCR', key], ['EXPIRE', key, windowSec]]);
    count = incr.result;
  } else {
    count = (Number(memGet(key)) || 0) + 1;
    memory.set(key, { value: String(count), expires: Date.now() + windowSec * 1000 });
  }
  if (!Number.isSafeInteger(count) || count < 1) throw new Error('Redis: invalid rate-limit counter');
  return count <= limit;
}

/** Read several JSON values with a single Redis operation. */
export async function getMany(keys) {
  if (!keys.length) return [];
  const raw = storeKind === 'redis' ? await redis('MGET', ...keys) : keys.map(memGet);
  return raw.map(value => value == null ? null : JSON.parse(value));
}

// Compare-and-set keeps webhook and worker updates from overwriting one another.
const CAS = "if redis.call('GET', KEYS[1]) == ARGV[1] then redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3]); return 1 else return 0 end";
export async function update(key, change, { ex = 30 * 86400 } = {}) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const raw = storeKind === 'redis' ? await redis('GET', key) : memGet(key);
    if (raw == null) return null;
    const next = change(JSON.parse(raw));
    if (!next) return JSON.parse(raw);
    const encoded = JSON.stringify(next);
    if (storeKind === 'redis') {
      if (await redis('EVAL', CAS, 1, key, raw, encoded, ex)) return next;
    } else if (memGet(key) === raw) {
      memory.set(key, { value: encoded, expires: Date.now() + ex * 1000 });
      return next;
    }
  }
  throw new Error('Concurrent update; retry later');
}

// All acceptance writes commit together. A retry can never see a dedupe claim
// without its saved request/outbox, even if a serverless function stops midway.
const ACCEPT = `-- qce_accept_v1
local existing = redis.call('GET', KEYS[1])
if existing then return existing end
redis.call('SET', KEYS[1], ARGV[1], 'EX', 86400)
redis.call('SET', KEYS[2], ARGV[2], 'EX', 2592000)
redis.call('LPUSH', KEYS[3], ARGV[3]); redis.call('LTRIM', KEYS[3], 0, 199)
redis.call('LPUSH', KEYS[4], ARGV[4]); redis.call('LTRIM', KEYS[4], 0, 1499)
return 'created'`;
export async function acceptReservation(duplicateKey, record, delivery) {
  const pointer = { id: record.id, ref: record.ref };
  if (storeKind === 'redis') {
    const result = await redis('EVAL', ACCEPT, 4, duplicateKey, `delivery:${record.id}`, 'reservations', 'delivery:index',
      JSON.stringify(pointer), JSON.stringify(delivery), JSON.stringify(record), JSON.stringify(record.id));
    return result === 'created' ? { ...pointer, created: true } : { existing: JSON.parse(result), created: false };
  }
  const existing = memGet(duplicateKey);
  if (existing != null) return { existing: JSON.parse(existing), created: false };
  memory.set(duplicateKey, { value: JSON.stringify(pointer), expires: Date.now() + 86400000 });
  memory.set(`delivery:${record.id}`, { value: JSON.stringify(delivery), expires: Date.now() + 2592000000 });
  for (const [name, value, cap] of [['reservations', record, 200], ['delivery:index', record.id, 1500]]) {
    memory.set(name, { value: [JSON.stringify(value), ...(memGet(name) || [])].slice(0, cap), expires: 0 });
  }
  return { ...pointer, created: true };
}
