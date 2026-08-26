import React, { useState, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SiteProvider } from './context/SiteContext';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import ErrorBoundary from './components/ErrorBoundary';

// Route-level code splitting — each module loads only when navigated to
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Masters = lazy(() => import('./pages/Masters'));
const Vendors = lazy(() => import('./pages/Vendors'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Purchasing = lazy(() => import('./pages/Purchasing'));
const Manufacturing = lazy(() => import('./pages/Manufacturing'));
const Quality = lazy(() => import('./pages/Quality'));
const Reports = lazy(() => import('./pages/Reports'));
const Settings = lazy(() => import('./pages/Settings'));
const Warehouse = lazy(() => import('./pages/Warehouse'));
const Scheduling = lazy(() => import('./pages/Scheduling'));
const Sites = lazy(() => import('./pages/Sites'));
const MRP = lazy(() => import('./pages/MRP'));
const VMSWorkbench = lazy(() => import('./pages/VMSWorkbench'));
const EmailTemplates = lazy(() => import('./pages/EmailTemplates'));
const Workflows = lazy(() => import('./pages/Workflows'));
const Plugins = lazy(() => import('./pages/Plugins'));
const AdminControlCenter = lazy(() => import('./pages/admin/AdminControlCenter'));
const NetworkAndSites = lazy(() => import('./pages/admin/NetworkAndSites'));
const AuditAndActivity = lazy(() => import('./pages/admin/AuditAndActivity'));
const UsersAndAccessScope = lazy(() => import('./pages/admin/UsersAndAccessScope'));
const BOMRoutes = lazy(() => import('./pages/bom/BOMRoutes'));
const ProductionRoutes = lazy(() => import('./pages/production/ProductionRoutes'));
const NotFound = lazy(() => import('./pages/NotFound'));
const PrivacyPolicy = lazy(() => import('./pages/legal/PrivacyPolicy'));
const TermsOfService = lazy(() => import('./pages/legal/TermsOfService'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));

// Eagerly loaded lightweight components
import CookieBanner from './components/CookieBanner';
import SupportModal from './components/SupportModal';

// Loading fallback
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[300px]">
    <div className="animate-spin rounded-full h-7 w-7 border-t-2 border-b-2 border-blue-500"></div>
  </div>
);

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [supportOpen, setSupportOpen] = useState(false);

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
    return <Suspense fallback={<PageLoader />}><ResetPassword /></Suspense>;
  }

  // Auto-login fallback if user is null
  if (!user) {
    return <Suspense fallback={<PageLoader />}><Login /></Suspense>;
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
    <div className="min-h-screen w-full bg-slate-50 flex flex-col antialiased">
      {/* Sidebar navigation drawer */}
      <Sidebar
        activePage={sidebarActivePage}
        setActivePage={setActivePage}
        isCollapsed={sidebarCollapsed}
        setIsCollapsed={setSidebarCollapsed}
      />

      {/* Top Header navbar */}
      <Header
        activePage={sidebarActivePage}
        sidebarCollapsed={sidebarCollapsed}
        setSidebarCollapsed={setSidebarCollapsed}
      />

      {/* Central content area — full-screen, fit-to-screen data density */}
      <main className="flex-1 pt-14 px-2 sm:px-4 pb-6 w-full max-w-full mx-auto min-w-0">
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/login" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard/*" element={<Dashboard />} />
            <Route path="/admin/control-center/*" element={<ProtectedRoute roles={['Admin']}><AdminControlCenter /></ProtectedRoute>} />
            <Route path="/admin/control_center/*" element={<ProtectedRoute roles={['Admin']}><AdminControlCenter /></ProtectedRoute>} />
            <Route path="/admin/network-sites/*" element={<ProtectedRoute roles={['Admin']}><NetworkAndSites /></ProtectedRoute>} />
            <Route path="/admin/users-access/*" element={<ProtectedRoute roles={['Admin']}><UsersAndAccessScope /></ProtectedRoute>} />
            <Route path="/admin/audit-logs/*" element={<ProtectedRoute roles={['Admin']}><AuditAndActivity /></ProtectedRoute>} />
            <Route path="/admin/*" element={<ProtectedRoute roles={['Admin']}><AdminControlCenter /></ProtectedRoute>} />
            <Route path="/control-center/*" element={<ProtectedRoute roles={['Admin']}><AdminControlCenter /></ProtectedRoute>} />
            <Route path="/control_center/*" element={<ProtectedRoute roles={['Admin']}><AdminControlCenter /></ProtectedRoute>} />
            <Route path="/network-sites/*" element={<ProtectedRoute roles={['Admin']}><NetworkAndSites /></ProtectedRoute>} />
            <Route path="/sites/*" element={<ProtectedRoute roles={['Admin']}><NetworkAndSites /></ProtectedRoute>} />
            <Route path="/users-access/*" element={<ProtectedRoute roles={['Admin']}><UsersAndAccessScope /></ProtectedRoute>} />
            <Route path="/vms/*" element={<ProtectedRoute roles={['Admin', 'Warehouse', 'Warehouse Operator', 'ProcurementManager', 'Purchaser', 'Vendor']}><VMSWorkbench /></ProtectedRoute>} />
            <Route path="/masters/*" element={<Masters />} />
            <Route path="/mrp/*" element={<ProtectedRoute roles={['Admin', 'Inventory', 'Inventory Manager', 'Production', 'Production Manager', 'Planner']}><MRP /></ProtectedRoute>} />
            <Route path="/warehouse/*" element={<ProtectedRoute roles={['Admin', 'Inventory', 'Inventory Manager', 'Warehouse', 'Warehouse Operator']}><Warehouse /></ProtectedRoute>} />
            <Route path="/inventory/*" element={<ProtectedRoute roles={['Admin', 'Inventory', 'Inventory Manager', 'Warehouse', 'Warehouse Operator', 'Planner']}><Inventory /></ProtectedRoute>} />
            <Route path="/planning/*" element={<ProtectedRoute roles={['Admin', 'Inventory', 'Inventory Manager', 'Production', 'Production Manager', 'Planner']}><MRP /></ProtectedRoute>} />
            <Route path="/bom/*" element={<BOMRoutes />} />
            <Route path="/production/*" element={<ProtectedRoute roles={['Admin', 'Production', 'Production Manager']}><Manufacturing /></ProtectedRoute>} />
            <Route path="/scheduling/*" element={<ProtectedRoute roles={['Admin', 'Inventory', 'Production', 'Production Manager', 'Planner']}><Scheduling /></ProtectedRoute>} />
            <Route path="/purchasing/*" element={<ProtectedRoute roles={['Admin', 'ProcurementManager', 'Purchaser', 'Vendor']}><Purchasing /></ProtectedRoute>} />
            <Route path="/workflows/*" element={<ProtectedRoute roles={['Admin']}><Workflows /></ProtectedRoute>} />
            <Route path="/email/*" element={<ProtectedRoute roles={['Admin']}><EmailTemplates /></ProtectedRoute>} />
            <Route path="/plugins/*" element={<ProtectedRoute roles={['Admin']}><Plugins /></ProtectedRoute>} />
            <Route path="/quality/*" element={<ProtectedRoute roles={['Admin', 'Production', 'Production Manager', 'QC Inspector']}><Quality /></ProtectedRoute>} />
            <Route path="/reports/*" element={<ProtectedRoute roles={['Admin', 'Production', 'Production Manager', 'QC Inspector', 'Finance']}><Reports /></ProtectedRoute>} />
            <Route path="/settings/*" element={<ProtectedRoute roles={['Admin']}><AuditAndActivity /></ProtectedRoute>} />
            
            {/* Trust, Legal & Custom 404 Recovery Routes */}
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/terms-of-service" element={<TermsOfService />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>

        {/* Global Enterprise Trust & Compliance Footer */}
        <footer className="mt-10 pt-4 border-t border-slate-200 text-[10px] text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            &copy; {new Date().getFullYear()} VendorOS Enterprise ERP &bull; v2.4
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSupportOpen(true)}
              className="text-slate-400 hover:text-blue-500 transition-colors cursor-pointer"
            >
              Support
            </button>
            <span>&bull;</span>
            <a href="/privacy-policy" className="text-slate-400 hover:text-blue-500 transition-colors">Privacy</a>
            <span>&bull;</span>
            <a href="/terms-of-service" className="text-slate-400 hover:text-blue-500 transition-colors">Terms</a>
          </div>
        </footer>
      </main>

      {/* Cookie Consent Banner */}
      <CookieBanner />

      {/* Support & Health Modal */}
      <SupportModal isOpen={supportOpen} onClose={() => setSupportOpen(false)} />
    </div>
  );
};

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <SiteProvider>
            <AppContent />
          </SiteProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
