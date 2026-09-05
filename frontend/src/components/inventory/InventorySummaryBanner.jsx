import React from 'react';
import { Boxes, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';

export default function InventorySummaryBanner({
  summary = {},
  activeStatusFilter = 'ALL',
  onStatusFilterChange
}) {
  const {
    totalSKUs = 0,
    totalOnHandUnits = 0,
    totalAvailableUnits = 0,
    totalReservedUnits = 0,
    lowStockCount = 0,
    outOfStockCount = 0
  } = summary;

  const attentionCount = lowStockCount + outOfStockCount;

  return (
    <div className="bg-slate-100/90 border border-slate-200 rounded-lg px-3 py-1 flex flex-wrap items-center justify-between text-xs text-slate-600 gap-2 shadow-xs">
      {/* Left: Compact Excel Formula / Metrics Strip */}
      <div className="flex flex-wrap items-center gap-3.5 text-[11px]">
        <div className="flex items-center space-x-1.5">
          <Boxes className="w-3.5 h-3.5 text-blue-600" />
          <span className="font-semibold text-slate-500">Total SKUs:</span>
          <strong className="font-mono text-slate-900 font-bold">{totalSKUs}</strong>
        </div>

        <span className="text-slate-300">|</span>

        <div className="flex items-center space-x-1.5">
          <span className="font-semibold text-slate-500">On Hand:</span>
          <strong className="font-mono text-slate-800 font-bold">{totalOnHandUnits.toLocaleString()}</strong>
        </div>

        <span className="text-slate-300">|</span>

        <div className="flex items-center space-x-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          <span className="font-semibold text-emerald-700">Available:</span>
          <strong className="font-mono text-emerald-700 font-extrabold">{totalAvailableUnits.toLocaleString()}</strong>
        </div>

        <span className="text-slate-300">|</span>

        <div className="flex items-center space-x-1.5">
          <Clock className="w-3.5 h-3.5 text-amber-500" />
          <span className="font-semibold text-slate-500">Reserved:</span>
          <strong className="font-mono text-amber-700 font-bold">{totalReservedUnits.toLocaleString()}</strong>
        </div>

        {attentionCount > 0 && (
          <>
            <span className="text-slate-300">|</span>
            <div 
              onClick={() => onStatusFilterChange && onStatusFilterChange(activeStatusFilter === 'LOW_STOCK' ? 'ALL' : 'LOW_STOCK')}
              className="flex items-center space-x-1.5 cursor-pointer text-rose-700 hover:underline"
              title="Click to filter low stock items"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
              <span className="font-semibold">Attention:</span>
              <strong className="font-mono font-bold">{attentionCount} low/out</strong>
            </div>
          </>
        )}
      </div>

      {/* Right: Quick Mode Indicator */}
      <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider hidden sm:block">
        Live Stock Balances
      </div>
    </div>
  );
}
