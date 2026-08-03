import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertCircle, X, Loader2 } from 'lucide-react';
import { createPortal } from 'react-dom';

const Toast = ({ type, message, onClose }) => {
  return createPortal(
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
      className="fixed bottom-6 right-6 z-[100] min-w-[300px]"
    >
      <div className={`p-4 rounded-xl shadow-2xl backdrop-blur-md border ${
        type === 'success' 
          ? 'bg-emerald-500/90 border-emerald-400 text-white shadow-emerald-500/20' 
          : 'bg-rose-500/90 border-rose-400 text-white shadow-rose-500/20'
      } flex items-center justify-between`}>
        <div className="flex items-center space-x-3">
          {type === 'success' ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
          <span className="font-medium text-sm">{message}</span>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>
    </motion.div>,
    document.body
  );
};

export const Button = ({
  children,
  className = '',
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled = false,
  type = 'button',
  onClick,
  ...props
}) => {
  const [internalLoading, setInternalLoading] = useState(false);
  const [confirmStep, setConfirmStep] = useState(false);
  const [toast, setToast] = useState(null);

  const isDestructive = variant === 'destructive' || variant === 'danger';
  const loadingState = isLoading || internalLoading;

  const handleClick = async (e) => {
    if (isDestructive && !confirmStep) {
      e.preventDefault();
      setConfirmStep(true);
      setTimeout(() => setConfirmStep(false), 3000); // reset after 3s
      return;
    }

    if (onClick) {
      try {
        const result = onClick(e);
        if (result instanceof Promise) {
          setInternalLoading(true);
          await result;
          if (type !== 'submit') { // Don't show generic success for submits typically, unless requested
             setToast({ type: 'success', message: 'Action completed successfully' });
             setTimeout(() => setToast(null), 2500);
          }
        }
      } catch (error) {
        setToast({ type: 'error', message: error?.message || 'An error occurred' });
        setTimeout(() => setToast(null), 4000);
      } finally {
        setInternalLoading(false);
        if (isDestructive) setConfirmStep(false);
      }
    }
  };

  const baseStyles = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none relative overflow-hidden';
  
  const variants = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20 focus:ring-blue-500 border border-transparent',
    secondary: 'bg-white/80 backdrop-blur hover:bg-white text-slate-800 focus:ring-slate-400 border border-slate-200/50 shadow-sm',
    outline: 'bg-white/50 backdrop-blur hover:bg-white text-slate-700 border border-slate-200 focus:ring-slate-300',
    destructive: 'bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-600/20 focus:ring-rose-500 border border-transparent',
    danger: 'bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-600/20 focus:ring-rose-500 border border-transparent',
    ghost: 'hover:bg-slate-100/50 text-slate-600 focus:ring-slate-200',
    success: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20 focus:ring-emerald-500 border border-transparent'
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-2.5 text-base'
  };

  return (
    <>
      <motion.button
        type={type}
        disabled={disabled || loadingState}
        onClick={handleClick}
        whileHover={{ y: disabled || loadingState ? 0 : -1 }}
        whileTap={{ scale: disabled || loadingState ? 1 : 0.96 }}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className} ${confirmStep ? 'ring-2 ring-rose-500 ring-offset-2 animate-pulse' : ''}`}
        {...props}
      >
        {loadingState && (
          <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4 text-current opacity-75" />
        )}
        {confirmStep ? 'Click to Confirm' : children}
      </motion.button>
      <AnimatePresence>
        {toast && (
          <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />
        )}
      </AnimatePresence>
    </>
  );
};
