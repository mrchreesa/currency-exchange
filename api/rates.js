import { fail, json } from '../lib/http.js';
import { getRates } from '../lib/rates.js';

export async function GET() {
  try {
    const { auto, ...board } = await getRates();
    // Short CDN cache: the board is at most 30 seconds behind a 9am change or an owner edit.
    return json(board, 200, { 'cache-control': 'public, max-age=0, s-maxage=30' });
  } catch (error) {
    return fail(error);
  }
}
