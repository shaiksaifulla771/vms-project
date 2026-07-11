import React from 'react';

export const Input = ({
  label,
  error,
  id,
  type = 'text',
  className = '',
  ...props
}) => {
  return (
    <div className="w-full flex flex-col space-y-1.5">
      {label && (
        <label htmlFor={id} className="text-xs font-semibold text-slate-600">
          {label}
        </label>
      )}
      <input
        type={type}
        id={id}
        className={`w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all ${
          error ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''
        } ${className}`}
        {...props}
      />
      {error && <span className="text-xs text-red-500 font-medium">{error}</span>}
    </div>
  );
};

export const TextArea = ({
  label,
  error,
  id,
  className = '',
  rows = 3,
  ...props
}) => {
  return (
    <div className="w-full flex flex-col space-y-1.5">
      {label && (
        <label htmlFor={id} className="text-xs font-semibold text-slate-600">
          {label}
        </label>
      )}
      <textarea
        id={id}
        rows={rows}
        className={`w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all ${
          error ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''
        } ${className}`}
        {...props}
      />
      {error && <span className="text-xs text-red-500 font-medium">{error}</span>}
    </div>
  );
};

export const Select = ({
  label,
  error,
  id,
  options = [],
  className = '',
  placeholder = 'Select an option',
  ...props
}) => {
  return (
    <div className="w-full flex flex-col space-y-1.5">
      {label && (
        <label htmlFor={id} className="text-xs font-semibold text-slate-600">
          {label}
        </label>
      )}
      <select
        id={id}
        className={`w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all cursor-pointer ${
          error ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''
        } ${className}`}
        {...props}
      >
        {placeholder && <option value="" disabled>{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-red-500 font-medium">{error}</span>}
    </div>
  );
};
