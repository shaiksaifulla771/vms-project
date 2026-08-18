import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Clock, ShieldAlert, ArrowLeft, RefreshCw, LogOut } from 'lucide-react';

const ProtectedRoute = ({ allowedRoles }) => {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="flex items-center gap-3 font-semibold text-slate-400">
          <RefreshCw className="h-5 w-5 animate-spin text-blue-500" />
          Loading workspace session...
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // 1. Account Pending Approval State
  const status = (user.accountStatus || '').toUpperCase();
  if (status === 'PENDING') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/90 p-8 shadow-2xl backdrop-blur-xl">
          <div className="mb-4 inline-flex items-center justify-center rounded-xl bg-amber-500/20 p-3 text-amber-400 border border-amber-500/30">
            <Clock className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-black tracking-tight text-white">Access Request Pending</h2>
          <p className="mt-2 text-sm text-slate-400 leading-relaxed">
            Your account <span className="font-semibold text-slate-200">{user.email}</span> is registered in the system. An administrator must approve your requested role (<span className="font-bold text-amber-400">{user.requestedRole || user.role}</span>) and assign plant location scopes.
          </p>

          <div className="my-6 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-xs text-slate-400 space-y-1.5">
            <div className="flex justify-between">
              <span>Account Status:</span>
              <span className="font-bold text-amber-400">PENDING_APPROVAL</span>
            </div>
            <div className="flex justify-between">
              <span>Requested Role:</span>
              <span className="font-semibold text-slate-200">{user.requestedRole || user.role || 'Viewer'}</span>
            </div>
            <div className="flex justify-between">
              <span>User ID:</span>
              <span className="font-mono text-slate-400">{user.id || user._id || 'Verified User'}</span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <button 
              onClick={() => window.location.reload()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-bold text-white shadow-md hover:bg-blue-500 transition"
            >
              <RefreshCw className="h-4 w-4" />
              Check Approval Status
            </button>
            <button 
              onClick={logout}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 py-2.5 text-sm font-bold text-slate-400 hover:bg-slate-800 hover:text-white transition"
            >
              <LogOut className="h-4 w-4" />
              Sign Out / Switch Account
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Account Suspended State
  if (status === 'SUSPENDED') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
        <div className="w-full max-w-md rounded-2xl border border-rose-500/20 bg-slate-900 p-8 shadow-2xl">
          <div className="mb-4 inline-flex items-center justify-center rounded-xl bg-rose-500/20 p-3 text-rose-400">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-black tracking-tight text-white">Account Suspended</h2>
          <p className="mt-2 text-sm text-slate-400">
            Access for <span className="font-semibold text-white">{user.email}</span> has been suspended by an administrator.
          </p>
          <button 
            onClick={logout}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-rose-600 py-2.5 text-sm font-bold text-white shadow-md hover:bg-rose-500 transition"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  // 3. Role-Based Access Control (RBAC) Guard
  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role) && user.role !== 'Admin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 p-6 text-slate-100">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center shadow-xl">
          <h1 className="text-4xl font-black text-rose-500 mb-2">403</h1>
          <h2 className="text-xl font-bold mb-2">Access Restricted</h2>
          <p className="text-sm text-slate-400 mb-6">
            Your assigned role (<span className="font-semibold text-white">{user.role}</span>) does not have permission to view this module.
          </p>
          <button 
            onClick={() => window.history.back()}
            className="flex items-center justify-center gap-2 mx-auto px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-500 font-bold transition shadow-md"
          >
            <ArrowLeft className="h-4 w-4" />
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return <Outlet />;
};

export default ProtectedRoute;
