import { adminConfigured, passwordMatches, sessionCookie } from '../../lib/auth.js';
import { clientIp, fail, HttpError, json, readJson } from '../../lib/http.js';
import { withinLimit } from '../../lib/store.js';

export async function POST(request) {
  try {
    if (!adminConfigured()) throw new HttpError(503, 'Set ADMIN_PASSWORD in Vercel to switch the admin on.');
    if (!(await withinLimit('admin-login', clientIp(request), 5, 900))) {
      throw new HttpError(429, 'Too many tries. Wait 15 minutes and try again.');
    }
    const { password } = await readJson(request);
    if (!passwordMatches(password)) throw new HttpError(401, 'That password isn’t right.');
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie() });
  } catch (error) {
    return fail(error);
  }
}
