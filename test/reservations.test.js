import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { after, beforeEach, mock, test } from 'node:test';

// All services are local fakes. Never load deployment credentials or use the network.
process.env.KV_REST_API_URL = 'https://redis.test';
process.env.KV_REST_API_TOKEN = 'test-placeholder';
process.env.TURNSTILE_SITE_KEY = 'test-placeholder';
process.env.TURNSTILE_SECRET_KEY = 'test-placeholder';
process.env.RESEND_API_KEY = 'test-placeholder';
process.env.VERCEL = '1';
delete process.env.RESEND_FROM;
delete process.env.TURNSTILE_HOSTNAMES;
process.env.WEBM8_LEAD_SETUP_FILE = JSON.stringify({ endpoint: 'https://webm8-platform.vercel.app/api/ingest/v1/leads', keyId: 'w8_test', privateKeyPem: generateKeyPairSync('ed25519').privateKey.export({format:'pem',type:'pkcs8'}) });

const HOST = 'currency-exchange-quick-stop.vercel.app';
const entries = new Map();
let sent, checks, verification, redisFailure;
const originalFetch = globalThis.fetch;

function entry(key) {
  const item = entries.get(key);
  if (item?.expires && item.expires <= Date.now()) {
    entries.delete(key);
    return undefined;
  }
  return item;
}

function command([op, key, ...args]) {
  if (redisFailure?.op === op) return { error: 'Simulated Redis command failure' };
  const item = entry(key);
  let result;
  switch (op) {
    case 'MGET': result = [key, ...args].map(k => entry(k)?.value ?? null); break;
    case 'EVAL': {
      if (key.includes('qce_accept_v1')) {
        const [,dup,delivery,reservations,index,pointer,job,record,id] = args;
        if (entry(dup)) return { result: entry(dup).value };
        command(['SET',dup,pointer,'EX',86400]); command(['SET',delivery,job,'EX',2592000]);
        command(['LPUSH',reservations,record]); command(['LTRIM',reservations,0,199]);
        command(['LPUSH',index,id]); command(['LTRIM',index,0,1499]);
        result = 'created';
      } else {
        const [,casKey,expected,next,ttl] = args;
        if (entry(casKey)?.value !== expected) result = 0;
        else { command(['SET',casKey,next,'EX',ttl]); result = 1; }
      }
      break;
    }
    case 'GET': result = item?.value ?? null; break;
    case 'SET': {
      if (args.includes('NX') && item) return { result: null };
      const ex = args.indexOf('EX');
      entries.set(key, { value: args[0], expires: ex < 0 ? 0 : Date.now() + args[ex + 1] * 1000 });
      result = 'OK';
      break;
    }
    case 'DEL': result = Number(entries.delete(key)); break;
    case 'INCR':
      result = Number(item?.value ?? 0) + 1;
      entries.set(key, { value: String(result), expires: item?.expires ?? 0 });
      break;
    case 'EXPIRE':
      if (item) item.expires = Date.now() + args[0] * 1000;
      result = Number(Boolean(item));
      break;
    case 'LPUSH': {
      const list = item?.value ?? [];
      result = list.unshift(args[0]);
      entries.set(key, { value: list, expires: 0 });
      break;
    }
    case 'LTRIM':
      if (item) item.value = item.value.slice(args[0], args[1] + 1);
      result = 'OK';
      break;
    case 'LRANGE': result = (item?.value ?? []).slice(args[0], args[1] + 1); break;
    default: throw new Error(`Unexpected Redis operation: ${op}`);
  }
  return { result };
}

globalThis.fetch = async (url, options) => {
  const payload = options?.body ? JSON.parse(options.body) : undefined;
  if (String(url).startsWith('https://redis.test')) {
    if (redisFailure === 'offline') throw new Error('Simulated Redis outage');
    return Response.json(String(url).endsWith('/pipeline') ? payload.map(command) : command(payload));
  }
  if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') {
    checks.push(payload);
    if (verification instanceof Error) throw verification;
    if (verification instanceof Response) return verification;
    return Response.json(verification ?? {
      success: payload.response === 'valid-token', hostname: HOST, action: 'reserve',
    });
  }
  if (url === 'https://webm8-platform.vercel.app/api/ingest/v1/leads') return Response.json({success:true,leadId:'test-crm-lead',duplicate:false});
  if (url === 'https://api.resend.com/emails') {
    sent.push(payload);
    return Response.json({ id: `local-email-${sent.length}` });
  }
  if (url === 'https://api.fexcocunet.com/bureaumobileweb/rest/rateboard/refined/UK') {
    return Response.json({ wrappedObject: CODES.map(isoAlphaCode => ({ isoAlphaCode, buyNote: 1.1, sellNote: 1.2 })) });
  }
  throw new Error(`Network access is disabled in tests: ${url}`);
};

const { POST } = await import('../api/reserve.js');
const store = await import('../lib/store.js');
const { CODES } = await import('../lib/currencies.js');

beforeEach(async () => {
  mock.timers.reset();
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-17T12:00:00Z') });
  entries.clear();
  sent = []; checks = []; verification = undefined; redisFailure = undefined;
  delete process.env.TURNSTILE_HOSTNAMES;
  await store.set('rates:auto', {
    updatedAt: new Date().toISOString(),
    rates: Object.fromEntries(CODES.map(code => [code, { buy: 1.1, sell: 1.2 }])),
  });
});
after(() => { globalThis.fetch = originalFetch; mock.timers.reset(); });

const body = (changes = {}) => ({
  side: 'buy', currency: 'EUR', amount: '100', date: '2026-11-18',
  name: 'Test Request', phone: '07700 900123', email: '', company: '',
  startedAt: Date.now() - 5000, token: 'valid-token', ...changes,
});
const phone = n => `+447700${String(n).padStart(6, '0')}`;
async function post(data, ip = '192.0.2.1') {
  const response = await POST(new Request(`https://${HOST}/api/reserve`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': ip },
    body: JSON.stringify(data),
  }));
  return { status: response.status, ...await response.json() };
}
const send = (changes, ip) => post(body(changes), ip);
const advance = ms => mock.timers.setTime(Date.now() + ms);

test('valid request is checked on the server, stored and emailed once', async () => {
  const result = await send();
  assert.equal(result.status, 200);
  assert.match(result.ref, /^QCE-[A-Z2-9]{4}$/);
  assert.equal(checks[0].remoteip, '192.0.2.1');
  assert.equal(checks[0].response, 'valid-token');
  assert.equal(sent.length, 1);
  assert.match(sent[0].subject, new RegExp(result.ref));
  assert.equal((await store.listRange('reservations', 50))[0].phone, '+447700900123');
});

test('honeypot returns a decoy without storing, checking or emailing', async () => {
  assert.equal((await send({ company: 'spam bot' })).status, 200);
  assert.equal(sent.length, 0);
  assert.equal(checks.length, 0);
  assert.deepEqual(await store.listRange('reservations', 50), []);
});

for (const [label, changes, field] of [
  ['impossible date', { date: '2026-11-31' }, 'date'],
  ['past date', { date: '2026-11-16' }, 'date'],
  ['date beyond 30 days', { date: '2026-12-18' }, 'date'],
  ['punctuation-only name', { name: '...' }, 'name'],
  ['link in name', { name: 'https://spam.test' }, 'name'],
  ['non-string name', { name: ['Alice'] }, 'name'],
  ['zero country code', { phone: '+00000000000' }, 'phone'],
  ['invalid UK length', { phone: '+4477' }, 'phone'],
  ['non-string phone', { phone: [447700900123] }, 'phone'],
  ['boolean amount', { amount: true }, 'amount'],
  ['array amount', { amount: [100] }, 'amount'],
  ['hex amount', { amount: '0x100' }, 'amount'],
  ['too many decimals', { amount: '100.001' }, 'amount'],
  ['zero amount', { amount: '0' }, 'amount'],
  ['amount above GBP cap', { amount: '10000.01' }, 'amount'],
  ['invalid currency', { currency: 'FAKE' }, 'currency'],
  ['invalid side', { side: 'other' }, 'side'],
  ['malformed email', { email: 'not-an-email' }, 'email'],
  ['non-string email', { email: ['alice@example.test'] }, 'email'],
]) {
  test(`rejects ${label} before Turnstile and email`, async () => {
    const result = await send(changes);
    assert.equal(result.status, 422);
    assert.ok(result.errors[field]);
    assert.equal(checks.length, 0);
    assert.equal(sent.length, 0);
  });
}

for (const amount of ['1.10', '19.99', 1.1, '10000']) {
  test(`accepts valid amount ${JSON.stringify(amount)}`, async () => {
    assert.equal((await send({ amount, name: 'Zoë O’Neill' })).status, 200);
    assert.equal(sent.length, 1);
  });
}

for (const invalid of [null, [], 'text', 42]) {
  test(`rejects malformed body ${JSON.stringify(invalid)}`, async () => {
    assert.equal((await post(invalid)).status, 400);
    assert.equal(sent.length, 0);
  });
}

test('rejects missing, future and too-recent form start times', async () => {
  for (const startedAt of [null, Date.now() + 1000, Date.now() - 2000]) {
    assert.equal((await send({ startedAt })).status, 400);
  }
  assert.equal(sent.length, 0);
});

for (const invalid of [
  { success: false, 'error-codes': ['timeout-or-duplicate'] },
  { success: true, hostname: HOST },
  { success: true, hostname: HOST, action: 'login' },
  { success: true, hostname: 'other.example', action: 'reserve' },
  { success: true, action: 'reserve' },
  { success: 'true', hostname: HOST, action: 'reserve' },
]) {
  test(`rejects invalid bot verification ${JSON.stringify(invalid)}`, async () => {
    verification = invalid;
    assert.equal((await send()).status, 403);
    assert.equal(sent.length, 0);
    assert.equal([...entries.keys()].some(key => key.startsWith('rl:phone-day:') || key.startsWith('rl:site-day:')), false);
  });
}

test('bot verification outage fails closed with a retryable error', async () => {
  verification = new Error('Simulated Cloudflare timeout');
  assert.equal((await send()).status, 503);
  assert.equal(sent.length, 0);
});

for (const [label, response] of [
  ['HTTP error', () => Response.json({ success: true, hostname: HOST, action: 'reserve' }, { status: 503 })],
  ['unreadable response', () => new Response('not json')],
]) {
  test(`bot verification ${label} fails closed`, async () => {
    verification = response();
    assert.equal((await send()).status, 503);
    assert.equal(sent.length, 0);
  });
}

test('an explicitly configured hostname can pass verification', async () => {
  process.env.TURNSTILE_HOSTNAMES = `${HOST}, shop.example`;
  verification = { success: true, action: 'reserve', hostname: 'shop.example' };
  assert.equal((await send()).status, 200);
});

test('missing and oversized tokens cannot bypass the bot check', async () => {
  for (const token of ['', null, 'x'.repeat(2049)]) assert.equal((await send({ token })).status, 403);
  assert.equal(checks.length, 0);
  assert.equal(sent.length, 0);
});

test('IP limit blocks attempt 4, including failed bot checks, and resets after 10 minutes', async () => {
  for (let n = 0; n < 3; n++) assert.equal((await send({ token: 'invalid' })).status, 403);
  assert.equal((await send()).status, 429);
  assert.equal(checks.length, 3);
  advance(600000);
  assert.equal((await send()).status, 200);
});

test('malformed attempts also count toward the IP limit', async () => {
  for (let n = 0; n < 3; n++) assert.equal((await send({ name: '!' })).status, 422);
  assert.equal((await send()).status, 429);
  assert.equal(checks.length, 0);
});

test('daily IP limit blocks attempt 9 across separate ten-minute windows', async () => {
  for (let n = 0; n < 8; n++) {
    assert.equal((await send({ token: 'invalid' })).status, 403);
    advance(600000);
  }
  assert.equal((await send()).status, 429);
  assert.equal(checks.length, 8);
});

test('phone limit shares UK formats across different IP addresses', async () => {
  const aliases = ['07700 900123', '+44 7700 900123', '0044 7700 900123', '+44 (0)7700 900123'];
  for (let n = 0; n < aliases.length; n++) {
    const result = await send({ phone: aliases[n], date: `2026-11-${18 + n}` }, `192.0.2.${n + 1}`);
    assert.equal(result.status, n < 3 ? 200 : 429);
  }
  assert.equal(sent.length, 3);
});

test('40 accepted requests across the site; concurrent request 41 is blocked', async () => {
  const results = await Promise.all(Array.from({ length: 41 }, (_, n) => send({ phone: phone(n) }, `192.0.2.${n + 1}`)));
  assert.equal(results.filter(r => r.status === 200).length, 40);
  assert.equal(results.filter(r => r.status === 429).length, 1);
  assert.equal(sent.length, 40);
  assert.equal((await store.listRange('reservations', 50)).length, 40);
});

test('duplicates share the reference and send no second email even if amount changes', async () => {
  const first = await send();
  const repeat = await send({ phone: '0044 7700 900123', amount: '200' });
  assert.equal(repeat.ref, first.ref);
  assert.equal(repeat.repeat, true);
  assert.equal(sent.length, 1);
  advance(86399000);
  assert.equal((await send()).repeat, true, 'midnight does not reset the 24-hour duplicate lock');
  assert.equal(sent.length, 1);
  advance(1000);
  const nextDay = await send();
  assert.equal(nextDay.status, 200);
  assert.equal(nextDay.repeat, undefined);
  assert.equal(sent.length, 2);
});

test('simultaneous duplicates produce one record and one email', async () => {
  const results = await Promise.all([send(), send({}, '192.0.2.2')]);
  assert.equal(results[0].ref, results[1].ref);
  assert.equal(results.filter(r => r.repeat).length, 1);
  assert.equal(sent.length, 1);
  assert.equal((await store.listRange('reservations', 50)).length, 1);
});

for (const changes of [{ currency: 'USD' }, { side: 'sell' }, { date: '2026-11-19' }]) {
  test(`different request remains eligible: ${JSON.stringify(changes)}`, async () => {
    await send();
    assert.equal((await send(changes)).repeat, undefined);
    assert.equal(sent.length, 2);
  });
}

test('storage outage rejects requests instead of bypassing limits', async () => {
  redisFailure = 'offline';
  assert.equal((await send()).status, 500);
  assert.equal(sent.length, 0);
});

test('a Redis pipeline command error cannot silently bypass counters', async () => {
  redisFailure = { op: 'EXPIRE' };
  assert.equal((await send()).status, 500);
  assert.equal(sent.length, 0);
});

test('missing exchange rates cannot bypass the GBP amount cap', async () => {
  await store.set('rates:auto', { updatedAt: new Date().toISOString(), rates: {} });
  assert.equal((await send({ amount: '10001' })).status, 422);
  assert.equal((await send({ side: 'sell' })).status, 422);
  assert.equal(sent.length, 0);
});

test('sell requests apply the GBP-equivalent cap', async () => {
  assert.equal((await send({ side: 'sell', amount: '11000.01' })).status, 422);
  assert.equal((await send({ side: 'sell', amount: '11000' })).status, 200);
  assert.equal(sent.length, 1);
});

for (const number of ['020 8951 1500', '+33 1 23 45 67 89']) {
  test(`accepts plausible landline/international phone ${number}`, async () => {
    assert.equal((await send({ phone: number })).status, 200);
  });
}
