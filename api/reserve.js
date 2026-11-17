import { clientIp, fail, json, readJson } from '../lib/http.js';
import { submitReservation } from '../lib/reservations.js';

export async function POST(request) {
  try {
    return json(await submitReservation(await readJson(request), clientIp(request)));
  } catch (error) {
    return fail(error);
  }
}
