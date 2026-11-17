export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

/** Turns thrown errors into JSON replies; anything unexpected is logged and kept vague. */
export function fail(error) {
  if (error instanceof HttpError || error.status) {
    return json({ ok: false, error: error.message, ...(error.extra ?? {}) }, error.status);
  }
  console.error(error);
  return json({ ok: false, error: 'Something went wrong on our side. Please try again, or call us on 020 8951 1500.' }, 500);
}

/** Reads a small JSON body. Requiring JSON also blocks cross-site form posts. */
export async function readJson(request, maxBytes = 8000) {
  if (!(request.headers.get('content-type') ?? '').includes('application/json')) {
    throw new HttpError(415, 'Send the form as JSON.');
  }
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, 'That request is too large.');
  try {
    return JSON.parse(text) ?? {};
  } catch {
    throw new HttpError(400, 'That request could not be read.');
  }
}

export function clientIp(request) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0];
  return (request.headers.get('x-real-ip') || forwarded || 'unknown').trim();
}

export const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
