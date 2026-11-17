// Email through Resend (resend.com), over its REST API.
//
// RESEND_API_KEY  required to send anything.
// NOTIFY_EMAIL    where requests go; defaults to the shop's Gmail.
// RESEND_FROM     sender. Without a verified domain Resend only delivers to the account's own address,
//                 so customer confirmations switch on only once this is set to an address on a verified domain.

const DEFAULT_FROM = 'Quick Currency Exchange <onboarding@resend.dev>';

export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY);
export const notifyAddress = () => process.env.NOTIFY_EMAIL || 'quickcurrencyedgware@gmail.com';
export const senderAddress = () => process.env.RESEND_FROM?.trim() || DEFAULT_FROM;

export const canEmailCustomers = () => {
  const from = process.env.RESEND_FROM?.trim();
  return emailConfigured() && Boolean(from) && !/@resend\.dev>?$/i.test(from);
};

export async function sendEmail({ to, subject, html, text, replyTo, from }, { idempotencyKey, tags } = {}) {
  if (!emailConfigured()) {
    console.warn(`[email] RESEND_API_KEY missing, not sent: ${subject}`);
    return { skipped: true };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
    body: JSON.stringify({
      from: from || senderAddress(),
      to: [to],
      subject,
      html,
      text,
      ...(tags ? { tags } : {}),
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const error = new Error(`Resend answered ${res.status}`);
    error.status = res.status;
    error.retryable = res.status === 429 || res.status === 409 || res.status >= 500;
    throw error;
  }
  return res.json();
}
