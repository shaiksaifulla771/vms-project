import React, { useState, useEffect } from 'react';
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

// New Routed BOM Module
import BOMRoutes from './pages/bom/BOMRoutes';
import ProductionRoutes from './pages/production/ProductionRoutes';

// AI Chat Integration
import ChatPanel from './features/chat/ChatPanel';
import { Sparkles } from 'lucide-react';

const AppContent = () => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        <p className="text-sm font-semibold text-slate-400">Verifying session credentials...</p>
      </div>
    );
  }

  // Redirect to login if session is empty
  if (!user) {
    return <Login />;
  }

  // Derive activePage from the first URL segment
  let activePage = location.pathname.split('/')[1] || 'masters';

  // The sidebar currently uses 'boms' as the ID for BOMs, but our new route is '/bom'.
  // Map 'bom' to 'boms' for the sidebar active state, but keep URL as '/bom'.
  const sidebarActivePage = activePage === 'bom' ? 'boms' : activePage;

  // Custom setActivePage for the sidebar that updates the URL
  const setActivePage = (page) => {
    // Map 'boms' back to '/bom' for the URL
    if (page === 'boms') navigate('/bom');
    else navigate(`/${page}`);
  };

  const pageRoles = {
    masters: ['Admin', 'Inventory Manager'],
    bom: ['Admin', 'Production Manager'],
    boms: ['Admin', 'Production Manager'],
    planning: ['Admin', 'Inventory Manager', 'Production Manager'],
    inventory: ['Admin', 'Inventory Manager'],
    purchasing: ['Admin', 'Inventory Manager'],
    production: ['Admin', 'Production Manager'],
    quality: ['Admin', 'Production Manager'],
    reports: ['Admin', 'Inventory Manager', 'Production Manager'],
    settings: ['Admin', 'Inventory Manager', 'Production Manager']
  };

  const renderRoutes = () => {
    const allowedRoles = pageRoles[activePage] || ['Admin'];
    if (user && !allowedRoles.includes(user.role)) {
      return (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-8 text-center max-w-lg mx-auto mt-20 space-y-4 shadow-sm">
          <div className="text-red-500 flex justify-center">
            <svg className="h-14 w-14 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-base font-extrabold text-slate-800 tracking-tight">Clearance Access Blocked</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            Your operational role <strong>{user.role}</strong> does not have clearance permissions to access this module.
          </p>
        </div>
      );
    }

    return (
      <Routes>
        <Route path="/" element={<Navigate to="/masters" />} />
        <Route path="/dashboard/*" element={<Dashboard />} />
        <Route path="/masters/*" element={<Masters />} />
        <Route path="/warehouse/*" element={<Warehouse />} />
        <Route path="/inventory/*" element={<Inventory />} />
        <Route path="/planning/*" element={<Planning />} />
        <Route path="/bom/*" element={<BOMRoutes />} />
        <Route path="/production/*" element={<ProductionRoutes />} />
        <Route path="/scheduling/*" element={<Scheduling />} />
        <Route path="/purchasing/*" element={<Purchasing />} />
        <Route path="/reports/*" element={<Reports />} />
        <Route path="/settings/*" element={<Settings />} />
        <Route path="*" element={<Navigate to="/masters" />} />
      </Routes>
    );
  };

  // Determine if current route should be full-screen (hide sidebar/header)
  const isFullscreenMode = location.pathname === '/bom/new' || location.pathname.match(/^\/bom\/[a-f0-9]+\/edit$/i);

  return (
    <div className="min-h-screen bg-slate-50/50 flex">
      {/* Sidebar navigation */}
      {!isFullscreenMode && (
        <Sidebar
          activePage={sidebarActivePage}
          setActivePage={setActivePage}
          isCollapsed={sidebarCollapsed}
          setIsCollapsed={setSidebarCollapsed}
        />
      )}

      {/* Main page context */}
      <div className={`flex-1 ${!isFullscreenMode && !sidebarCollapsed ? 'pl-64' : 'pl-0'} flex flex-col min-h-screen transition-all duration-300`}>
        {/* Top Header navbar */}
        {!isFullscreenMode && (
          <Header
            activePage={sidebarActivePage}
            sidebarCollapsed={sidebarCollapsed}
            setSidebarCollapsed={setSidebarCollapsed}
          />
        )}

        {/* Central content area */}
        <main className={`flex-1 ${isFullscreenMode ? 'p-0' : 'pt-16 p-8'} overflow-y-auto`}>
          <div className="w-full h-full">
            {renderRoutes()}
          </div>
        </main>
      </div>
      {/* Floating AI Chat Button */}
      {user && !isFullscreenMode && (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed bottom-6 right-6 p-4 bg-indigo-600 text-white rounded-full shadow-2xl hover:bg-indigo-700 hover:shadow-indigo-500/50 hover:-translate-y-1 transition-all z-50 flex items-center justify-center group"
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
