// Email through Resend (resend.com), over its REST API.
//
// RESEND_API_KEY  required to send anything.
// NOTIFY_EMAIL    where requests go; defaults to the shop's Gmail.
// RESEND_FROM     sender. Without a verified domain Resend only delivers to the account's own address,
//                 so customer confirmations switch on only once this is set to an address on a verified domain.

const DEFAULT_FROM = 'Quick Currency Exchange <onboarding@resend.dev>';

export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY);
export const notifyAddress = () => process.env.NOTIFY_EMAIL || 'quickcurrencyedgware@gmail.com';

export const canEmailCustomers = () => {
  const from = process.env.RESEND_FROM?.trim();
  return emailConfigured() && Boolean(from) && !/@resend\.dev>?$/i.test(from);
};

export async function sendEmail({ to, subject, html, text, replyTo }) {
  if (!emailConfigured()) {
    console.warn(`[email] RESEND_API_KEY missing, not sent: ${subject}`);
    return { skipped: true };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.RESEND_FROM?.trim() || DEFAULT_FROM,
      to: [to],
      subject,
      html,
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Resend answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}
