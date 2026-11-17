import { json } from '../lib/http.js';

/** Public settings the page needs before it can render the form's bot check. */
export function GET() {
  return json({ turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || null }, 200, {
    'cache-control': 'public, max-age=300, s-maxage=300',
  });
}
