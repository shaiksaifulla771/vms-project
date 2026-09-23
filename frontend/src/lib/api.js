/**
 * Minimal JSON API client. The backend runs every request as the "acting user"
 * (X-User-Id) and scopes lists by the global Location / WH selector.
 */
const BASE = import.meta.env.VITE_API_URL || '/api';

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* ignore */ } },
};

export const prefs = {
  userId: () => store.get('erp.userId'),
  setUserId: (v) => store.set('erp.userId', v),
  locationId: () => store.get('erp.locationId'),
  setLocationId: (v) => store.set('erp.locationId', v),
  warehouseId: () => store.get('erp.warehouseId'),
  setWarehouseId: (v) => store.set('erp.warehouseId', v),
};

async function request(method, path, body, { scoped = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const uid = prefs.userId();
  if (uid) headers['X-User-Id'] = uid;
  if (scoped) {
    const loc = prefs.locationId();
    const wh = prefs.warehouseId();
    if (loc) headers['X-Location-Id'] = loc;
    if (wh) headers['X-Warehouse-Id'] = wh;
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  get: (p, o) => request('GET', p, undefined, o),
  post: (p, b, o) => request('POST', p, b ?? {}, o),
  put: (p, b, o) => request('PUT', p, b ?? {}, o),
  patch: (p, b, o) => request('PATCH', p, b ?? {}, o),
};

export function qs(params) {
  const s = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') s.set(k, v);
  });
  const str = s.toString();
  return str ? `?${str}` : '';
}
