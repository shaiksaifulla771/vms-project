import axios from 'axios';

/**
 * API client (no-login mode).
 *
 * There is no login/token flow. The backend runs each request as the
 * "acting user" given by the X-User-Id header (chosen in the header's user
 * switcher) or, if none, as the default Admin.
 */

const ACTING_USER_KEY = 'erp_acting_user_id';

export const getActingUserId = () => {
  try {
    return localStorage.getItem(ACTING_USER_KEY);
  } catch (e) {
    return null;
  }
};

export const setActingUserId = (id) => {
  try {
    if (id) localStorage.setItem(ACTING_USER_KEY, String(id));
    else localStorage.removeItem(ACTING_USER_KEY);
  } catch (e) { /* storage unavailable */ }
};

// Legacy token helpers kept as no-ops so older imports keep working
export const setToken = () => {};
export const getToken = () => null;

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true
});

api.interceptors.request.use((config) => {
  // Allow callers to pass either '/x' or '/api/x'
  if (config.url && config.url.startsWith('/api/')) {
    config.url = config.url.replace(/^\/api\//, '/');
  }

  config.headers = config.headers || {};

  const actingUserId = getActingUserId();
  if (actingUserId) {
    config.headers['X-User-Id'] = actingUserId;
  }

  // Attach active operating location headers if present in storage
  try {
    const activeSiteId = sessionStorage.getItem('vms_active_site_id') || localStorage.getItem('vms_active_site_id');
    const activeWhId = sessionStorage.getItem('vms_active_warehouse_id') || localStorage.getItem('vms_active_warehouse_id');
    if (activeSiteId) {
      config.headers['X-Site-Id'] = activeSiteId;
    }
    if (activeWhId && activeWhId !== 'all') {
      config.headers['X-Warehouse-Id'] = activeWhId;
    }
  } catch (e) { /* storage unavailable */ }

  return config;
});

export default api;
