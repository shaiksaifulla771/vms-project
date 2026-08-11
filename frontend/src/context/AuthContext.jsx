import React, { createContext, useState, useEffect, useContext } from 'react';
import api, { setToken, getToken } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const restoreSession = async () => {
      const token = getToken();
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const res = await api.get('/api/auth/me');
        if (res.data?.success) {
          setUser(res.data.user);
        }
      } catch (err) {
        setToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    restoreSession();
  }, []);

  const login = async (email, password, options = {}) => {
    setError(null);
    try {
      const res = await api.post('/api/auth/login', { email, password });
      if (res.data && res.data.success) {
        setToken(res.data.token);
        if (!options.delaySession) {
          setUser(res.data.user);
        }
        return { success: true, user: res.data.user };
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
      
      const msg = err.response?.data?.error || err.response?.data?.message || 'Authentication failed. Invalid email or password.';
      setError(msg);
      return { success: false, error: msg };
    }
  };

  const register = async (username, email, password, role) => {
    setError(null);
    try {
      const res = await api.post('/api/auth/register', { username, email, password, role });
      if (res.data && res.data.success && res.data.token) {
        setToken(res.data.token);
        setUser(res.data.user);
      }
      return { success: true, data: res.data };
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.message || 'Registration failed.';
      setError(msg);
      return { success: false, error: msg };
    }
  };

  const verifyOtp = async (email, otp) => {
    setError(null);
    try {
      const res = await api.post('/api/auth/verify-otp', { email, otp });
      if (res.data && res.data.success) {
        if (res.data.token) {
          setToken(res.data.token);
          setUser(res.data.user);
        }
        return { success: true, message: res.data.message };
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.message || 'OTP verification failed.';
      setError(msg);
      return { success: false, error: msg };
    }
  };

  const logout = async () => {
    try {
      await api.post('/api/auth/logout');
    } catch (e) {
      console.warn('Logout request failed:', e);
    } finally {
      setToken(null);
      setUser(null);
    }
  };

  const hasAnyRole = (roles) => {
    if (!user || !user.role) return false;
    return roles.includes(user.role);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, error, login, register, verifyOtp, logout, hasAnyRole }}>
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
