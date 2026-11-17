import { deliverySummary } from '../lib/delivery.js';
import { json } from '../lib/http.js';

// No customer details, request IDs or business volumes are exposed publicly.
export async function GET() {
  try {
    const { status, ready, reasons, checkedAt } = await deliverySummary();
    return json({ status, ready, reasons, checkedAt });
  } catch {
    return json({ status: 'unavailable', reasons: ['storage_unavailable'], checkedAt: new Date().toISOString() }, 503);
  }
}
