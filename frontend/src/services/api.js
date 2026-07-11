import axios from 'axios';

// Determine the base API URL to bypass proxy issues on localhost
const getBaseURL = () => {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    return `http://${hostname}:5000`; // Dynamically map port 5000 using active browser hostname
  }
  return '';
};

// Create custom instance
const api = axios.create({
  baseURL: getBaseURL(),
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add authorization header
api.interceptors.request.use(
  (config) => {
    try {
      const token = localStorage.getItem('vms_auth_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (e) {
      console.warn('LocalStorage access blocked:', e);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle token expiry / unauthenticated states
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      try {
        localStorage.removeItem('vms_auth_token');
      } catch (e) {}
    }
    return Promise.reject(error);
  }
);

export default api;
