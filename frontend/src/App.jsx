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
const MaterialsTab = lazy(() => import('./pages/masters/MaterialsTab'));
const VendorsTab = lazy(() => import('./pages/masters/VendorsTab'));
const MPNMaster = lazy(() => import('./pages/masters/MPNMaster'));
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
const ClassificationsPage = lazy(() => import('./pages/ClassificationsPage'));
const BOMRoutes = lazy(() => import('./pages/bom/BOMRoutes'));
const ProductionRoutes = lazy(() => import('./pages/production/ProductionRoutes'));
const NotFound = lazy(() => import('./pages/NotFound'));
const PrivacyPolicy = lazy(() => import('./pages/legal/PrivacyPolicy'));
const TermsOfService = lazy(() => import('./pages/legal/TermsOfService'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));

// Eagerly loaded lightweight components
import CookieBanner from './components/CookieBanner';
import SupportModal from './components/SupportModal';
import EnterpriseAICopilot from './components/EnterpriseAICopilot';

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

  // Derive activePage from the URL segments (default landing: materials)
  let rawSegment = location.pathname.split('/')[1];
  let subSegment = location.pathname.split('/')[2];
  let activePage = rawSegment || 'materials';
  if (activePage === 'masters' || activePage === 'master') activePage = 'materials';
  
  let sidebarActivePage = activePage;
  if (activePage === 'bom' && subSegment === 'new') {
    sidebarActivePage = 'bom-new';
  } else if (activePage === 'bom' || activePage === 'boms') {
    sidebarActivePage = 'bom';
  }

  const setActivePage = (page) => {
    if (page === 'boms' || page === 'bom') navigate('/bom');
    else if (page === 'bom-new') navigate('/bom/new');
    else if (page === 'materials') navigate('/materials');
    else if (page === 'vendors') navigate('/vendors');
    else if (page === 'mpns' || page === 'mpn') navigate('/mpns');
    else if (page === 'planning' || page === 'mrp') navigate('/planning');
    else if (page === 'sites') navigate('/sites');
    else if (page === 'classifications') navigate('/classifications');
    else if (page === 'material-classifications') navigate('/material-classifications');
    else if (page === 'vendor-classifications') navigate('/vendor-classifications');
    else if (page === 'users') navigate('/users');
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
      <main className="flex-1 pt-12 px-1.5 sm:px-2.5 pb-2 w-full max-w-full mx-auto min-w-0">
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Master Module - 100% Isolated */}
            <Route path="/" element={<Navigate to="/materials" replace />} />
            <Route path="/login" element={<Navigate to="/materials" replace />} />
            <Route path="/dashboard" element={<Navigate to="/materials" replace />} />
            <Route path="/materials/*" element={<ProtectedRoute roles={['Admin', 'Editor', 'Viewer', 'Inventory', 'Inventory Manager', 'Production', 'Production Manager', 'Warehouse', 'Warehouse Operator', 'ProcurementManager', 'Purchaser', 'Vendor', 'Planner', 'QC Inspector', 'Finance']}><MaterialsTab /></ProtectedRoute>} />
            <Route path="/vendors/*" element={<ProtectedRoute roles={['Admin', 'Editor', 'Viewer', 'Inventory', 'Inventory Manager', 'Production', 'Production Manager', 'Warehouse', 'Warehouse Operator', 'ProcurementManager', 'Purchaser', 'Vendor', 'Planner', 'QC Inspector', 'Finance']}><VendorsTab /></ProtectedRoute>} />
            <Route path="/masters/*" element={<Navigate to="/materials" replace />} />

            {/* Stocks & Inventory */}
            <Route path="/mpns/*" element={<ProtectedRoute roles={['Admin', 'Editor', 'Viewer', 'Inventory', 'Inventory Manager', 'Production', 'Production Manager', 'Warehouse', 'Warehouse Operator', 'ProcurementManager', 'Purchaser', 'Vendor', 'Planner', 'QC Inspector', 'Finance']}><MPNMaster /></ProtectedRoute>} />
            <Route path="/mpn/*" element={<ProtectedRoute roles={['Admin', 'Editor', 'Viewer', 'Inventory', 'Inventory Manager', 'Production', 'Production Manager', 'Warehouse', 'Warehouse Operator', 'ProcurementManager', 'Purchaser', 'Vendor', 'Planner', 'QC Inspector', 'Finance']}><MPNMaster /></ProtectedRoute>} />
            <Route path="/inventory/*" element={<ProtectedRoute roles={['Admin', 'Editor', 'Viewer', 'Inventory', 'Inventory Manager', 'Warehouse', 'Warehouse Operator', 'Planner']}><Inventory /></ProtectedRoute>} />

            {/* Engineering & Infrastructure */}
            <Route path="/bom/*" element={<BOMRoutes />} />
            <Route path="/boms/*" element={<BOMRoutes />} />
            <Route path="/planning/*" element={<ProtectedRoute roles={['Admin', 'Editor', 'Viewer', 'Inventory', 'Inventory Manager', 'Production', 'Production Manager', 'Planner']}><MRP /></ProtectedRoute>} />
            <Route path="/mrp/*" element={<ProtectedRoute roles={['Admin', 'Editor', 'Viewer', 'Inventory', 'Inventory Manager', 'Production', 'Production Manager', 'Planner']}><MRP /></ProtectedRoute>} />
            <Route path="/sites/*" element={<ProtectedRoute roles={['Admin', 'Editor']}><NetworkAndSites /></ProtectedRoute>} />
            <Route path="/network-sites/*" element={<ProtectedRoute roles={['Admin', 'Editor']}><NetworkAndSites /></ProtectedRoute>} />
            <Route path="/warehouse/*" element={<ProtectedRoute roles={['Admin', 'Editor']}><NetworkAndSites /></ProtectedRoute>} />

            {/* Settings: Classifications & Users */}
            <Route path="/classifications/*" element={<ProtectedRoute roles={['Admin', 'Editor', 'Viewer']}><ClassificationsPage /></ProtectedRoute>} />
            <Route path="/material-classifications/*" element={<ProtectedRoute roles={['Admin', 'Editor', 'Viewer']}><ClassificationsPage initialType="material" /></ProtectedRoute>} />
            <Route path="/vendor-classifications/*" element={<ProtectedRoute roles={['Admin', 'Editor', 'Viewer']}><ClassificationsPage initialType="vendor" /></ProtectedRoute>} />
            <Route path="/users/*" element={<ProtectedRoute roles={['Admin']}><UsersAndAccessScope /></ProtectedRoute>} />
            <Route path="/users-access/*" element={<ProtectedRoute roles={['Admin']}><UsersAndAccessScope /></ProtectedRoute>} />
            <Route path="/admin/users-access/*" element={<ProtectedRoute roles={['Admin']}><UsersAndAccessScope /></ProtectedRoute>} />
            <Route path="/admin/network-sites/*" element={<ProtectedRoute roles={['Admin']}><NetworkAndSites /></ProtectedRoute>} />
            <Route path="/admin/*" element={<ProtectedRoute roles={['Admin']}><UsersAndAccessScope /></ProtectedRoute>} />
            <Route path="/settings/*" element={<ProtectedRoute roles={['Admin', 'Editor', 'Viewer']}><ClassificationsPage /></ProtectedRoute>} />
            
            {/* Trust, Legal & Custom 404 Recovery Routes */}
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/terms-of-service" element={<TermsOfService />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>

        {/* Global Enterprise Trust & Compliance Footer */}
        <footer className="mt-2 pt-2 border-t border-slate-200 text-[10px] text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-2 shrink-0">
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

      {/* Global Enterprise AI Copilot (NVIDIA Nemotron 3 Ultra 550B) */}
      <EnterpriseAICopilot />
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
