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

import Sites from './pages/Sites';
import MRP from './pages/MRP';
import VMSWorkbench from './pages/VMSWorkbench';
import EmailTemplates from './pages/EmailTemplates';
import Workflows from './pages/Workflows';
import Plugins from './pages/Plugins';

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

  // Auto-login fallback if user is null
  if (!user) {
    return <Login />;
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
              <Route path="/dashboard/*" element={<Dashboard />} />
              <Route path="/vms/*" element={<VMSWorkbench />} />
              <Route path="/sites/*" element={<Sites />} />
              <Route path="/masters/*" element={<Masters />} />
              <Route path="/mrp/*" element={<MRP />} />
              <Route path="/warehouse/*" element={<Warehouse />} />
              <Route path="/inventory/*" element={<Inventory />} />
              <Route path="/planning/*" element={<Planning />} />
              <Route path="/bom/*" element={<BOMRoutes />} />
              <Route path="/production/*" element={<Manufacturing />} />
              <Route path="/scheduling/*" element={<Scheduling />} />
              <Route path="/purchasing/*" element={<Purchasing />} />
              <Route path="/workflows/*" element={<Workflows />} />
              <Route path="/email/*" element={<EmailTemplates />} />
              <Route path="/plugins/*" element={<Plugins />} />
              <Route path="/quality/*" element={<Quality />} />
              <Route path="/reports/*" element={<Reports />} />
              <Route path="/settings/*" element={<Settings />} />
              <Route path="*" element={<Navigate to="/masters" />} />
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
