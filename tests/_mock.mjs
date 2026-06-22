// tests/_mock.mjs — tiny mocks for serverless req/res and a fetch router (Supabase).
import crypto from 'node:crypto';

export function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 400,
    status,
    headers: { get: (h) => (String(h).toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

// Install a fetch router. routes = [{ test(url, opts) -> bool, respond(url, opts) -> response }]
export function installFetch(routes) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: (opts.method || 'GET').toUpperCase(), body: opts.body });
    for (const r of routes) { if (r.test(String(url), opts)) return r.respond(String(url), opts); }
    return jsonResponse({ error: 'unrouted ' + url }, 500);
  };
  return calls;
}

export function makeRes() {
  const res = { statusCode: 200, headers: {}, body: undefined, ended: false };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { res.body = o; res.ended = true; return res; };
  res.end = (x) => { res.ended = true; if (x !== undefined) res.body = x; return res; };
  return res;
}

// JSON request (handlers read req.body object directly via readBody fast-path).
export function makeReqJSON({ method = 'POST', headers = {}, body = {}, query = {}, url = '/' } = {}) {
  const h = {}; for (const k of Object.keys(headers)) h[k.toLowerCase()] = headers[k];
  return { method, headers: h, body, query, url, socket: { remoteAddress: '127.0.0.1' }, on() {} };
}

// Streaming request (for the webhook, which reads the raw body off the stream).
export function makeReqStream({ method = 'POST', headers = {}, buffer = Buffer.from('') } = {}) {
  const h = {}; for (const k of Object.keys(headers)) h[k.toLowerCase()] = headers[k];
  const handlers = {};
  const req = {
    method, headers: h, url: '/', socket: { remoteAddress: '127.0.0.1' },
    on(ev, cb) { handlers[ev] = cb; return req; },
    destroy() {},
  };
  process.nextTick(() => { if (handlers.data) handlers.data(buffer); if (handlers.end) handlers.end(); });
  return req;
}

export const sha256hex = (v, secret) => crypto.createHmac('sha256', secret).update(String(v)).digest('hex');
