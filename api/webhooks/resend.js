import { Webhook } from 'svix';
import { recordDeliveryEvent } from '../../lib/delivery.js';
import { json } from '../../lib/http.js';

export async function POST(request) {
  if (!process.env.RESEND_WEBHOOK_SECRET) return json({ error: 'Webhook not configured' }, 503);
  if (Number(request.headers.get('content-length')) > 65536) return json({ error: 'Payload too large' }, 413);
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 65536) return json({ error: 'Payload too large' }, 413);
  let event;
  const eventId = request.headers.get('svix-id');
  try {
    new Webhook(process.env.RESEND_WEBHOOK_SECRET).verify(raw, {
      'svix-id': eventId, 'svix-timestamp': request.headers.get('svix-timestamp'),
      'svix-signature': request.headers.get('svix-signature'),
    });
    event = JSON.parse(raw);
  } catch { return json({ error: 'Invalid signature' }, 401); }
  try {
    await recordDeliveryEvent(event, eventId);
    return json({ ok: true });
  } catch {
    // Non-2xx asks Resend to replay. Acknowledge only after durable storage.
    return json({ error: 'Event could not be saved' }, 503);
  }
}
