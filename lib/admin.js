import { deliverySummary } from './delivery.js';
import { isAdmin } from './auth.js';
import { canEmailCustomers, emailConfigured, notifyAddress } from './email.js';
import { HttpError } from './http.js';
import { getRates, lastError } from './rates.js';
import { recentReservations } from './reservations.js';
import { storeKind } from './store.js';
import { turnstileConfigured } from './turnstile.js';

export function requireAdmin(request) {
  if (!isAdmin(request)) throw new HttpError(401, 'Please sign in again.');
}

/** Everything the admin page shows. */
export async function adminState() {
  const [board, reservations, feedError, delivery] = await Promise.all([getRates(), recentReservations(50), lastError(), deliverySummary()]);
  return {
    ok: true,
    board,
    feedError,
    delivery,
    reservations,
    setup: {
      storage: storeKind === 'redis',
      email: emailConfigured(),
      notifyEmail: notifyAddress(),
      customerEmail: canEmailCustomers(),
      turnstile: turnstileConfigured(),
    },
  };
}
