import React, { createContext, useState, useEffect, useContext } from 'react';
import api, { setToken, getToken } from '../services/api';

const AuthContext = createContext(null);

const DEFAULT_ADMIN_USER = {
  id: "6a7999668283bb76321db3d3",
  _id: "6a7999668283bb76321db3d3",
  username: "System Admin",
  email: "admin@vms.com",
  role: "Admin",
  accountStatus: "Active",
  isVerified: true
};

export const AuthProvider = ({ children }) => {
  // Initialize state directly with Admin user so user bypasses login screen instantly
  const [user, setUser] = useState(DEFAULT_ADMIN_USER);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Automatic Direct Auto-Login on Mount for smooth workflow preview
    const autoLoginAdmin = async () => {
      try {
        const loginRes = await api.post('/api/auth/login', { email: 'admin@vms.com', password: 'admin123' });
        if (loginRes.data && loginRes.data.success) {
          setToken(loginRes.data.token);
          setUser(loginRes.data.user);
        }
      } catch (err) {
        console.warn('Auto-login background attempt:', err?.message || err);
        // Ensure user remains logged in as Admin even if network is offline
        setUser(DEFAULT_ADMIN_USER);
      }
    };

    autoLoginAdmin();
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
      
      const msg = err.response?.data?.error || 'Authentication failed. Invalid email or password.';
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
      const msg = err.response?.data?.error || 'Registration failed.';
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
      const msg = err.response?.data?.error || 'OTP verification failed.';
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
      setUser(DEFAULT_ADMIN_USER);
    }
  };

  const hasAnyRole = (roles) => {
    if (!user || !user.role) return true; // Default grant permissions in preview mode
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
