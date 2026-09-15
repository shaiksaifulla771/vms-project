import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, Layers, Package, ShoppingCart, HelpCircle, ArrowLeft } from 'lucide-react';
import usePageMeta from '../hooks/usePageMeta';

export default function NotFound() {
  usePageMeta('404 Page Not Found', 'The requested page or module could not be found in the VendorOS portal.');
  const navigate = useNavigate();

  const quickLinks = [
    { label: 'Executive Dashboard', path: '/dashboard', icon: Home, desc: 'View live KPIs and operational overview' },
    { label: 'MRP & Production', path: '/mrp', icon: Layers, desc: 'Net requirements, lot sizing & BOM explosion' },
    { label: 'Inventory & Materials', path: '/inventory', icon: Package, desc: 'Stock balances, transfers & adjustments' },
    { label: 'Procurement & Orders', path: '/purchasing', icon: ShoppingCart, desc: 'Purchase orders & vendor requisitions' },
  ];

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center text-center px-4 sm:px-6 lg:px-8 py-12">
      {/* Visual Indicator */}
      <div className="relative mb-8">
        <div className="text-8xl sm:text-9xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-500 via-indigo-400 to-cyan-400 select-none tracking-widest opacity-90">
          404
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="px-4 py-1.5 text-xs font-bold tracking-wider uppercase text-blue-300 bg-slate-900/80 border border-blue-500/30 rounded-full backdrop-blur-md shadow-lg shadow-blue-500/10">
            Route Not Found
          </span>
        </div>
      </div>

      {/* Primary Message */}
      <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mb-3">
        Page Not Found or Moved
      </h1>
      <p className="text-sm sm:text-base text-slate-400 max-w-lg mb-8 leading-relaxed">
        The resource you are attempting to access does not exist, may have been relocated, or requires higher access credentials.
      </p>

      {/* Primary Action Buttons */}
      <div className="flex flex-wrap items-center justify-center gap-3 mb-12">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-semibold text-slate-300 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 rounded-xl transition-all shadow-md hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          Go Back
        </button>
        <button
          onClick={() => navigate('/dashboard')}
          className="inline-flex items-center gap-2 px-6 py-2.5 text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-xl transition-all shadow-lg shadow-blue-600/25 hover:shadow-blue-500/40"
        >
          <Home className="w-4 h-4" />
          Return to Dashboard
        </button>
      </div>

      {/* Quick Navigation Cards */}
      <div className="w-full max-w-2xl text-left">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 px-1 flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-blue-400" />
          Quick Navigation Paths
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {quickLinks.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="flex items-start gap-3.5 p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-blue-500/40 hover:bg-slate-850/80 transition-all text-left group"
              >
                <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20 group-hover:text-blue-300 transition-colors">
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-200 group-hover:text-white transition-colors">
                    {item.label}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {item.desc}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
