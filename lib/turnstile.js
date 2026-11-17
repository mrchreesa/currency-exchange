// Cloudflare Turnstile: the form gets a one-time token in the browser and the server checks it here.
// TURNSTILE_SITE_KEY (public) and TURNSTILE_SECRET_KEY come from the Turnstile widget in Cloudflare.

export const turnstileConfigured = () => Boolean(process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY);

export async function verifyTurnstile(token, ip) {
  if (typeof token !== 'string' || !token || token.length > 2048) return false;
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: process.env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip }),
    signal: AbortSignal.timeout(8000),
  });
  const result = await res.json();
  if (!result.success) console.warn('[turnstile] Rejected:', result['error-codes']);
  return Boolean(result.success) && (!result.action || result.action === 'reserve');
}
