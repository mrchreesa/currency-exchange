// Reservation requests from the website form.
//
// Spam protection, in the order a request meets it:
//   1. a hidden honeypot field people never fill in (bots that do get a fake "sent")
//   2. per-connection attempt limits
//   3. a minimum time on the page before sending
//   4. strict field checks (no links in names, real-looking phone numbers, sensible amounts and dates)
//   5. Cloudflare Turnstile, then per-phone and site-wide daily limits (only verified requests count)
//   6. repeats of the same request within a day are acknowledged but not re-sent

import { randomInt, randomUUID } from 'node:crypto';
import { CODES } from './currencies.js';
import { canEmailCustomers, sendEmail } from './email.js';
import { createDelivery, processDelivery } from './delivery.js';
import { HttpError } from './http.js';
import { shopEmail, customerEmail } from './reservation-emails.js';
import { getRates } from './rates.js';
import * as store from './store.js';
import { londonToday } from './time.js';
import { turnstileConfigured, verifyTurnstile } from './turnstile.js';

export const MAX_GBP = 10000;
const MAX_DAYS_AHEAD = 30;
const MIN_SECONDS_ON_PAGE = 3;
const KEEP_REQUESTS = 200;

const SHOP_PHONE = '020 8951 1500';
const CALL_US = `please call us on ${SHOP_PHONE}`;

// [name, key source, max requests, window in seconds]
// Per-connection limits run before the bot check, to protect the call to Cloudflare.
const BEFORE_CHECK = [
  ['ip-10m', 'ip', 3, 600],
  ['ip-day', 'ip', 8, 86400],
];
// These count only requests that passed the bot check, so bots can't use them up to block a phone or the whole form.
const AFTER_CHECK = [
  ['phone-day', 'phone', 3, 86400],
  ['site-day', 'site', 40, 86400], // keeps well inside Resend's free 100 emails a day
];

async function enforce(limits, ids) {
  for (const [name, source, max, windowSec] of limits) {
    if (!(await store.withinLimit(name, ids[source], max, windowSec))) {
      throw new HttpError(429, `We’ve had a lot of requests from you. To reserve, ${CALL_US}.`);
    }
  }
}

function newRef() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return `QCE-${Array.from({ length: 4 }, () => chars[randomInt(chars.length)]).join('')}`;
}

/** UK numbers become +44…; others keep their international form. Returns null if it can't be a phone number. */
function normalisePhone(input) {
  if (typeof input !== 'string') return null;
  let phone = input.replace(/[\s().-]/g, '');
  if (phone.startsWith('00')) phone = `+${phone.slice(2)}`;
  else if (/^0[1-9]\d{8,9}$/.test(phone)) phone = `+44${phone.slice(1)}`;
  // People often write +44 (0)…; it must share the same limits as 07… and 0044….
  phone = phone.replace(/^\+440/, '+44');
  if (!/^\+[1-9]\d{8,14}$/.test(phone)) return null;
  if (phone.startsWith('+44') && !/^\+44[1-9]\d{8,9}$/.test(phone)) return null;
  return phone;
}

function validate(body, rates) {
  const errors = {};
  const side = body.side === 'sell' ? 'sell' : body.side === 'buy' ? 'buy' : null;
  if (!side) errors.side = 'Choose buy or sell.';

  const currency = CODES.includes(body.currency) ? body.currency : null;
  if (!currency) errors.currency = 'Choose a currency from the list.';

  const amountText = typeof body.amount === 'string' || typeof body.amount === 'number' ? String(body.amount).trim() : '';
  const amount = Number(amountText);
  const rate = currency && rates[currency];
  // Check decimal precision in text, avoiding floating-point errors such as 1.10 * 100.
  if (!/^\d+(?:\.\d{1,2})?$/.test(amountText) || !Number.isFinite(amount) || amount < 1 || amount > 1e6) {
    errors.amount = 'Enter an amount, up to 2 decimal places.';
  } else if (side === 'sell' && !(Number.isFinite(rate?.buy) && rate.buy > 0)) {
    errors.amount = `We can’t check that amount right now. To reserve, ${CALL_US}.`;
  } else if (side) {
    const gbp = side === 'buy' ? amount : amount / rate.buy;
    if (gbp > MAX_GBP) errors.amount = `For more than £${MAX_GBP.toLocaleString('en-GB')}, ${CALL_US}.`;
  }

  const today = londonToday();
  const last = new Date(Date.parse(`${today}T00:00:00Z`) + MAX_DAYS_AHEAD * 864e5).toISOString().slice(0, 10);
  const date = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : '';
  const parsedDate = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsedDate) || new Date(parsedDate).toISOString().slice(0, 10) !== date || date < today || date > last) {
    errors.date = `Pick a day from today up to ${MAX_DAYS_AHEAD} days ahead.`;
  }

  const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
  if (name.length < 2 || name.length > 60 || !/^[\p{L}\p{M}'’ .-]+$/u.test(name) || !/\p{L}/u.test(name)) {
    errors.name = 'Enter your name using letters only.';
  }

  const phone = normalisePhone(body.phone);
  if (!phone) errors.phone = 'Enter a phone number we can call, like 07700 900123.';

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if ((body.email != null && typeof body.email !== 'string') || (email && (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)))) {
    errors.email = 'Check the email address, or leave it empty.';
  }

  if (Object.keys(errors).length) throw new HttpError(422, 'Please check the highlighted fields.', { errors });
  return { side, currency, amount, date, name, phone, email: email || null };
}

export async function submitReservation(body, ip) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'That request could not be read.');
  }
  // 1. Honeypot: answer like a success so the bot learns nothing.
  if (body.company) return { ok: true, ref: newRef() };

  // A serverless instance's private memory cannot enforce shared production limits.
  if (process.env.VERCEL === '1' && store.storeKind !== 'redis') {
    throw new HttpError(503, `Online requests are temporarily unavailable. To reserve, ${CALL_US}.`);
  }

  // 2. Count attempts, including malformed fields and failed bot checks.
  await enforce(BEFORE_CHECK, { ip });

  // 3. Time on page.
  const started = body.startedAt;
  if (typeof started !== 'number' || !Number.isFinite(started) || started <= 0 || Date.now() - started < MIN_SECONDS_ON_PAGE * 1000) {
    throw new HttpError(400, 'That was quick. Please check the form and send it again.');
  }

  if (!turnstileConfigured()) {
    throw new HttpError(503, `Online requests aren’t switched on yet. To reserve, ${CALL_US}.`);
  }

  // 4. Field checks.
  const { rates } = await getRates();
  const r = validate(body, rates);

  const ids = { ip, phone: r.phone, site: 'all' };

  // 5. Turnstile.
  if (!(await verifyTurnstile(body.token, ip))) {
    throw new HttpError(403, 'We couldn’t confirm you’re not a bot. Please try sending again.', { retryCheck: true });
  }

  await enforce(AFTER_CHECK, ids);

  // 6. Same request again within a day: acknowledge it without sending it twice.
  const dupKey = `dup:${r.phone}:${r.side}:${r.currency}:${r.date}`;
  const ref = newRef();

  const rate = rates[r.currency];
  const record = {
    ...r,
    id: randomUUID(),
    ref,
    at: new Date().toISOString(),
    rate: rate ? (r.side === 'buy' ? rate.sell : rate.buy) : null,
    estimate: rate ? +(r.side === 'buy' ? r.amount * rate.sell : r.amount / rate.buy).toFixed(2) : null,
  };
  const saved = await createDelivery(record, shopEmail(record), dupKey);
  if (!saved.created) {
    // Records created before CRM onboarding have only their original reference.
    if (typeof saved.existing === 'string') return { ok: true, ref: saved.existing, repeat: true, customerEmailed: false };
    const previous = await processDelivery(saved.existing.id);
    if (previous?.crmStatus !== 'saved') throw new HttpError(503, `Your request is saved locally but we can’t confirm it in our booking desk yet. Please try again or ${CALL_US}.`);
    return { ok: true, ref: saved.existing.ref, repeat: true, customerEmailed: false,
      emailPending: !['accepted', 'delivered'].includes(previous.status) };
  }
  const delivery = await processDelivery(record.id);
  if (delivery?.crmStatus !== 'saved') {
    throw new HttpError(503, `Your request is saved locally but we can’t confirm it in our booking desk yet. Please try again or ${CALL_US}.`);
  }

  let customerEmailed = false;
  if (record.email && canEmailCustomers() && (await store.withinLimit('email-day', record.email, 2, 86400))) {
    try {
      await sendEmail(customerEmail(record));
      customerEmailed = true;
    } catch (error) {
      console.error('[reserve] Customer email failed:', error.message);
    }
  }

  return { ok: true, ref, customerEmailed, emailPending: !['accepted', 'delivered'].includes(delivery.status) };
}

export async function recentReservations(count = 50) {
  const records = await store.listRange('reservations', count);
  const deliveries = await store.getMany(records.filter(r => r.id).map(r => `delivery:${r.id}`));
  const byId = new Map(deliveries.filter(Boolean).map(d => [d.record.id, d]));
  return records.map(record => {
    const delivery = byId.get(record.id);
    if (!delivery) return record;
    const { email, record: stored, lockOwner, ...status } = delivery;
    return { ...record, delivery: status };
  });
}
