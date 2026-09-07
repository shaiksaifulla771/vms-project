import React, { useState, useEffect, useCallback } from 'react';
import api from '../../../services/api';
import { Dialog } from '../../../components/ui/Dialog';
import { Button } from '../../../components/ui/Button';
import { Search, CheckSquare, Square, Tag, PackageCheck, Building2 } from 'lucide-react';

export const LinkItemsModal = ({
  isOpen,
  onClose,
  classification,
  activeType,
  onSuccess,
  showToast
}) => {
  const [availableItems, setAvailableItems] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [onlyUnassigned, setOnlyUnassigned] = useState(true);

  const isVendor = activeType === 'vendor';

  const fetchAvailableItems = useCallback(async () => {
    if (!classification?._id) return;
    setLoading(true);
    try {
      const res = await api.get(`/api/classifications/${classification._id}/available-items`, {
        params: {
          type: activeType,
          search: search.trim() || undefined,
          onlyUnassigned: onlyUnassigned ? 'true' : 'false',
          limit: 100
        }
      });
      setAvailableItems(res.data?.data || []);
    } catch (err) {
      console.error(err);
      if (showToast) showToast('Failed to load available items', 'error');
    } finally {
      setLoading(false);
    }
  }, [classification?._id, activeType, search, onlyUnassigned, showToast]);

  useEffect(() => {
    if (isOpen && classification?._id) {
      setSelectedIds(new Set());
      setSearch('');
      fetchAvailableItems();
    }
  }, [isOpen, classification?._id, fetchAvailableItems]);

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === availableItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(availableItems.map(i => i._id)));
    }
  };

  const handleLinkSubmit = async (e) => {
    e.preventDefault();
    if (selectedIds.size === 0) {
      if (showToast) showToast('Please select at least one item to link', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post(`/api/classifications/${classification._id}/link-items`, {
        type: activeType,
        itemIds: Array.from(selectedIds)
      });
      if (showToast) showToast(res.data?.message || 'Items linked successfully');
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      if (showToast) showToast(err.response?.data?.error || 'Failed to link items', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!classification) return null;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          {isVendor ? <Building2 className="h-4 w-4 text-blue-600" /> : <PackageCheck className="h-4 w-4 text-blue-600" />}
          <span>Link {isVendor ? 'Vendors' : 'Materials'} to "{classification.name}"</span>
        </div>
      }
    >
      <form onSubmit={handleLinkSubmit} className="space-y-3 text-xs text-slate-800">
        <div className="bg-blue-50/70 border border-blue-200/80 p-2.5 rounded-lg text-slate-700">
          <p className="font-semibold">
            Target: <strong className="text-blue-900 font-bold">{classification.name}</strong>{' '}
            {classification.code && <span className="font-mono text-[10px]">({classification.code})</span>}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Select items below to classify under this {classification.parentId ? 'sub-category' : 'category'}.
          </p>
        </div>

        {/* Filter Toolbar */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={`Search ${isVendor ? 'vendors by name or ID' : 'materials by code or name'}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-2.5 py-1.5 bg-white border border-slate-200 rounded-md text-xs font-medium text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
          </div>

          <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 cursor-pointer select-none bg-slate-50 px-2 py-1.5 rounded border border-slate-200 shrink-0">
            <input
              type="checkbox"
              checked={onlyUnassigned}
              onChange={(e) => setOnlyUnassigned(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 h-3 w-3 focus:ring-0"
            />
            <span>Unassigned only</span>
          </label>
        </div>

        {/* Available Items List */}
        <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
          <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-200 flex items-center justify-between text-[11px] font-extrabold text-slate-600">
            <button
              type="button"
              onClick={toggleSelectAll}
              disabled={availableItems.length === 0}
              className="flex items-center gap-1.5 hover:text-slate-900 transition-colors"
            >
              {selectedIds.size > 0 && selectedIds.size === availableItems.length ? (
                <CheckSquare className="h-3.5 w-3.5 text-blue-600" />
              ) : (
                <Square className="h-3.5 w-3.5 text-slate-400" />
              )}
              <span>Select All ({availableItems.length})</span>
            </button>
            <span>{selectedIds.size} selected</span>
          </div>

          <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
            {loading ? (
              <div className="py-8 text-center text-slate-400 font-bold animate-pulse">
                Loading available items...
              </div>
            ) : availableItems.length === 0 ? (
              <div className="py-8 text-center text-slate-400 font-medium">
                No items match your filter criteria.
              </div>
            ) : (
              availableItems.map(item => {
                const isSelected = selectedIds.has(item._id);
                return (
                  <label
                    key={item._id}
                    className={`flex items-center justify-between px-3 py-2 cursor-pointer transition-colors ${
                      isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(item._id)}
                        className="rounded border-slate-300 text-blue-600 h-3.5 w-3.5 focus:ring-0"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-blue-700 text-[11px]">
                            {isVendor ? item.vendorId || 'N/A' : item.code}
                          </span>
                          <span className="font-bold text-slate-900 text-xs truncate">
                            {item.name}
                          </span>
                        </div>
                        {item.categoryId && (
                          <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <Tag className="h-2.5 w-2.5" />
                            <span>Current: {item.categoryId.name}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {!isVendor && item.unit && (
                      <span className="text-[10px] font-mono text-slate-500 shrink-0 ml-2">
                        {item.unit}
                      </span>
                    )}
                  </label>
                );
              })
            )}
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <span className="text-[11px] font-bold text-slate-500">
            {selectedIds.size} {isVendor ? 'vendor(s)' : 'material(s)'} ready to link
          </span>
          <div className="flex items-center space-x-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-xs font-bold"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={submitting || selectedIds.size === 0}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs"
            >
              {submitting ? 'Linking...' : `Link Selected (${selectedIds.size})`}
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
};

export default LinkItemsModal;
