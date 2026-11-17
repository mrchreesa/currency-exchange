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
