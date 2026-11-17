import { requireAdmin } from '../../lib/admin.js';
import { getDelivery, handleManually, processDelivery } from '../../lib/delivery.js';
import { fail, HttpError, json, readJson } from '../../lib/http.js';

export async function POST(request) {
  try {
    requireAdmin(request);
    const origin = request.headers.get('origin');
    if (origin !== new URL(request.url).origin) throw new HttpError(403, 'Open this action from the shop admin page.');
    const { id, action } = await readJson(request);
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id) || !['retry', 'handled'].includes(action)) throw new HttpError(400, 'Invalid action.');
    if (!await getDelivery(id)) throw new HttpError(404, 'Request not found.');
    const delivery = action === 'handled' ? await handleManually(id) : await processDelivery(id);
    return json({ ok: true, delivery });
  } catch (error) { return fail(error); }
}
