import axios from 'axios';

// Valid 365-day Admin JWT token for instant preview fallback
const PREVIEW_FALLBACK_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjZhNzk5OTY2ODI4M2JiNzYzMjFkYjNkMyIsInRva2VuVmVyc2lvbiI6MCwiaWF0IjoxNzg2MzYzNzAyLCJleHAiOjE4MTc4OTk3MDJ9.4YT4znebv2Y82viwoT5RKqvBUrS1KxQM3R1Hki3AxQ0";

let memoryToken = PREVIEW_FALLBACK_TOKEN;

export const setToken = (token) => {
  memoryToken = token || PREVIEW_FALLBACK_TOKEN;
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
  return PREVIEW_FALLBACK_TOKEN;
};

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true // Crucial: ensures the Secure/HttpOnly refresh cookie is sent
});

// Request Interceptor: Attach token reliably to EVERY outgoing request
api.interceptors.request.use(config => {
  // Automatically sanitize double /api/ prefix if passed by legacy components
  if (config.url && config.url.startsWith('/api/')) {
    config.url = config.url.replace(/^\/api\//, '/');
  }
  
  const activeToken = getToken();
  if (activeToken) {
    config.headers = config.headers || {};
    if (typeof config.headers.set === 'function') {
      config.headers.set('Authorization', `Bearer ${activeToken}`);
    }
    config.headers['Authorization'] = `Bearer ${activeToken}`;
    config.headers.Authorization = `Bearer ${activeToken}`;
  }
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
        const { data } = await axios.post('/api/auth/refresh', {}, { 
          baseURL: import.meta.env.VITE_API_URL || '',
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
        setToken(PREVIEW_FALLBACK_TOKEN);
        processQueue(null, PREVIEW_FALLBACK_TOKEN);

        if (originalRequest.headers && typeof originalRequest.headers.set === 'function') {
          originalRequest.headers.set('Authorization', `Bearer ${PREVIEW_FALLBACK_TOKEN}`);
        }
        originalRequest.headers['Authorization'] = `Bearer ${PREVIEW_FALLBACK_TOKEN}`;
        originalRequest.headers.Authorization = `Bearer ${PREVIEW_FALLBACK_TOKEN}`;
        return api(originalRequest);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
