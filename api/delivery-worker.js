import { handleCallback } from '@vercel/queue';
import { processDelivery } from '../lib/delivery.js';

export const POST = handleCallback(async (message) => {
  if (typeof message?.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(message.id)) return;
  const item = await processDelivery(message.id);
  if (item && (item.crmStatus !== 'saved' || ['queued', 'retrying'].includes(item.status))) throw new Error('Delivery pending');
}, { retry: (_error, metadata) => ({ afterSeconds: Math.min(3600, 60 * 2 ** Math.min(metadata.deliveryCount - 1, 6)) }) });
