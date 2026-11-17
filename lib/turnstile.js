// Cloudflare Turnstile: the form gets a one-time token in the browser and the server checks it here.
// TURNSTILE_SITE_KEY (public) and TURNSTILE_SECRET_KEY come from the Turnstile widget in Cloudflare.

import { HttpError } from './http.js';

const DEFAULT_HOSTNAME = 'currency-exchange-quick-stop.vercel.app';

export const turnstileConfigured = () => Boolean(process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY);

export async function verifyTurnstile(token, ip) {
  if (typeof token !== 'string' || !token || token.length > 2048) return false;
  let result;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: process.env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error('Siteverify unavailable');
    result = await res.json();
  } catch {
    throw new HttpError(503, 'The bot check is temporarily unavailable. Please try again, or call us on 020 8951 1500.', { retryCheck: true });
  }
  // Server-owned allowlist, never a hostname supplied by the visitor's request.
  const hostnames = (process.env.TURNSTILE_HOSTNAMES || DEFAULT_HOSTNAME).split(',').map(host => host.trim().toLowerCase());
  return result?.success === true && result.action === 'reserve' && hostnames.includes(result.hostname);
}
