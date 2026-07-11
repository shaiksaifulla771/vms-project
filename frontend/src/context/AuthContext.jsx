import React, { createContext, useState, useEffect, useContext } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

// Safe local storage helpers
const getSafeToken = () => {
  try {
    return localStorage.getItem('vms_auth_token');
  } catch (e) {
    console.warn('LocalStorage is disabled or restricted in this environment.');
    return null;
  }
};

const setSafeToken = (token) => {
  try {
    localStorage.setItem('vms_auth_token', token);
  } catch (e) {
    console.error('Failed to write auth token to LocalStorage:', e);
  }
};

const removeSafeToken = () => {
  try {
    localStorage.removeItem('vms_auth_token');
  } catch (e) {
    console.error('Failed to remove auth token from LocalStorage:', e);
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Validate session token on mount
    const checkUserLoggedIn = async () => {
      const token = getSafeToken();
      if (!token) {
        setLoading(false);
        return;
      }
      
      try {
        const res = await api.get('/api/auth/me');
        if (res.data && res.data.success) {
          setUser(res.data.user);
        } else {
          removeSafeToken();
        }
      } catch (err) {
        console.error('Failed to validate session token', err);
        removeSafeToken();
      } finally {
        setLoading(false);
      }
    };

    checkUserLoggedIn();
  }, []);

  const login = async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/api/auth/login', { email, password });
      if (res.data && res.data.success) {
        setSafeToken(res.data.token);
        setUser(res.data.user);
        return { success: true };
      }
    } catch (err) {
      if (err.response?.status === 403 && err.response?.data?.requireVerification) {
        return {
          success: false,
          requireVerification: true,
          email: err.response.data.email,
          error: err.response.data.error
        };
      }
      const msg = err.response?.data?.error || 'Authentication failed. Invalid email or password.';
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setLoading(false);
    }
  };

  const register = async (username, email, password, role) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/api/auth/register', { username, email, password, role });
      if (res.data && res.data.success && res.data.token) {
        setSafeToken(res.data.token);
        setUser(res.data.user);
      }
      return { success: true, data: res.data };
    } catch (err) {
      const msg = err.response?.data?.error || 'Registration failed.';
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async (email, otp) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/api/auth/verify-otp', { email, otp });
      if (res.data && res.data.success) {
        setSafeToken(res.data.token);
        setUser(res.data.user);
        return { success: true };
      }
    } catch (err) {
      const msg = err.response?.data?.error || 'OTP verification failed.';
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    removeSafeToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, login, register, verifyOtp, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
