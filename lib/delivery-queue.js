// Durable Vercel queue. Only opaque reservation IDs enter the queue, never contact details.
export async function scheduleDelivery(id, delaySeconds = 60) {
  if (process.env.VERCEL_ENV !== 'production') return false;
  const { send } = await import('@vercel/queue');
  await send('reservation-delivery', { id }, {
    region: 'lhr1', delaySeconds, retentionSeconds: 82800,
    idempotencyKey: `reservation:${id}`,
  });
  return true;
}
