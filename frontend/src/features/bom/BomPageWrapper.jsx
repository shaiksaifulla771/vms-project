import React from 'react';
import { useLocation } from 'react-router-dom';

export default function BomPageWrapper({ children, className = '' }) {
  const location = useLocation();
  const isFullscreenMode = location.pathname === '/bom/new' || location.pathname.match(/^\/bom\/[a-f0-9]+\/edit$/i);
  const containerClass = isFullscreenMode ? 'w-full max-w-full' : '';

  return (
    <div className={`w-full ${containerClass} ${className}`}>
      {children}
    </div>
  );
}
