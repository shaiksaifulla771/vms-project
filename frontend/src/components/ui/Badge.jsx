import React from 'react';

export const Badge = ({ children, variant = 'default', className = '', ...props }) => {
  const baseStyles = 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold tracking-wide border border-transparent';
  
  const variants = {
    default: 'bg-slate-50/80 backdrop-blur text-slate-700 ring-1 ring-inset ring-slate-500/20',
    success: 'bg-emerald-50/80 backdrop-blur text-emerald-700 ring-1 ring-inset ring-emerald-600/20', // Active / Approved
    warning: 'bg-amber-50/80 backdrop-blur text-amber-700 ring-1 ring-inset ring-amber-600/20', // Pending / Expiring
    danger: 'bg-rose-50/80 backdrop-blur text-rose-700 ring-1 ring-inset ring-rose-600/20', // Inactive / Expired / Rejected
    info: 'bg-blue-50/80 backdrop-blur text-blue-700 ring-1 ring-inset ring-blue-600/20'
  };

  const getVariant = () => {
    const text = (typeof children === 'string' ? children : '').toLowerCase();
    
    if (variant !== 'default') return variant;

    if (['active', 'approved'].includes(text)) return 'success';
    if (['pending'].includes(text)) return 'warning';
    if (['inactive', 'rejected', 'expired'].includes(text)) return 'danger';

    return 'default';
  };

  return (
    <span className={`${baseStyles} ${variants[getVariant()]} ${className}`} {...props}>
      {children}
    </span>
  );
};
