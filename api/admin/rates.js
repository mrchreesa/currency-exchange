import { adminState, requireAdmin } from '../../lib/admin.js';
import { fail, HttpError, json, readJson } from '../../lib/http.js';
import { clearManual, refreshAuto, setManual } from '../../lib/rates.js';

// { action: 'save', rates: { EUR: { sell, buy } } }  owner prices until the next 9:00am
// { action: 'reset', codes?: ['EUR'] }                back to No1's rates (all when codes is left out)
// { action: 'refresh' }                               pull No1's rates again now
export async function POST(request) {
  try {
    requireAdmin(request);
    const body = await readJson(request);
    if (body.action === 'save') await setManual(body.rates);
    else if (body.action === 'reset') await clearManual(Array.isArray(body.codes) ? body.codes : null);
    else if (body.action === 'refresh') {
      try {
        await refreshAuto();
      } catch (error) {
        throw new HttpError(502, `Couldn’t reach No1’s rates just now (${error.message}). The board keeps the last ones.`);
      }
    } else throw new HttpError(400, 'Unknown action.');
    return json(await adminState());
  } catch (error) {
    return fail(error);
  }
}
