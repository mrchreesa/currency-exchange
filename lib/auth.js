// Owner sign-in for /admin: one password (ADMIN_PASSWORD) and a signed cookie that lasts 30 days.
// Changing the password signs out every device.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE = 'qce_admin';
const MAX_AGE = 30 * 86400;

const sha = (value) => createHash('sha256').update(value).digest();
const signingKey = () => sha(`qce-admin-session:${process.env.ADMIN_PASSWORD}`);
const sign = (payload) => createHmac('sha256', signingKey()).update(payload).digest('base64url');

export const adminConfigured = () => Boolean(process.env.ADMIN_PASSWORD);

export function passwordMatches(input) {
  if (!adminConfigured() || typeof input !== 'string') return false;
  return timingSafeEqual(sha(input), sha(process.env.ADMIN_PASSWORD));
}

export function sessionCookie() {
  const expires = String(Date.now() + MAX_AGE * 1000);
  return `${COOKIE}=${expires}.${sign(expires)}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Strict`;
}

export const clearedCookie = `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;

export function isAdmin(request) {
  if (!adminConfigured()) return false;
  const match = (request.headers.get('cookie') ?? '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=(\\d+)\\.([\\w-]+)`));
  if (!match || Number(match[1]) < Date.now()) return false;
  const expected = Buffer.from(sign(match[1]));
  const given = Buffer.from(match[2]);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
