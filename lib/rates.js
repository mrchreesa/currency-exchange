// Board rates = No1 Currency's rates, pulled once each day at 9:00am London,
// with any prices the owner sets in /admin laid on top until the next 9:00am.

import { CODES } from './currencies.js';
import * as store from './store.js';
import { lastNine, nextNine } from './time.js';

const FEED = 'https://api.fexcocunet.com/bureaumobileweb/rest/rateboard/refined/UK';
const RETRY_AFTER_FAILURE = 300; // seconds

/** Fetches No1's current note rates for our currencies. */
export async function fetchFeed() {
  const res = await fetch(FEED, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Rates feed answered ${res.status}`);
  const data = await res.json();

  const rates = {};
  for (const row of data.wrappedObject ?? []) {
    if (CODES.includes(row.isoAlphaCode) && row.sellNote > 0 && row.buyNote > 0) {
      rates[row.isoAlphaCode] = { sell: row.sellNote, buy: row.buyNote };
    }
  }
  if (Object.keys(rates).length < CODES.length - 2) throw new Error('Rates feed came back incomplete');
  return rates;
}

export async function refreshAuto() {
  const auto = { updatedAt: new Date().toISOString(), rates: await fetchFeed() };
  await store.set('rates:auto', auto);
  await store.del('rates:error');
  return auto;
}

/** Owner prices still in force: those set since the last 9:00am. */
async function currentManual(now) {
  const manual = await store.get('rates:manual');
  return manual && new Date(manual.setAt) >= lastNine(now) ? manual : null;
}

/**
 * The rates the board should show right now. The first call after 9:00am pulls a fresh copy
 * of No1's rates; a short lock keeps a burst of visitors from all calling the feed at once.
 */
export async function getRates(now = new Date()) {
  let auto = await store.get('rates:auto');

  if (!auto || new Date(auto.updatedAt) < lastNine(now)) {
    if (await store.set('rates:lock', 1, { ex: RETRY_AFTER_FAILURE, nx: true })) {
      try {
        auto = await refreshAuto();
      } catch (error) {
        console.error('[rates] Daily update failed:', error.message);
        await store.set('rates:error', { at: now.toISOString(), message: error.message });
      }
    }
  }

  const manual = await currentManual(now);
  const rates = {};
  for (const code of CODES) {
    const own = manual?.rates[code];
    const value = own ?? auto?.rates[code];
    if (value) rates[code] = { sell: value.sell, buy: value.buy, manual: Boolean(own) };
  }

  const times = [auto?.updatedAt, manual?.setAt].filter(Boolean).sort();
  return {
    updated: times.at(-1) ?? null,
    autoUpdatedAt: auto?.updatedAt ?? null,
    nextUpdate: nextNine(now).toISOString(),
    manualUntil: manual ? nextNine(now).toISOString() : null,
    rates,
    auto: auto?.rates ?? {},
  };
}

const isRate = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0 && n < 100000;

/** Saves owner prices. They replace No1's rate for those currencies until the next 9:00am. */
export async function setManual(input, now = new Date()) {
  const manual = (await currentManual(now)) ?? { rates: {} };
  for (const [code, value] of Object.entries(input ?? {})) {
    if (!CODES.includes(code) || !isRate(value?.sell) || !isRate(value?.buy)) {
      throw Object.assign(new Error(`Check the ${code} rates: both need to be numbers above 0.`), { status: 422 });
    }
    manual.rates[code] = { sell: +value.sell.toFixed(4), buy: +value.buy.toFixed(4) };
  }
  await store.set('rates:manual', { setAt: now.toISOString(), rates: manual.rates });
}

/** Puts the listed currencies (or all of them) back on No1's rates. */
export async function clearManual(codes, now = new Date()) {
  const manual = await currentManual(now);
  if (!manual) return;
  if (!codes?.length) {
    await store.del('rates:manual');
    return;
  }
  for (const code of codes) delete manual.rates[code];
  if (Object.keys(manual.rates).length) await store.set('rates:manual', manual);
  else await store.del('rates:manual');
}

export const lastError = () => store.get('rates:error');
