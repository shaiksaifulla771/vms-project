import React, { useState, useEffect } from 'react';
import { Cookie, Shield, X } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('vms_cookie_consent');
    if (!consent) {
      // Small delay so entrance animation feels organic
      const timer = setTimeout(() => setVisible(true), 1200);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleConsent = (level) => {
    localStorage.setItem('vms_cookie_consent', JSON.stringify({
      level,
      timestamp: new Date().toISOString()
    }));
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <aside
      aria-label="Cookie and Privacy Consent"
      className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-50 animate-in fade-in slide-in-from-bottom-5 duration-300"
    >
      <div className="bg-slate-900/95 border border-slate-700/80 rounded-2xl p-5 shadow-2xl backdrop-blur-xl ring-1 ring-white/10 text-slate-200">
        <div className="flex items-start gap-3.5">
          <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 shrink-0 mt-0.5">
            <Cookie className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                Enterprise Cookie Notice
              </h3>
              <button
                onClick={() => handleConsent('essential')}
                className="text-slate-400 hover:text-white transition-colors p-1"
                aria-label="Close cookie banner"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              We use essential security and session cookies to ensure high-performance ERP operations and role-based access control. Review our{' '}
              <Link to="/privacy-policy" className="text-blue-400 underline hover:text-blue-300">
                Privacy Policy
              </Link>.
            </p>
            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={() => handleConsent('essential')}
                className="px-3 py-1.5 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700"
              >
                Essential Only
              </button>
              <button
                onClick={() => handleConsent('all')}
                className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors shadow-md shadow-blue-600/30"
              >
                Accept All
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
