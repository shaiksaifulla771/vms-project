import React from 'react';
import { motion } from 'framer-motion';

export default function MasterPageWrapper({ children, className = '', direction = 1 }) {
  const variants = {
    initial: { opacity: 0, x: 24 * direction },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -24 * direction },
  };

  return (
    <motion.div
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
      className={`w-full ${className}`}
    >
      {children}
    </motion.div>
  );
}
