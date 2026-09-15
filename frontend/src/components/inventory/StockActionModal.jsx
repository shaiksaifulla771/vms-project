import React, { useState, useEffect } from 'react';
import { X, Sliders, ArrowRightLeft, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '../ui/Button';

export default function StockActionModal({
  isOpen,
  onClose,
  mode = 'ADJUST', // 'ADJUST' | 'TRANSFER'
  item = null,
  materials = [],
  warehouses = [],
  onSubmit,
  loading = false
}) {
  const [formData, setFormData] = useState({
    materialId: '',
    warehouseId: '',
    fromWarehouseId: '',
    toWarehouseId: '',
    type: 'IN', // 'IN' | 'OUT'
    quantity: 1,
    reason: 'Physical count discrepancy',
    notes: '',
    referenceDoc: ''
  });

  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) {
      setError(null);
      return;
    }

    if (item) {
      const matId = item.materialId?._id || item.materialId || '';
      const whId = item.warehouseId?._id || item.warehouseId || '';
      setFormData({
        materialId: matId,
        warehouseId: whId,
        fromWarehouseId: whId,
        toWarehouseId: warehouses.find(w => w._id !== whId)?._id || '',
        type: 'IN',
        quantity: 1,
        reason: mode === 'ADJUST' ? 'Physical count discrepancy' : 'Cross-warehouse replenishment',
        notes: '',
        referenceDoc: ''
      });
    } else {
      setFormData({
        materialId: materials[0]?._id || '',
        warehouseId: warehouses[0]?._id || '',
        fromWarehouseId: warehouses[0]?._id || '',
        toWarehouseId: warehouses[1]?._id || '',
        type: 'IN',
        quantity: 1,
        reason: mode === 'ADJUST' ? 'Physical count discrepancy' : 'Cross-warehouse replenishment',
        notes: '',
        referenceDoc: ''
      });
    }
  }, [isOpen, item, mode, materials, warehouses]);

  if (!isOpen) return null;

  const currentAvailable = item ? (item.available !== undefined ? item.available : Math.max(0, (item.onHand || item.balance || 0) - (item.reserved || item.reservedBalance || 0))) : null;

  const handleSubmit = (e) => {
    e.preventDefault();
    setError(null);

    const qty = Number(formData.quantity);
    if (!qty || qty <= 0) {
      setError('Quantity must be greater than 0.');
      return;
    }

    if (mode === 'ADJUST' && formData.type === 'OUT' && currentAvailable !== null && qty > currentAvailable) {
      setError(`Cannot deduct ${qty}. Maximum available stock is ${currentAvailable}.`);
      return;
    }

    if (mode === 'TRANSFER') {
      if (!formData.fromWarehouseId || !formData.toWarehouseId) {
        setError('Please specify both source and destination warehouses.');
        return;
      }
      if (formData.fromWarehouseId === formData.toWarehouseId) {
        setError('Destination warehouse must be different from source warehouse.');
        return;
      }
      if (currentAvailable !== null && qty > currentAvailable) {
        setError(`Cannot transfer ${qty}. Maximum available stock in source warehouse is ${currentAvailable}.`);
        return;
      }
    }

    onSubmit && onSubmit(formData);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div 
        className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className={`p-2 rounded-lg ${mode === 'ADJUST' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
              {mode === 'ADJUST' ? <Sliders className="h-4 w-4" /> : <ArrowRightLeft className="h-4 w-4" />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {mode === 'ADJUST' ? 'Stock Adjustment' : 'Inter-Warehouse Stock Transfer'}
              </h3>
              <p className="text-[11px] text-slate-500">
                {mode === 'ADJUST' ? 'Reconcile physical inventory discrepancies or write-offs' : 'Move physical inventory between network storage locations'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200/50">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center space-x-2">
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Item Banner if triggered from row */}
          {item && (
            <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-lg text-xs flex items-center justify-between">
              <div>
                <span className="font-mono text-blue-600 font-bold block text-[11px]">{item.materialId?.code}</span>
                <span className="font-bold text-slate-900">{item.materialId?.name}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Available</span>
                <span className="font-mono text-emerald-600 font-extrabold text-sm">
                  {currentAvailable} {item.materialId?.unit || 'Units'}
                </span>
              </div>
            </div>
          )}

          {/* Mode ADJUST Fields */}
          {mode === 'ADJUST' ? (
            <>
              {/* Type Switcher */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1.5">Adjustment Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, type: 'IN' })}
                    className={`py-2 px-3 text-xs font-bold rounded-lg border transition-all ${
                      formData.type === 'IN'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-xs'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    + Add Stock (Count In)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, type: 'OUT' })}
                    className={`py-2 px-3 text-xs font-bold rounded-lg border transition-all ${
                      formData.type === 'OUT'
                        ? 'bg-rose-50 border-rose-500 text-rose-700 shadow-xs'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    - Deduct Stock (Write-off)
                  </button>
                </div>
              </div>

              {/* Warehouse selector if not locked */}
              {!item && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Target Warehouse</label>
                  <select
                    value={formData.warehouseId}
                    onChange={(e) => setFormData({ ...formData, warehouseId: e.target.value })}
                    className="w-full text-xs font-semibold py-1.5 px-3 bg-white border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    {warehouses.map(w => (
                      <option key={w._id} value={w._id}>{w.name} ({w.code})</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Quantity */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Quantity</label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  className="w-full font-mono text-sm font-bold py-1.5 px-3 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  required
                />
              </div>

              {/* Reason */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Reason</label>
                <select
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  className="w-full text-xs py-1.5 px-3 bg-white border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="Physical count discrepancy">Physical count discrepancy (Cycle Count)</option>
                  <option value="Damaged in handling">Damaged in handling</option>
                  <option value="Scrap / Spoilage">Scrap / Spoilage</option>
                  <option value="Customer Return">Customer Return</option>
                  <option value="R&D Sample Consumption">R&D Sample Consumption</option>
                  <option value="Opening Stock Balancing">Opening Stock Balancing</option>
                </select>
              </div>
            </>
          ) : (
            /* Mode TRANSFER Fields */
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">From Warehouse</label>
                  <select
                    value={formData.fromWarehouseId}
                    onChange={(e) => setFormData({ ...formData, fromWarehouseId: e.target.value })}
                    className="w-full text-xs font-semibold py-1.5 px-3 bg-white border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    {warehouses.map(w => (
                      <option key={w._id} value={w._id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">To Destination WH</label>
                  <select
                    value={formData.toWarehouseId}
                    onChange={(e) => setFormData({ ...formData, toWarehouseId: e.target.value })}
                    className="w-full text-xs font-semibold py-1.5 px-3 bg-white border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    {warehouses.map(w => (
                      <option key={w._id} value={w._id}>{w.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Transfer Quantity</label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  className="w-full font-mono text-sm font-bold py-1.5 px-3 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Transfer Notes / Tracking Ref</label>
                <input
                  type="text"
                  placeholder="e.g. Inter-plant replenishment TRF-2026-09"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full text-xs py-1.5 px-3 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </>
          )}

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end space-x-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={loading}
              className="border-slate-300 text-slate-700"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              isLoading={loading}
              className={mode === 'ADJUST' ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}
            >
              {mode === 'ADJUST' ? 'Confirm Adjustment' : 'Initiate Transfer'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
