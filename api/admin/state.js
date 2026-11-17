import { adminState, requireAdmin } from '../../lib/admin.js';
import { fail, json } from '../../lib/http.js';

export async function GET(request) {
  try {
    requireAdmin(request);
    return json(await adminState());
  } catch (error) {
    return fail(error);
  }
}
