import React from 'react';
import { motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';

export default function BomPageWrapper({ children, className = '' }) {
  const location = useLocation();
  const direction = location.state?.direction || 1; // 1 for forward, -1 for backward

  const variants = {
    initial: { opacity: 0, x: 20 * direction },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 * direction },
  };

  const isFullscreenMode = location.pathname === '/bom/new' || location.pathname.match(/^\/bom\/[a-f0-9]+\/edit$/i);
  const containerClass = isFullscreenMode ? 'p-8 max-w-7xl mx-auto min-h-screen' : '';

  return (
    <motion.div
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className={`w-full ${containerClass} ${className}`}
    >
      {children}
    </motion.div>
  );
}
