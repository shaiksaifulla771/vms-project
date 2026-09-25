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

function baseHeaders(scoped) {
  const headers = {};
  const uid = prefs.userId();
  if (uid) headers['X-User-Id'] = uid;
  if (scoped) {
    const loc = prefs.locationId();
    const wh = prefs.warehouseId();
    if (loc) headers['X-Location-Id'] = loc;
    if (wh) headers['X-Warehouse-Id'] = wh;
  }
  return headers;
}

const UNREACHABLE_MESSAGE = 'Cannot reach the server - it may be restarting. Please try again in a few seconds.';
// Covers the few seconds the API is down while `npm run dev` restarts it after a file change.
const GET_RETRY_DELAYS_MS = [500, 1000, 2000];
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

// The dev proxy answers 500 with an empty body when the API is down; real API errors always carry JSON.
function isUnreachable(status, text) {
  return status === 502 || status === 504 || (status >= 500 && !text);
}

// Worth another try for a read: API down, or API up but its database briefly unreachable (503).
const isRetryable = (status, text) => isUnreachable(status, text) || status === 503;

function unreachableError(cause) {
  const err = new Error(UNREACHABLE_MESSAGE);
  err.status = 0;
  err.unreachable = true;
  if (cause) err.cause = cause;
  return err;
}

async function request(method, path, body, { scoped = true } = {}) {
  const headers = { 'Content-Type': 'application/json', ...baseHeaders(scoped) };
  // Only reads are retried: a write may already have been saved before the connection dropped.
  const delays = method === 'GET' ? GET_RETRY_DELAYS_MS : [];
  for (let attempt = 0; ; attempt += 1) {
    let res;
    let text;
    try {
      res = await fetch(`${BASE}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      text = await res.text();
    } catch (cause) {
      if (attempt < delays.length) { await sleep(delays[attempt]); continue; }
      throw unreachableError(cause);
    }
    if (isRetryable(res.status, text) && attempt < delays.length) {
      await sleep(delays[attempt]);
      continue;
    }
    if (isUnreachable(res.status, text)) throw unreachableError();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
    if (!res.ok) {
      const err = new Error((data && data.error) || `Request failed (${res.status})`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }
}

/** Download a file from the API (sends the acting-user header, then saves the blob). */
async function download(path, fallbackName = 'download') {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, { headers: baseHeaders(false) });
  } catch (cause) {
    throw unreachableError(cause);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (isUnreachable(res.status, text)) throw unreachableError();
    let msg = `Download failed (${res.status})`;
    try { msg = JSON.parse(text).error || msg; } catch { /* not json */ }
    throw new Error(msg);
  }
  const cd = res.headers.get('Content-Disposition') || '';
  const name = /filename="?([^"]+)"?/.exec(cd)?.[1] || fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Read a File as base64 (no data: prefix). */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error('Could not read the file'));
    r.readAsDataURL(file);
  });
}

export const api = {
  get: (p, o) => request('GET', p, undefined, o),
  post: (p, b, o) => request('POST', p, b ?? {}, o),
  put: (p, b, o) => request('PUT', p, b ?? {}, o),
  patch: (p, b, o) => request('PATCH', p, b ?? {}, o),
  del: (p, o) => request('DELETE', p, undefined, o),
  download,
};

export function qs(params) {
  const s = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') s.set(k, v);
  });
  const str = s.toString();
  return str ? `?${str}` : '';
}
