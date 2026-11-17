import { createHash, sign } from 'node:crypto';

const ENDPOINT = 'https://webm8-platform.vercel.app/api/ingest/v1/leads';
// Paste the downloaded private .mjs setup file into this server-only environment
// variable. Parse only its JSON config; never execute the supplied source code.
function config() {
  const source = process.env.WEBM8_LEAD_SETUP_FILE;
  if (!source) return null;
  const match = source.match(/const config = (\{[\s\S]*?\n\});/);
  const value = JSON.parse(match ? match[1] : source);
  if (value.endpoint !== ENDPOINT || !/^w8_[\w-]+$/.test(value.keyId || '') || typeof value.privateKeyPem !== 'string') throw new Error('Invalid WebM8 connection configuration');
  return value;
}
export const crmConfigured = () => { try { return Boolean(config()); } catch { return false; } };
export async function saveReservationLead(record) {
  const connection = config();
  if (!connection) throw new Error('CRM connection is not configured');
  const eventId = `lead.created:${record.id}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({ type: 'lead.created', occurredAt: record.at, lead: {
    externalLeadId: record.id, name: record.name, email: record.email || undefined,
    phone: record.phone, serviceRequested: `${record.side === 'buy' ? 'Buy' : 'Sell'} ${record.currency}`,
    notes: [`Reservation: ${record.ref}`, `Choice: ${record.side}`, `Currency: ${record.currency}`,
      `Amount: ${record.amount} ${record.side === 'buy' ? 'GBP' : record.currency}`,
      `Collection date: ${record.date}`, `Estimated exchange: ${record.estimate ?? 'Unavailable'}`,
      'Email delivery and recovery: https://quickcurrencyexchange.uk/admin#request-section'].join('\n'),
    requestedJobDate: record.date, source: 'unknown', sourceDetail: 'Website reservation',
  }});
  const hash = createHash('sha256').update(body).digest('hex');
  const signature = sign(null, Buffer.from(`WEBM8v1\n${timestamp}\n${eventId}\n${hash}`), connection.privateKeyPem).toString('base64url');
  const response = await fetch(ENDPOINT, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
    headers: { 'Content-Type': 'application/json', 'x-webm8-key-id': connection.keyId,
      'x-webm8-event-id': eventId, 'x-webm8-timestamp': timestamp, 'x-webm8-signature': signature }, body });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success !== true || typeof result.leadId !== 'string') throw new Error(`CRM save failed (${response.status})`);
  return result;
}
