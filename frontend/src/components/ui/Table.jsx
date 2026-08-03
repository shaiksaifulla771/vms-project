import React from 'react';

export const Table = ({ children, className = '', wrapperClassName = 'overflow-x-auto', ...props }) => {
  return (
    <div className={`w-full ${wrapperClassName}`}>
      <table className={`w-full text-left border-collapse ${className}`} {...props}>
        {children}
      </table>
    </div>
  );
};

export const TableHeader = ({ children, className = '', ...props }) => {
  return (
    <thead className={`bg-slate-50/75 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wider ${className}`} {...props}>
      {children}
    </thead>
  );
};

export const TableBody = ({ children, className = '', ...props }) => {
  return (
    <tbody className={`divide-y divide-slate-100/60 bg-white text-sm text-slate-700 ${className}`} {...props}>
      {children}
    </tbody>
  );
};

import { motion } from 'framer-motion';

export const TableRow = ({ children, className = '', ...props }) => {
  return (
    <motion.tr 
      whileHover={{ scale: 1.002, backgroundColor: 'rgba(248, 250, 252, 0.8)', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.02), 0 2px 4px -2px rgb(0 0 0 / 0.02)' }}
      transition={{ duration: 0.15 }}
      className={`hover:bg-slate-50/60 transition-colors ${className}`} 
      {...props}
    >
      {children}
    </motion.tr>
  );
};

export const TableHead = ({ children, className = '', ...props }) => {
  return (
    <th className={`px-5 py-3.5 font-semibold ${className}`} {...props}>
      {children}
    </th>
  );
};

export const TableCell = ({ children, className = '', ...props }) => {
  return (
    <td className={`px-5 py-3.5 align-middle ${className}`} {...props}>
      {children}
    </td>
  );
};
