// Reservation requests from the website form.
//
// Spam protection, in the order a request meets it:
//   1. a hidden honeypot field people never fill in (bots that do get a fake "sent")
//   2. a minimum time on the page before sending
//   3. strict field checks (no links in names, real-looking phone numbers, sensible amounts and dates)
//   4. per-connection limits
//   5. Cloudflare Turnstile, then per-phone and site-wide daily limits (only verified requests count)
//   6. repeats of the same request within a day are acknowledged but not re-sent

import { randomInt } from 'node:crypto';
import { CODES, currencyName } from './currencies.js';
import { canEmailCustomers, notifyAddress, sendEmail } from './email.js';
import { escapeHtml, HttpError } from './http.js';
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

const money = (n, currency = 'GBP') =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).format(n);

const longDate = (iso) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

function newRef() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return `QCE-${Array.from({ length: 4 }, () => chars[randomInt(chars.length)]).join('')}`;
}

/** UK numbers become +44…; others keep their international form. Returns null if it can't be a phone number. */
function normalisePhone(input) {
  const raw = String(input ?? '').replace(/[\s().-]/g, '');
  if (!/^(\+|00)?\d{9,15}$/.test(raw)) return null;
  if (raw.startsWith('00')) return `+${raw.slice(2)}`;
  if (raw.startsWith('+')) return raw;
  if (/^0\d{9,10}$/.test(raw)) return `+44${raw.slice(1)}`;
  return null;
}

function validate(body, rates) {
  const errors = {};
  const side = body.side === 'sell' ? 'sell' : body.side === 'buy' ? 'buy' : null;
  if (!side) errors.side = 'Choose buy or sell.';

  const currency = CODES.includes(body.currency) ? body.currency : null;
  if (!currency) errors.currency = 'Choose a currency from the list.';

  const amount = Number(body.amount);
  const rate = currency && rates[currency];
  if (!(amount >= 1) || amount > 1e6 || Math.round(amount * 100) !== amount * 100) {
    errors.amount = 'Enter an amount, up to 2 decimal places.';
  } else if (side && rate) {
    const gbp = side === 'buy' ? amount : amount / rate.buy;
    if (gbp > MAX_GBP) errors.amount = `For more than £${MAX_GBP.toLocaleString('en-GB')}, ${CALL_US}.`;
  }

  const today = londonToday();
  const last = new Date(Date.parse(`${today}T00:00:00Z`) + MAX_DAYS_AHEAD * 864e5).toISOString().slice(0, 10);
  const date = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : '';
  if (!date || date < today || date > last) errors.date = `Pick a day from today up to ${MAX_DAYS_AHEAD} days ahead.`;

  const name = String(body.name ?? '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 60 || !/^[\p{L}\p{M}' .-]+$/u.test(name)) {
    errors.name = 'Enter your name using letters only.';
  }

  const phone = normalisePhone(body.phone);
  if (!phone) errors.phone = 'Enter a phone number we can call, like 07700 900123.';

  const email = String(body.email ?? '').trim().toLowerCase();
  if (email && (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))) {
    errors.email = 'Check the email address, or leave it empty.';
  }

  if (Object.keys(errors).length) throw new HttpError(422, 'Please check the highlighted fields.', { errors });
  return { side, currency, amount, date, name, phone, email: email || null };
}

function describe(r) {
  const code = r.currency;
  const pays = r.side === 'buy' ? money(r.amount) : money(r.amount, code);
  const gets = r.estimate == null ? null : r.side === 'buy' ? money(r.estimate, code) : money(r.estimate);
  return {
    action: r.side === 'buy' ? `Buy ${currencyName(code)} (${code})` : `Sell ${currencyName(code)} (${code})`,
    pays,
    gets: gets ? `about ${gets} at ${r.rate} per £1` : 'ask for today’s rate',
    collect: longDate(r.date),
  };
}

function shopEmail(r) {
  const d = describe(r);
  const rows = [
    ['Wants to', d.action],
    [r.side === 'buy' ? 'Paying' : 'Bringing', d.pays],
    ['Gets', d.gets],
    ['Collection', d.collect],
    ['Name', r.name],
    ['Phone', `<a href="tel:${r.phone}">${r.phone}</a>`],
    ['Email', r.email ? `<a href="mailto:${escapeHtml(r.email)}">${escapeHtml(r.email)}</a>` : 'Not given'],
  ];
  const html = `<div style="font-family:Georgia,serif;font-size:16px;color:#121210">
<p style="margin:0 0 6px;font-size:20px"><strong>New reservation request ${r.ref}</strong></p>
<p style="margin:0 0 18px;color:#555">Call the customer to confirm the rate and collection time. Nothing is reserved until you do.</p>
<table cellpadding="8" style="border-collapse:collapse">${rows
    .map(([k, v]) => `<tr><td style="color:#777;border-bottom:1px solid #eee">${k}</td><td style="border-bottom:1px solid #eee"><strong>${k === 'Phone' || k === 'Email' ? v : escapeHtml(v)}</strong></td></tr>`)
    .join('')}</table>
<p style="margin:18px 0 0;color:#777;font-size:13px">Sent from the website form. All requests are also listed at /admin.</p></div>`;
  const text = [`New reservation request ${r.ref}`, '', ...rows.map(([k, v]) => `${k}: ${String(v).replace(/<[^>]+>/g, '')}`)].join('\n');
  return {
    to: notifyAddress(),
    replyTo: r.email ?? undefined,
    subject: `${r.ref}: ${r.side === 'buy' ? 'Buy' : 'Sell'} ${r.currency} ${d.pays}, ${d.collect}, ${r.name}`,
    html,
    text,
  };
}

function customerEmail(r) {
  const d = describe(r);
  const html = `<div style="font-family:Georgia,serif;font-size:16px;color:#121210;line-height:1.5">
<p>Hi ${escapeHtml(r.name)},</p>
<p>Thanks for your request. Your reference is <strong>${r.ref}</strong>.</p>
<p><strong>${escapeHtml(d.action)}</strong>, ${escapeHtml(d.pays)}, ${escapeHtml(d.gets)}.<br>Collection: ${escapeHtml(d.collect)}.</p>
<p>We’ll call you on ${r.phone} to confirm the rate and a collection time. Nothing is reserved until we do.</p>
<p>Quick Currency Exchange<br>140 Station Rd, Edgware HA8 7AA<br>${SHOP_PHONE}</p></div>`;
  const text = `Hi ${r.name},\n\nThanks for your request. Your reference is ${r.ref}.\n\n${d.action}, ${d.pays}, ${d.gets}.\nCollection: ${d.collect}.\n\nWe’ll call you on ${r.phone} to confirm the rate and a collection time. Nothing is reserved until we do.\n\nQuick Currency Exchange\n140 Station Rd, Edgware HA8 7AA\n${SHOP_PHONE}`;
  return { to: r.email, subject: `We’ve got your request ${r.ref}`, html, text };
}

export async function submitReservation(body, ip) {
  // 1. Honeypot: answer like a success so the bot learns nothing.
  if (body.company) return { ok: true, ref: newRef() };

  // 2. Time on page.
  const started = Number(body.startedAt);
  if (!(Date.now() - started >= MIN_SECONDS_ON_PAGE * 1000)) {
    throw new HttpError(400, 'That was quick. Please check the form and send it again.');
  }

  if (!turnstileConfigured()) {
    throw new HttpError(503, `Online requests aren’t switched on yet. To reserve, ${CALL_US}.`);
  }

  // 3. Field checks.
  const { rates } = await getRates();
  const r = validate(body, rates);

  // 4. Per-connection limits, then Turnstile, then the per-phone and site-wide limits.
  const ids = { ip, phone: r.phone, site: 'all' };
  await enforce(BEFORE_CHECK, ids);

  // 5. Turnstile.
  if (!(await verifyTurnstile(body.token, ip))) {
    throw new HttpError(403, 'We couldn’t confirm you’re not a bot. Please try sending again.', { retryCheck: true });
  }

  await enforce(AFTER_CHECK, ids);

  // 6. Same request again within a day: acknowledge it without sending it twice.
  const dupKey = `dup:${r.phone}:${r.side}:${r.currency}:${r.date}`;
  const ref = newRef();
  if (!(await store.set(dupKey, ref, { ex: 86400, nx: true }))) {
    return { ok: true, ref: await store.get(dupKey), repeat: true, customerEmailed: false };
  }

  const rate = rates[r.currency];
  const record = {
    ...r,
    ref,
    at: new Date().toISOString(),
    rate: rate ? (r.side === 'buy' ? rate.sell : rate.buy) : null,
    estimate: rate ? +(r.side === 'buy' ? r.amount * rate.sell : r.amount / rate.buy).toFixed(2) : null,
  };
  await store.pushCapped('reservations', record, KEEP_REQUESTS);

  // The shop must hear about it. If the email fails, the request is still in /admin when storage is connected.
  try {
    await sendEmail(shopEmail(record));
  } catch (error) {
    console.error('[reserve] Shop email failed:', error.message);
    if (store.storeKind === 'memory') {
      await store.del(dupKey);
      throw new HttpError(502, `We couldn’t send your request just now. Please try again, or ${CALL_US}.`);
    }
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

  return { ok: true, ref, customerEmailed };
}

export const recentReservations = (count = 50) => store.listRange('reservations', count);
