import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { HttpError } from './http.js';
import * as store from './store.js';
import { emailConfigured, sendEmail, senderAddress } from './email.js';
import { crmConfigured, saveReservationLead } from './webm8.js';
import { scheduleDelivery } from './delivery-queue.js';

const TTL = 30 * 86400;
const SAFE_RETRY_MS = 23 * 3600000; // Resend deduplicates for 24 hours; leave a margin.
const key = id => `delivery:${id}`;
export const getDelivery = id => store.get(key(id));
const mutate = (id, fn) => store.update(key(id), fn, { ex: TTL });
const iso = () => new Date().toISOString();
export const webhookConfigured = () => Boolean(process.env.RESEND_WEBHOOK_SECRET);

export async function createDelivery(record, email, duplicateKey) {
  const result = await store.acceptReservation(duplicateKey, record, { record, email: { ...email, from: senderAddress() }, status: 'queued', attempts: 0,
    crmStatus: 'pending', createdAt: record.at, updatedAt: record.at });
  if (!result.created) return result;
  try {
    const queued = await scheduleDelivery(record.id);
    await mutate(record.id, item => ({ ...item, queueReady: queued }));
  } catch {
    await mutate(record.id, item => ({ ...item, queueReady: false }));
  }
  return result;
}

export function attentionReason(item, now = Date.now()) {
  if (item.crmStatus !== 'saved') return 'crm_pending';
  if (item.handledAt) return null;
  if (['failed', 'bounced', 'complained', 'suppressed', 'manual_review'].includes(item.status)) return 'email_failed';
  if (item.status === 'delayed') return 'delivery_delayed';
  if (item.status === 'retrying') return 'send_retrying';
  if (item.status === 'queued' && now - Date.parse(item.createdAt) > 60000) return 'send_stalled';
  if (item.status === 'accepted' && now - Date.parse(item.acceptedAt) > 15 * 60000) return 'delivery_unconfirmed';
  return null;
}

/** One bounded attempt. Persisted payload and idempotency key are unchanged on retries. */
export async function processDelivery(id, contention = 0) {
  const owner = randomUUID();
  let claimed = await mutate(id, item => {
    if (item.lockUntil > Date.now()) return null;
    return { ...item, lockOwner: owner, lockUntil: Date.now() + 90000 };
  });
  if (!claimed) return null;
  if (claimed.lockOwner !== owner) {
    if (contention < 4) { await delay(100); return processDelivery(id, contention + 1); }
    throw new HttpError(503, 'Your request is still being saved. Please try again shortly.');
  }
  try {
    if (claimed.crmStatus !== 'saved') {
      try {
        const result = await saveReservationLead(claimed.record);
        claimed = await mutate(id, item => ({ ...item, crmStatus: 'saved', crmLeadId: result.leadId, updatedAt: iso() }));
      } catch {
        await mutate(id, item => ({ ...item, crmStatus: 'error', updatedAt: iso() }));
        // The independent email fallback still runs, but the website will not claim CRM success.
      }
    }
    if (!['queued', 'retrying'].includes(claimed.status)) return await getDelivery(id);
    if (claimed.firstAttemptAt && Date.now() - Date.parse(claimed.firstAttemptAt) >= SAFE_RETRY_MS) {
      return await mutate(id, item => ({ ...item, status: 'manual_review', updatedAt: iso(), failureCode: 'retry_window_expired' }));
    }
    if (claimed.nextAttemptAt && Date.parse(claimed.nextAttemptAt) > Date.now()) return await getDelivery(id);
    claimed = await mutate(id, item => ({ ...item, attempts: item.attempts + 1,
      firstAttemptAt: item.firstAttemptAt || iso(), lastAttemptAt: iso(), updatedAt: iso() }));
    try {
      if (!emailConfigured()) throw Object.assign(new Error('Email not configured'), { retryable: false });
      const sent = await sendEmail(claimed.email, { idempotencyKey: `qce-shop/${id}`,
        tags: [{ name: 'reservation_id', value: id }] });
      if (!sent?.id) throw new Error('Email acceptance not confirmed');
      await store.set(`resend:${sent.id}`, id, { ex: TTL });
      await mutate(id, item => ({ ...item, providerId: sent.id, acceptedAt: item.acceptedAt || iso(),
        // A webhook may arrive before the send response. Never downgrade it.
        status: ['queued', 'retrying'].includes(item.status) ? 'accepted' : item.status,
        nextAttemptAt: null, failureCode: null, updatedAt: iso() }));
    } catch (error) {
      const retryable = error.retryable !== false;
      await mutate(id, item => ({ ...item, status: ['queued', 'retrying'].includes(item.status)
        ? (retryable ? 'retrying' : 'failed') : item.status,
        failureCode: Number.isInteger(error.status) ? `provider_${error.status}` : 'send_unconfirmed',
        nextAttemptAt: retryable ? new Date(Date.now() + Math.min(3600000, 30000 * 2 ** Math.min(item.attempts, 7))).toISOString() : null,
        updatedAt: iso() }));
    }
    return await getDelivery(id);
  } finally {
    await mutate(id, item => item.lockOwner === owner ? { ...item, lockOwner: null, lockUntil: 0 } : null);
  }
}

const eventStates = { 'email.sent': 'accepted', 'email.delivered': 'delivered',
  'email.delivery_delayed': 'delayed', 'email.failed': 'failed', 'email.bounced': 'bounced',
  'email.complained': 'complained', 'email.suppressed': 'suppressed' };

export async function recordDeliveryEvent(event, eventId) {
  const status = eventStates[event.type];
  if (!status) return;
  const providerId = event.data?.email_id;
  if (typeof providerId !== 'string' || providerId.length > 100) throw new Error('Missing email identifier');
  const tags = event.data?.tags;
  const tagged = Array.isArray(tags) ? tags.find(t => t.name === 'reservation_id')?.value : tags?.reservation_id;
  const id = await store.get(`resend:${providerId}`) || tagged;
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return;
  const at = Date.parse(event.created_at);
  if (!Number.isFinite(at) || at > Date.now() + 300000) throw new Error('Invalid event date');
  const result = await mutate(id, item => {
    if (item.providerId && item.providerId !== providerId) return null;
    if ((item.eventIds || []).includes(eventId)) return null;
    const seen = [...(item.eventIds || []), eventId].slice(-40);
    const older = item.eventAt && at < Date.parse(item.eventAt);
    const terminal = ['delivered', 'failed', 'bounced', 'complained', 'suppressed'].includes(item.status);
    const downgrade = status === 'accepted' && !['queued', 'retrying', 'accepted'].includes(item.status)
      || status === 'delayed' && terminal;
    if (older || downgrade) return { ...item, eventIds: seen };
    return { ...item, status, providerId, eventIds: seen, eventAt: new Date(at).toISOString(),
      acceptedAt: item.acceptedAt || new Date(at).toISOString(), updatedAt: iso(),
      ...(status === 'delivered' ? { deliveredAt: new Date(at).toISOString() } : {}) };
  });
  if (result) await store.set('delivery:last-webhook', iso(), { ex: TTL });
}

export async function deliverySummary() {
  const ids = [...new Set(await store.listRange('delivery:index', 1500))];
  const items = (await store.getMany(ids.map(key))).filter(Boolean);
  const reasons = [...new Set(items.map(item => attentionReason(item)).filter(Boolean))];
  const ready = { storage: store.storeKind === 'redis', crm: crmConfigured(), email: emailConfigured(), webhook: webhookConfigured() };
  const status = !Object.values(ready).every(Boolean) ? 'setup_required' : reasons.length ? 'needs_attention' : 'healthy';
  return { status, ready, reasons, checkedAt: iso(),
    lastWebhookAt: await store.get('delivery:last-webhook'),
    counts: { total: items.length, delivered: items.filter(i => i.status === 'delivered').length,
      awaitingDelivery: items.filter(i => ['accepted', 'delayed'].includes(i.status)).length,
      attention: items.filter(i => attentionReason(i)).length },
  };
}

export async function handleManually(id) {
  return mutate(id, item => ({ ...item, handledAt: iso(), updatedAt: iso() }));
}
