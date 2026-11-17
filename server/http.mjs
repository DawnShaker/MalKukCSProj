import { HttpError } from './errors.mjs';
import { resolveOperation } from './agency.mjs';

const headers = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Resource-Policy': 'same-origin',
  Vary: 'Origin, Sec-Fetch-Site',
};
const json = (data, status = 200) => Response.json(data, { status, headers });

export function createHandler(getStore) {
  return async function handle(request) {
    try {
      const url = new URL(request.url);
      const origin = request.headers.get('origin');
      if (request.headers.get('sec-fetch-site') === 'cross-site' || (origin && origin !== url.origin)) {
        throw new HttpError(403, 'Запити з іншого сайту заборонено.');
      }
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
      const path = url.pathname.replace(/^\/(?:api|\.netlify\/functions\/api)(?:\/|$)/, '/').replace(/\/$/, '');
      if (path === '/health' && request.method === 'GET') {
        const store = getStore();
        await store.read();
        return json({ status: 'ok', storage: store.kind });
      }
      let dto = {};
      if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
        if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new HttpError(415, 'Очікується application/json.');
        const body = await request.text();
        if (new TextEncoder().encode(body).length > 65536) throw new HttpError(413, 'Запит занадто великий.');
        try { dto = JSON.parse(body); } catch { throw new HttpError(400, 'Некоректний JSON.'); }
        if (!dto || typeof dto !== 'object' || Array.isArray(dto)) throw new HttpError(400, 'Очікується JSON-об’єкт.');
      }
      const operation = resolveOperation(request.method, path, dto, url.searchParams);
      const store = getStore();
      const result = operation.mutates
        ? await store.mutate(operation.execute)
        : operation.execute(await store.read());
      return json(result);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      // No internal errors, file paths, upstream responses or credentials in browser responses.
      console.error('Agency API failed:', error.name);
      return json({ error: 'Внутрішня помилка сервера.' }, 500);
    }
  };
}
