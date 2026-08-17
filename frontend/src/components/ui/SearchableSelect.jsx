import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown, Check } from 'lucide-react';
import { Input } from './Input';

export default function SearchableSelect({
  options = [],
  value,
  onChange,
  placeholder = 'Select...',
  disabled = false,
  className = '',
  loading = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = useRef(null);
  const dropdownRef = useRef(null);

  const [dropdownCoords, setDropdownCoords] = useState({ top: 0, left: 0, width: 0 });

  const selectedOption = options.find((opt) => opt.value === value);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        wrapperRef.current && 
        !wrapperRef.current.contains(event.target) &&
        (!dropdownRef.current || !dropdownRef.current.contains(event.target))
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter options based on search term
  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (opt.subLabel && opt.subLabel.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleSelect = (val) => {
    onChange(val);
    setIsOpen(false);
    setSearchTerm('');
  };

  useLayoutEffect(() => {
    if (isOpen && wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      setDropdownCoords({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width
      });
    }
  }, [isOpen]);

  return (
    <div className={`relative ${className}`} ref={wrapperRef}>
      <div
        className={`flex items-center justify-between border rounded-md px-3 py-1.5 text-xs bg-white cursor-pointer ${
          disabled ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : 'hover:border-slate-400 border-slate-300'
        }`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <div className="truncate flex-1 font-medium">
          {selectedOption ? selectedOption.label : <span className="text-slate-400">{placeholder}</span>}
        </div>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-2" />
      </div>

      {isOpen && createPortal(
        <div 
          ref={dropdownRef}
          className="absolute z-[9999] mt-1 bg-white border border-slate-200 rounded-md shadow-2xl glass-panel"
          style={{ top: dropdownCoords.top, left: dropdownCoords.left, width: dropdownCoords.width }}
        >
          <div className="p-2 border-b border-slate-100 flex items-center bg-slate-50/50">
            <Search className="w-3.5 h-3.5 text-slate-400 mr-2" />
            <Input
              autoFocus
              type="text"
              placeholder="Type to search..."
              className="w-full text-xs h-7 border-none shadow-none focus:ring-0 bg-transparent px-0"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="max-h-60 overflow-y-auto p-1">
            {loading ? (
              <div className="p-3 text-center text-xs text-slate-500 font-medium">Loading...</div>
            ) : filteredOptions.length === 0 ? (
              <div className="p-3 text-center text-xs text-slate-500">No results found</div>
            ) : (
              filteredOptions.map((opt) => (
                <div
                  key={opt.value}
                  className={`flex flex-col p-2 text-xs rounded-sm mb-0.5 ${
                    opt.disabled
                      ? 'bg-slate-100/70 text-slate-400 cursor-not-allowed opacity-60'
                      : opt.value === value
                      ? 'bg-blue-50 text-blue-700 font-semibold cursor-pointer'
                      : 'hover:bg-slate-100 text-slate-700 cursor-pointer'
                  }`}
                  onClick={() => {
                    if (!opt.disabled) handleSelect(opt.value);
                  }}
                >
                  <div className="flex justify-between items-center">
                    <span className={opt.disabled ? 'line-through text-slate-400' : ''}>{opt.label}</span>
                    {opt.value === value && <Check className="w-3.5 h-3.5 text-blue-600" />}
                  </div>
                  {opt.subLabel && (
                    <span className={`text-[10px] mt-0.5 ${opt.disabled ? 'text-amber-600 font-bold' : 'text-slate-500'}`}>
                      {opt.subLabel}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
