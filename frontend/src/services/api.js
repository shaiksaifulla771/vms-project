import axios from 'axios';
import { auth } from '../config/firebase';

let memoryToken = null;

export const setToken = (token) => {
  memoryToken = token || null;
  if (token) {
    try { sessionStorage.setItem('vms_access_token', token); } catch (e) {}
    try { localStorage.setItem('vms_access_token', token); } catch (e) {}
  } else {
    try { sessionStorage.removeItem('vms_access_token'); } catch (e) {}
    try { localStorage.removeItem('vms_access_token'); } catch (e) {}
  }
};

export const getToken = () => {
  if (memoryToken) return memoryToken;
  try {
    const stored = sessionStorage.getItem('vms_access_token') || localStorage.getItem('vms_access_token');
    if (stored) {
      memoryToken = stored;
      return stored;
    }
  } catch (e) {}
  return null;
};

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true
});

// Request Interceptor: Attach Firebase ID Token or legacy token to outgoing requests
api.interceptors.request.use(async (config) => {
  if (config.url && config.url.startsWith('/api/')) {
    config.url = config.url.replace(/^\/api\//, '/');
  }

  let activeToken = null;

  // 1. Prefer live Firebase ID Token if user is logged into Firebase Client SDK
  if (auth && auth.currentUser) {
    try {
      activeToken = await auth.currentUser.getIdToken();
    } catch (e) {
      console.warn('[Firebase Auth] Failed to fetch ID token:', e.message);
    }
  }

  // 2. Fallback to memory / stored session token if available
  if (!activeToken) {
    activeToken = getToken();
  }

  if (activeToken) {
    config.headers = config.headers || {};
    if (typeof config.headers.set === 'function') {
      config.headers.set('Authorization', `Bearer ${activeToken}`);
    }
    config.headers['Authorization'] = `Bearer ${activeToken}`;
    config.headers.Authorization = `Bearer ${activeToken}`;
  }

  // Attach active operating location headers if present in storage
  try {
    const activeSiteId = sessionStorage.getItem('vms_active_site_id') || localStorage.getItem('vms_active_site_id');
    const activeWhId = sessionStorage.getItem('vms_active_warehouse_id') || localStorage.getItem('vms_active_warehouse_id');
    config.headers = config.headers || {};
    if (activeSiteId) {
      config.headers['X-Site-Id'] = activeSiteId;
    }
    if (activeWhId && activeWhId !== 'all') {
      config.headers['X-Warehouse-Id'] = activeWhId;
    }
  } catch (e) {}

  return config;
});

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Response Interceptor: Handle 401s and silent refresh
api.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error.config;
    const reqUrl = originalRequest?.url || '';

    // Never attempt silent refresh on authentication endpoints (login, register, refresh, verify-otp)
    const isAuthEndpoint = reqUrl.includes('auth') || reqUrl.includes('login') || reqUrl.includes('register') || reqUrl.includes('refresh') || reqUrl.includes('verify-otp');

    // If 401 on a non-auth protected route, attempt silent token refresh
    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      
      if (isRefreshing) {
        // If a refresh is already in progress, queue this request
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          if (originalRequest.headers && typeof originalRequest.headers.set === 'function') {
            originalRequest.headers.set('Authorization', `Bearer ${token}`);
          }
          originalRequest.headers['Authorization'] = `Bearer ${token}`;
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        }).catch(err => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Request a new token (cookie is sent automatically)
        const { data } = await axios.post('/auth/refresh', {}, { 
          baseURL: import.meta.env.VITE_API_URL || '/api',
          withCredentials: true 
        });
        
        const newToken = data.token || data.accessToken;
        setToken(newToken);

        if (originalRequest.headers && typeof originalRequest.headers.set === 'function') {
          originalRequest.headers.set('Authorization', `Bearer ${newToken}`);
        }
        originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        
        // Resolve all queued requests
        processQueue(null, newToken);
        
        // Retry the original request
        return api(originalRequest);
      } catch (refreshError) {
        setToken(null);
        processQueue(refreshError, null);
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
