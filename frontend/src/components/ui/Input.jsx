import React from 'react';

const getSizeClass = (size) => {
  switch (size) {
    case 'xs':
      return 'h-6 text-[11px] px-1.5 py-0 rounded';
    case 'sm':
      return 'h-7 text-xs px-2 py-0.5 rounded-md';
    default:
      return 'px-3 py-2 text-sm rounded-lg';
  }
};

export const Input = ({
  label,
  error,
  id,
  type = 'text',
  size,
  className = '',
  ...props
}) => {
  const paddingClass = getSizeClass(size);
  const inputEl = (
    <input
      type={type}
      id={id}
      className={`w-full bg-white/50 backdrop-blur-sm border border-slate-200 shadow-inner text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 transition-all ${paddingClass} ${
        error ? 'border-red-500 focus:border-red-500 focus:ring-red-500/50' : ''
      } ${className}`}
      {...props}
    />
  );

  if (!label && !error) return inputEl;

  return (
    <div className="w-full flex flex-col space-y-1.5">
      {label && (
        <label htmlFor={id} className="text-xs font-semibold text-slate-600">
          {label}
        </label>
      )}
      {inputEl}
      {error && <span className="text-xs text-red-500 font-medium">{error}</span>}
    </div>
  );
};

export const TextArea = ({
  label,
  error,
  id,
  size,
  className = '',
  rows = 3,
  ...props
}) => {
  const paddingClass = size === 'xs' ? 'text-[11px] p-1.5 rounded' : size === 'sm' ? 'text-xs p-2 rounded-md' : 'px-3 py-2 text-sm rounded-lg';
  const areaEl = (
    <textarea
      id={id}
      rows={rows}
      className={`w-full bg-white/50 backdrop-blur-sm border border-slate-200 shadow-inner text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 transition-all ${paddingClass} ${
        error ? 'border-red-500 focus:border-red-500 focus:ring-red-500/50' : ''
      } ${className}`}
      {...props}
    />
  );

  if (!label && !error) return areaEl;

  return (
    <div className="w-full flex flex-col space-y-1.5">
      {label && (
        <label htmlFor={id} className="text-xs font-semibold text-slate-600">
          {label}
        </label>
      )}
      {areaEl}
      {error && <span className="text-xs text-red-500 font-medium">{error}</span>}
    </div>
  );
};

export const Select = ({
  label,
  error,
  id,
  size,
  options = [],
  className = '',
  placeholder,
  children,
  ...props
}) => {
  const paddingClass = getSizeClass(size);
  const selectEl = (
    <select
      id={id}
      className={`w-full bg-white/50 backdrop-blur-sm border border-slate-200 shadow-inner text-slate-800 focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 transition-all cursor-pointer ${paddingClass} ${
        error ? 'border-red-500 focus:border-red-500 focus:ring-red-500/50' : ''
      } ${className}`}
      {...props}
    >
      {children ? (
        children
      ) : (
        <>
          {placeholder && <option value="" disabled>{placeholder}</option>}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </>
      )}
    </select>
  );

  if (!label && !error) return selectEl;

  return (
    <div className="w-full flex flex-col space-y-1.5">
      {label && (
        <label htmlFor={id} className="text-xs font-semibold text-slate-600">
          {label}
        </label>
      )}
      {selectEl}
      {error && <span className="text-xs text-red-500 font-medium">{error}</span>}
    </div>
  );
};
