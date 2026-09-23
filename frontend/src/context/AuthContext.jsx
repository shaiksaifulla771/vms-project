import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import api, { getActingUserId, setActingUserId } from '../services/api';

/**
 * No-login session.
 *
 * The login page has been removed. The backend runs every request as an
 * "acting user" (see backend/middleware/authMiddleware.js):
 *   - the user chosen in the header switcher (sent as X-User-Id), or
 *   - the first ACTIVE Admin by default.
 * Role-based access control still applies to the acting user's role.
 */
const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [actingUsers, setActingUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [meRes, usersRes] = await Promise.all([
        api.get('/auth/me'),
        api.get('/auth/acting-users').catch(() => ({ data: { data: [] } })),
      ]);
      const me = meRes.data?.user || null;
      setUser(me);
      setActingUsers(usersRes.data?.data || []);
      // If a stale acting-user id was stored, align it with what the server resolved
      if (me && getActingUserId() && String(getActingUserId()) !== String(me.id)) {
        setActingUserId(me.id);
      }
    } catch (err) {
      setUser(null);
      setError(err.response?.data?.error || 'Cannot reach the ERP server. Make sure the backend is running.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // Switch the acting user (replaces login / logout)
  const switchUser = useCallback(async (userId) => {
    setActingUserId(userId || null);
    await loadSession();
  }, [loadSession]);

  const hasAnyRole = (roles) => {
    if (!user || !user.role) return false;
    return user.role === 'Admin' || roles.includes(user.role);
  };

  // Kept for compatibility with components that still call logout():
  // resets to the default (Admin) acting user.
  const logout = async () => switchUser(null);

  return (
    <AuthContext.Provider value={{
      user,
      setUser,
      loading,
      error,
      actingUsers,
      switchUser,
      logout,
      hasAnyRole,
      refreshUserStatus: loadSession,
    }}>
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
