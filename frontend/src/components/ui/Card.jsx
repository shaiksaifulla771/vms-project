import React from 'react';
import { motion } from 'framer-motion';

export const Card = ({ children, className = '', ...props }) => {
  return (
    <motion.div 
      whileHover={{ y: -2, boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.05), 0 8px 10px -6px rgb(0 0 0 / 0.05)' }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className={`bg-white/80 backdrop-blur-xl border border-slate-200/60 rounded-xl shadow-lg shadow-slate-200/50 overflow-hidden ${className}`} 
      {...props}
    >
      {children}
    </motion.div>
  );
};

export const CardHeader = ({ children, className = '', ...props }) => {
  return (
    <div className={`p-5 border-b border-slate-50 flex flex-col space-y-1.5 ${className}`} {...props}>
      {children}
    </div>
  );
};

export const CardTitle = ({ children, className = '', ...props }) => {
  return (
    <h3 className={`text-base font-semibold text-slate-800 tracking-tight ${className}`} {...props}>
      {children}
    </h3>
  );
};

export const CardDescription = ({ children, className = '', ...props }) => {
  return (
    <p className={`text-xs text-slate-400 font-medium ${className}`} {...props}>
      {children}
    </p>
  );
};

export const CardContent = ({ children, className = '', ...props }) => {
  return (
    <div className={`p-5 ${className}`} {...props}>
      {children}
    </div>
  );
};

export const CardFooter = ({ children, className = '', ...props }) => {
  return (
    <div className={`p-5 border-t border-slate-50 flex items-center justify-end space-x-2 ${className}`} {...props}>
      {children}
    </div>
  );
};
