import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Masters from './pages/Masters';
import Vendors from './pages/Vendors';
import Planning from './pages/Planning';
import Inventory from './pages/Inventory';
import Purchasing from './pages/Purchasing';
import Manufacturing from './pages/Manufacturing';
import Quality from './pages/Quality';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Warehouse from './pages/Warehouse';
import Scheduling from './pages/Scheduling';

import ErrorBoundary from './components/ErrorBoundary';
import Sites from './pages/Sites';
import MRP from './pages/MRP';
import VMSWorkbench from './pages/VMSWorkbench';
import EmailTemplates from './pages/EmailTemplates';
import Workflows from './pages/Workflows';
import Plugins from './pages/Plugins';

import AdminControlCenter from './pages/admin/AdminControlCenter';
import NetworkAndSites from './pages/admin/NetworkAndSites';
import AuditAndActivity from './pages/admin/AuditAndActivity';
import UsersAndAccessScope from './pages/admin/UsersAndAccessScope';

// New Routed BOM Module
import BOMRoutes from './pages/bom/BOMRoutes';
import ProductionRoutes from './pages/production/ProductionRoutes';

// AI Chat Integration
import ChatPanel from './features/chat/ChatPanel';
import { Sparkles } from 'lucide-react';

import ResetPassword from './pages/ResetPassword';

// Role-based Route Guard Component
const ProtectedRoute = ({ roles, children }) => {
  const { user } = useAuth();
  const userRole = user?.role || 'Viewer';

  if (!roles.includes(userRole)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-8 bg-slate-900 border border-slate-800 rounded-2xl">
        <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold text-xl mb-4">
          🔒
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Access Strictly Prohibited</h3>
        <p className="text-xs text-slate-400 max-w-md mb-6">
          Your assigned role (<span className="text-amber-400 font-semibold">{userRole}</span>) is not authorized to access this module. Please contact your system administrator to request access scope expansion.
        </p>
        <button
          onClick={() => window.location.href = '/dashboard'}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-lg transition-colors"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  return children;
};

const AppContent = () => {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true); // Full screen mode by default
  const [chatOpen, setChatOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        <p className="text-sm font-semibold text-slate-400">Verifying session credentials...</p>
      </div>
    );
  }

  // Support link-based Password Reset
  if (location.pathname === '/reset-password') {
    return <ResetPassword />;
  }

  // Auto-login fallback if user is null
  if (!user) {
    return <Login />;
  }

  // Handle non-ACTIVE account statuses cleanly
  if (user.accountStatus === 'PENDING' || user.accountStatus === 'Pending') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center text-white">
        <div className="max-w-md bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-2xl space-y-4">
          <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto text-xl font-bold">!</div>
          <h2 className="text-2xl font-bold text-amber-400">Access Request Pending Approval</h2>
          <p className="text-sm text-slate-300">
            Your account ({user.email}) is registered, but requires administrator approval before VMS workspace access is granted.
          </p>
          <div className="pt-4 flex flex-col items-center gap-3">
            <button onClick={() => window.location.reload()} className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 text-sm font-bold rounded-lg text-white transition-colors">
              Check Status
            </button>
            <button onClick={logout} className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 text-sm font-bold rounded-lg text-white border border-slate-600 transition-colors">
              Sign Out &amp; Return to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (user.accountStatus === 'REJECTED' || user.accountStatus === 'Rejected') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center text-white">
        <div className="max-w-md bg-slate-900 p-8 rounded-2xl border border-rose-900/50 shadow-2xl space-y-4">
          <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto text-xl font-bold">X</div>
          <h2 className="text-2xl font-bold text-rose-400">Access Request Rejected</h2>
          <p className="text-sm text-slate-300">
            Your access request for account ({user.email}) was not approved by an administrator.
          </p>
          <div className="pt-4 flex justify-center">
            <button onClick={logout} className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 text-sm font-bold rounded-lg text-white border border-slate-600 transition-colors">
              Sign Out &amp; Return to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (user.accountStatus === 'SUSPENDED' || user.accountStatus === 'DISABLED') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center text-white">
        <div className="max-w-md bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-2xl space-y-4">
          <h2 className="text-2xl font-bold text-slate-400">Account Deactivated</h2>
          <p className="text-sm text-slate-400">
            Your account ({user.email}) is currently suspended or disabled. Contact your administrator.
          </p>
          <div className="pt-4 flex justify-center">
            <button onClick={logout} className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 text-sm font-bold rounded-lg text-white border border-slate-600 transition-colors">
              Sign Out &amp; Return to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Derive activePage from the first URL segment
  let activePage = location.pathname.split('/')[1] || 'dashboard';
  const sidebarActivePage = activePage === 'bom' ? 'boms' : activePage;

  const setActivePage = (page) => {
    if (page === 'boms') navigate('/bom');
    else navigate(`/${page}`);
  };

  return (
    <div className="min-h-screen bg-slate-50/50 flex">
      {/* Sidebar navigation */}
      <Sidebar
        activePage={sidebarActivePage}
        setActivePage={setActivePage}
        isCollapsed={sidebarCollapsed}
        setIsCollapsed={setSidebarCollapsed}
      />

      {/* Main page context */}
      <div className="flex-1 pl-0 flex flex-col min-h-screen transition-all duration-300">
        {/* Top Header navbar */}
        <Header
          activePage={sidebarActivePage}
          sidebarCollapsed={sidebarCollapsed}
          setSidebarCollapsed={setSidebarCollapsed}
        />

        {/* Central content area */}
        <main className="flex-1 pt-16 p-8 overflow-y-auto">
          <div className="w-full h-full">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" />} />
              <Route path="/dashboard/*" element={<AdminControlCenter />} />
              <Route path="/sites/*" element={<ProtectedRoute roles={['Admin']}><NetworkAndSites /></ProtectedRoute>} />
              <Route path="/users-access/*" element={<ProtectedRoute roles={['Admin']}><UsersAndAccessScope /></ProtectedRoute>} />
              <Route path="/vms/*" element={<ProtectedRoute roles={['Admin', 'Warehouse', 'Warehouse Operator', 'ProcurementManager', 'Purchaser', 'Vendor']}><VMSWorkbench /></ProtectedRoute>} />
              <Route path="/masters/*" element={<Masters />} />
              <Route path="/mrp/*" element={<ProtectedRoute roles={['Admin', 'Inventory', 'Inventory Manager', 'Production', 'Production Manager', 'Planner']}><MRP /></ProtectedRoute>} />
              <Route path="/warehouse/*" element={<ProtectedRoute roles={['Admin', 'Inventory', 'Inventory Manager', 'Warehouse', 'Warehouse Operator']}><Warehouse /></ProtectedRoute>} />
              <Route path="/inventory/*" element={<ProtectedRoute roles={['Admin', 'Inventory', 'Inventory Manager', 'Warehouse', 'Warehouse Operator', 'Planner']}><Inventory /></ProtectedRoute>} />
              <Route path="/planning/*" element={<ProtectedRoute roles={['Admin', 'Inventory', 'Inventory Manager', 'Production', 'Production Manager', 'Planner']}><Planning /></ProtectedRoute>} />
              <Route path="/bom/*" element={<BOMRoutes />} />
              <Route path="/production/*" element={<ProtectedRoute roles={['Admin', 'Production', 'Production Manager']}><Manufacturing /></ProtectedRoute>} />
              <Route path="/scheduling/*" element={<ProtectedRoute roles={['Admin', 'Production', 'Production Manager', 'Planner']}><Scheduling /></ProtectedRoute>} />
              <Route path="/purchasing/*" element={<ProtectedRoute roles={['Admin', 'ProcurementManager', 'Purchaser', 'Vendor']}><Purchasing /></ProtectedRoute>} />
              <Route path="/workflows/*" element={<ProtectedRoute roles={['Admin']}><Workflows /></ProtectedRoute>} />
              <Route path="/email/*" element={<ProtectedRoute roles={['Admin']}><EmailTemplates /></ProtectedRoute>} />
              <Route path="/plugins/*" element={<ProtectedRoute roles={['Admin']}><Plugins /></ProtectedRoute>} />
              <Route path="/quality/*" element={<ProtectedRoute roles={['Admin', 'Production', 'Production Manager', 'QC Inspector']}><Quality /></ProtectedRoute>} />
              <Route path="/reports/*" element={<ProtectedRoute roles={['Admin', 'Production', 'Production Manager', 'QC Inspector', 'Finance']}><Reports /></ProtectedRoute>} />
              <Route path="/settings/*" element={<ProtectedRoute roles={['Admin']}><AuditAndActivity /></ProtectedRoute>} />
              <Route path="*" element={<Navigate to="/dashboard" />} />
            </Routes>
          </div>
        </main>
      </div>

      {/* Floating AI Chat Button */}
      {user && (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed bottom-6 right-6 p-4 bg-blue-600 text-white rounded-full shadow-2xl hover:bg-blue-700 hover:shadow-blue-500/50 hover:-translate-y-1 transition-all z-50 flex items-center justify-center group"
          title="Open AI Assistant"
        >
          <Sparkles className="w-6 h-6 group-hover:scale-110 transition-transform" />
        </button>
      )}

      {/* AI Chat Panel */}
      <ChatPanel isOpen={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
};

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
