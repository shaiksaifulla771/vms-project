import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Masters from './pages/Masters';
import BOM from './pages/BOM';
import Planning from './pages/Planning';
import Inventory from './pages/Inventory';
import Purchasing from './pages/Purchasing';
import Manufacturing from './pages/Manufacturing';
import Quality from './pages/Quality';
import Reports from './pages/Reports';
import Settings from './pages/Settings';

const AppContent = () => {
  const { user, loading } = useAuth();
  const [activePage, setActivePage] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

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

  const pageRoles = {
    dashboard: ['Admin', 'Inventory Manager', 'Production Manager'],
    masters: ['Admin', 'Inventory Manager'],
    boms: ['Admin', 'Production Manager'],
    planning: ['Admin', 'Inventory Manager', 'Production Manager'],
    inventory: ['Admin', 'Inventory Manager'],
    purchasing: ['Admin', 'Inventory Manager'],
    manufacturing: ['Admin', 'Production Manager'],
    quality: ['Admin', 'Production Manager'],
    reports: ['Admin', 'Inventory Manager', 'Production Manager'],
    settings: ['Admin', 'Inventory Manager', 'Production Manager']
  };

  const renderPage = () => {
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
            Your operational role <strong>{user.role}</strong> does not have clearance permissions to access the <strong>{activePage.toUpperCase()}</strong> module. Contact the system administrator for clearance upgrades.
          </p>
        </div>
      );
    }

    switch (activePage) {
      case 'dashboard':
        return <Dashboard />;
      case 'masters':
        return <Masters />;
      case 'boms':
        return <BOM />;
      case 'planning':
        return <Planning />;
      case 'inventory':
        return <Inventory />;
      case 'purchasing':
        return <Purchasing />;
      case 'manufacturing':
        return <Manufacturing />;
      case 'quality':
        return <Quality />;
      case 'reports':
        return <Reports />;
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 flex">
      {/* Sidebar navigation */}
      <Sidebar 
        activePage={activePage} 
        setActivePage={setActivePage} 
        isCollapsed={sidebarCollapsed} 
        setIsCollapsed={setSidebarCollapsed} 
      />

      {/* Main page context */}
      <div className={`flex-1 ${sidebarCollapsed ? 'pl-0' : 'pl-64'} flex flex-col min-h-screen transition-all duration-300`}>
        {/* Top Header navbar */}
        <Header 
          activePage={activePage} 
          sidebarCollapsed={sidebarCollapsed} 
          setSidebarCollapsed={setSidebarCollapsed} 
        />

        {/* Central content area */}
        <main className="flex-1 pt-16 p-8 overflow-y-auto">
          <div className="w-full">
            {renderPage()}
          </div>
        </main>
      </div>
    </div>
  );
};

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
