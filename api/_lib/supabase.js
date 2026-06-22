// api/_lib/supabase.js
// Thin, parameterized wrapper over the Supabase REST API using the service-role key.
// The service key is ONLY ever used here, server-side. It is never sent to the browser.
// All filters are URL-encoded by callers; we never build raw SQL.

const URL = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_KEY;

function headers(extra = {}) {
  return {
    apikey: KEY(),
    Authorization: `Bearer ${KEY()}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function handle(res) {
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase ${res.status}: ${text.slice(0, 300)}`);
  }
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : null;
}

// SELECT — query is a raw PostgREST query string already URL-encoded by the caller,
// e.g. `owner=eq.${encodeURIComponent(p)}&select=id,full_report`
export async function sbSelect(table, query) {
  const res = await fetch(`${URL()}/rest/v1/${table}?${query}`, { headers: headers() });
  return handle(res);
}

export async function sbInsert(table, row, { returning = false } = {}) {
  const res = await fetch(`${URL()}/rest/v1/${table}`, {
    method: 'POST',
    headers: headers({ Prefer: returning ? 'return=representation' : 'return=minimal' }),
    body: JSON.stringify(row),
  });
  const data = await handle(res);
  return returning && Array.isArray(data) ? data[0] : data;
}

export async function sbUpdate(table, query, patch, { returning = false } = {}) {
  const res = await fetch(`${URL()}/rest/v1/${table}?${query}`, {
    method: 'PATCH',
    headers: headers({ Prefer: returning ? 'return=representation' : 'return=minimal' }),
    body: JSON.stringify(patch),
  });
  const data = await handle(res);
  return returning && Array.isArray(data) ? data[0] : data;
}

// UPSERT on a unique/primary-key conflict target.
export async function sbUpsert(table, row, onConflict, { returning = true } = {}) {
  const res = await fetch(`${URL()}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: headers({ Prefer: `resolution=merge-duplicates,${returning ? 'return=representation' : 'return=minimal'}` }),
    body: JSON.stringify(row),
  });
  const data = await handle(res);
  return returning && Array.isArray(data) ? data[0] : data;
}

export async function sbDelete(table, query) {
  const res = await fetch(`${URL()}/rest/v1/${table}?${query}`, { method: 'DELETE', headers: headers() });
  return handle(res);
}
