import React, { createContext, useState, useEffect, useContext } from 'react';
import api, { setToken } from '../services/api';
import { 
  auth, 
  googleProvider, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  sendEmailVerification, 
  sendPasswordResetEmail, 
  signOut, 
  onAuthStateChanged 
} from '../config/firebase';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Synchronize backend MongoDB user state from /api/auth/me
  const syncBackendUser = async (fbUser) => {
    if (!fbUser) {
      setUser(null);
      setFirebaseUser(null);
      setToken(null);
      return null;
    }

    try {
      const idToken = await fbUser.getIdToken();
      setToken(idToken);
      setFirebaseUser(fbUser);

      const res = await api.get('/auth/me');
      if (res.data && res.data.success) {
        setUser(res.data.user);
        return res.data.user;
      }
    } catch (err) {
      if (err.response?.status === 403 && err.response?.data?.requireVerification) {
        const unverifiedUser = {
          email: fbUser.email,
          emailVerified: false,
          accountStatus: 'EMAIL_UNVERIFIED'
        };
        setUser(unverifiedUser);
        return unverifiedUser;
      } else if (err.response?.status === 403 && err.response?.data?.accountStatus) {
        const restrictedUser = {
          email: fbUser.email,
          emailVerified: fbUser.emailVerified,
          accountStatus: err.response.data.accountStatus
        };
        setUser(restrictedUser);
        return restrictedUser;
      } else {
        setUser(null);
      }
    }
    return null;
  };

  // Authoritative Firebase Auth State Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setLoading(true);
      await syncBackendUser(fbUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginWithEmailPassword = async (email, password) => {
    setError(null);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const backendUser = await syncBackendUser(userCredential.user);
      return { success: true, firebaseUser: userCredential.user, user: backendUser };
    } catch (err) {
      let msg = err.message;
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        msg = 'Invalid email or password.';
      } else if (err.code === 'auth/too-many-requests') {
        msg = 'Too many failed attempts. Please try again later.';
      }
      setError(msg);
      return { success: false, error: msg };
    }
  };

  const loginWithGoogle = async () => {
    setError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const fbUser = result.user;

      // Register or sync Google account with MongoDB backend
      let backendUser = null;
      try {
        const syncRes = await api.post('/auth/register-sync', {
          username: fbUser.displayName || fbUser.email.split('@')[0],
          requestedRole: 'Viewer'
        });
        if (syncRes.data && syncRes.data.success) {
          backendUser = syncRes.data.user;
        }
      } catch (syncErr) {
        // Ignored if user already exists
      }

      backendUser = await syncBackendUser(fbUser);
      return { success: true, firebaseUser: fbUser, user: backendUser };
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        const msg = err.message || 'Google sign-in failed.';
        setError(msg);
        return { success: false, error: msg };
      }
      return { success: false, error: 'Sign in cancelled' };
    }
  };

  const registerWithEmailPassword = async (username, email, password, requestedRole = 'Viewer') => {
    setError(null);
    try {
      // 1. Create Firebase Auth user
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const fbUser = userCredential.user;

      // 2. Send Firebase email verification link
      await sendEmailVerification(fbUser);

      // 3. Synchronize with MongoDB backend (accountStatus: PENDING)
      const syncRes = await api.post('/auth/register-sync', {
        username: username || email.split('@')[0],
        requestedRole: requestedRole
      });

      await syncBackendUser(fbUser);

      return { 
        success: true, 
        firebaseUser: fbUser, 
        message: 'Account created. Please check your inbox to verify your email. Access request is pending administrator approval.',
        data: syncRes.data
      };
    } catch (err) {
      let msg = err.message || 'Registration failed.';
      if (err.code === 'auth/email-already-in-use') {
        msg = 'An account with this email address already exists.';
      } else if (err.code === 'auth/weak-password') {
        msg = 'Password should be at least 6 characters.';
      }
      setError(msg);
      return { success: false, error: msg };
    }
  };

  const sendVerificationEmail = async () => {
    if (!auth.currentUser) return { success: false, error: 'No user signed in' };
    try {
      await sendEmailVerification(auth.currentUser);
      return { success: true, message: 'Verification email sent. Check your inbox.' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const sendPasswordReset = async (email) => {
    try {
      // 1. Send Firebase password reset email if configured
      await sendPasswordResetEmail(auth, email).catch(() => {});
      
      // 2. Dispatch custom Brevo VMS Password Reset Link via backend
      const res = await api.post('/auth/forgot-password', { email });
      if (res.data && res.data.success) {
        return { success: true, message: res.data.message };
      }
      return { success: true, message: 'Password reset link sent to your email inbox.' };
    } catch (err) {
      return { success: false, error: err.response?.data?.error || 'Failed to send password reset link to your email.' };
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.warn('Firebase logout warning:', e);
    } finally {
      setToken(null);
      setUser(null);
      setFirebaseUser(null);
    }
  };

  const hasAnyRole = (roles) => {
    if (!user || !user.role) return false;
    return roles.includes(user.role);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      setUser, 
      firebaseUser, 
      loading, 
      error, 
      loginWithEmailPassword, 
      loginWithGoogle, 
      registerWithEmailPassword, 
      sendVerificationEmail, 
      sendPasswordReset, 
      logout, 
      hasAnyRole,
      refreshUserStatus: () => syncBackendUser(auth.currentUser)
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
