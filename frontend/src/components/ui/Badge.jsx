import React from 'react';

export const Badge = ({ children, variant = 'default', className = '', ...props }) => {
  const baseStyles = 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold tracking-wide border';
  
  const variants = {
    default: 'bg-slate-100 text-slate-800 border-slate-200',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-150', // Active / Approved
    warning: 'bg-amber-50 text-amber-700 border-amber-150', // Pending / Expiring
    danger: 'bg-rose-50 text-rose-700 border-rose-150', // Inactive / Expired / Rejected
    info: 'bg-blue-50 text-blue-700 border-blue-150'
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
