import React from 'react';
import { 
  Search, 
  Sliders, 
  ArrowRightLeft, 
  History,
  RefreshCw,
  Eye, 
  CheckCircle2, 
  AlertTriangle,
  XCircle,
  Package
} from 'lucide-react';
import { Button } from '../ui/Button';

export default function InventoryStockGrid({
  items = [],
  loading = false,
  warehouses = [],
  selectedWarehouseId = '',
  onSelectWarehouse,
  searchQuery = '',
  onSearchChange,
  statusFilter = 'ALL',
  onStatusFilterChange,
  onRowClick,
  onQuickAdjust,
  onQuickTransfer,
  onOpenAuditLog,
  isAuditLogOpen = false,
  onRefresh
}) {
  const getStatusBadge = (status) => {
    switch (status) {
      case 'in_stock':
        return (
          <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" /> In Stock
          </span>
        );
      case 'low_stock':
        return (
          <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <AlertTriangle className="w-2.5 h-2.5 mr-0.5" /> Low Stock
          </span>
        );
      case 'out_of_stock':
        return (
          <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-2.5 h-2.5 mr-0.5" /> Out of Stock
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
            {status || 'Unknown'}
          </span>
        );
    }
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
      {/* Top Operational Ribbon: All Filters & Actions in One Compact Bar */}
      <div className="px-3 py-2 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2">
        {/* Left: Search & Warehouse Filter */}
        <div className="flex items-center gap-2 flex-1 min-w-[280px] max-w-lg">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search by SKU code, name, or batch..."
              className="w-full pl-8 pr-2.5 py-1 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-slate-400"
            />
          </div>

          <div className="w-44">
            <select
              value={selectedWarehouseId}
              onChange={(e) => onSelectWarehouse(e.target.value)}
              className="w-full py-1 pl-2.5 pr-6 text-xs font-semibold bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-700"
            >
              <option value="">All Warehouses</option>
              {warehouses.map((wh) => (
                <option key={wh._id} value={wh._id}>
                  {wh.name} ({wh.code || 'WH'})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Center: Status Filter Pills */}
        <div className="flex items-center bg-slate-200/80 p-0.5 rounded-md text-[11px] font-semibold">
          {[
            { id: 'ALL', label: 'All' },
            { id: 'IN_STOCK', label: 'In Stock' },
            { id: 'LOW_STOCK', label: 'Low' },
            { id: 'OUT_OF_STOCK', label: 'Out' }
          ].map((st) => (
            <button
              key={st.id}
              onClick={() => onStatusFilterChange(st.id)}
              className={`px-2 py-0.5 rounded transition-all ${
                statusFilter === st.id
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>

        {/* Right: Actions (Adjust, Transfer, Audit Log, Refresh) */}
        <div className="flex items-center gap-1.5">
          <Button
            size="xs"
            variant="outline"
            onClick={() => onQuickAdjust && onQuickAdjust()}
            className="h-7 text-xs px-2 border-slate-300 text-slate-700 hover:bg-amber-50 hover:text-amber-800 hover:border-amber-300"
            title="Record stock adjustment or physical variance"
          >
            <Sliders className="h-3 w-3 mr-1 text-amber-600" />
            <span>Adjust</span>
          </Button>

          <Button
            size="xs"
            variant="outline"
            onClick={() => onQuickTransfer && onQuickTransfer()}
            className="h-7 text-xs px-2 border-slate-300 text-slate-700 hover:bg-blue-50 hover:text-blue-800 hover:border-blue-300"
            title="Move stock between warehouses"
          >
            <ArrowRightLeft className="h-3 w-3 mr-1 text-blue-600" />
            <span>Transfer</span>
          </Button>

          <Button
            size="xs"
            variant={isAuditLogOpen ? 'default' : 'outline'}
            onClick={() => onOpenAuditLog && onOpenAuditLog()}
            className={`h-7 text-xs px-2 ${
              isAuditLogOpen 
                ? 'bg-slate-800 text-white' 
                : 'border-slate-300 text-slate-700 hover:bg-slate-100'
            }`}
            title="Toggle Immutable Audit Ledger"
          >
            <History className="h-3 w-3 mr-1 text-slate-500" />
            <span>Audit Log</span>
          </Button>

          {onRefresh && (
            <button
              onClick={onRefresh}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100 transition-colors"
              title="Refresh Live Balances"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* Data Table: MS Excel-Dense Spreadsheet Presentation */}
      <div className="overflow-x-auto custom-scrollbar max-h-[calc(100vh-180px)]">
        <table className="w-full text-left text-xs text-slate-700 min-w-[750px] border-collapse">
          <thead className="bg-slate-100/95 text-slate-700 font-bold uppercase text-[10px] tracking-wider border-b border-slate-300 sticky top-0 z-10 shadow-2xs">
            <tr>
              <th className="py-2 px-3 border-r border-slate-200">SKU Code</th>
              <th className="py-2 px-3 border-r border-slate-200">Material Name</th>
              <th className="py-2 px-3 border-r border-slate-200">Warehouse & Bin</th>
              <th className="py-2 px-3 border-r border-slate-200 text-right font-mono">On Hand</th>
              <th className="py-2 px-3 border-r border-slate-200 text-right font-mono">Reserved</th>
              <th className="py-2 px-3 border-r border-slate-200 text-right font-mono text-emerald-700">Available</th>
              <th className="py-2 px-3 border-r border-slate-200 text-center">Status</th>
              <th className="py-2 px-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium">
            {loading ? (
              <tr>
                <td colSpan={8} className="py-10 text-center text-slate-400">
                  <div className="inline-flex items-center space-x-2 text-xs">
                    <div className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    <span>Loading real-time stock balances...</span>
                  </div>
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-10 text-center text-slate-400">
                  <Package className="h-6 w-6 mx-auto text-slate-300 mb-1" />
                  <p className="font-semibold text-slate-600 text-xs">No matching inventory items</p>
                  <span className="text-[10px] text-slate-400">Try adjusting search filters or selecting another warehouse.</span>
                </td>
              </tr>
            ) : (
              items.map((item, idx) => {
                const onHand = item.onHand !== undefined ? item.onHand : (item.balance || 0);
                const reserved = item.reserved !== undefined ? item.reserved : (item.reservedBalance || 0);
                const available = item.available !== undefined ? item.available : Math.max(0, onHand - reserved);
                const unit = item.materialId?.unit || 'Units';

                return (
                  <tr
                    key={item._id}
                    onClick={() => onRowClick && onRowClick(item)}
                    className={`transition-colors cursor-pointer group ${
                      idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                    } hover:bg-blue-50/60`}
                  >
                    {/* SKU Code */}
                    <td className="py-1.5 px-3 border-r border-slate-100 font-mono text-blue-600 font-bold text-[11px] group-hover:underline">
                      {item.materialId?.code || 'SKU'}
                    </td>

                    {/* Material Name */}
                    <td className="py-1.5 px-3 border-r border-slate-100 text-slate-900 font-semibold truncate max-w-[220px]">
                      <div className="flex items-center space-x-1.5">
                        <span className="truncate">{item.materialId?.name || 'Material Name'}</span>
                        {item.materialId?.type && (
                          <span className="text-[9px] px-1 py-0.2 bg-slate-100 text-slate-600 rounded font-semibold shrink-0">
                            {item.materialId.type}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Warehouse & Bin */}
                    <td className="py-1.5 px-3 border-r border-slate-100 text-slate-600 font-medium truncate max-w-[170px]">
                      <span>{item.warehouseId?.name || 'Warehouse'}</span>
                      {item.binLocation && (
                        <span className="ml-1 font-mono text-[9px] bg-slate-100 text-slate-600 px-1 rounded font-bold">
                          {item.binLocation}
                        </span>
                      )}
                    </td>

                    {/* On Hand */}
                    <td className="py-1.5 px-3 border-r border-slate-100 text-right font-mono font-bold text-slate-800">
                      {onHand.toLocaleString()} <span className="text-[9px] font-normal text-slate-400">{unit}</span>
                    </td>

                    {/* Reserved */}
                    <td className="py-1.5 px-3 border-r border-slate-100 text-right font-mono font-semibold text-amber-600">
                      {reserved > 0 ? (
                        <span>{reserved.toLocaleString()} <span className="text-[9px] font-normal text-amber-500">{unit}</span></span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>

                    {/* Available */}
                    <td className="py-1.5 px-3 border-r border-slate-100 text-right font-mono font-extrabold text-emerald-600 text-xs">
                      {available.toLocaleString()} <span className="text-[9px] font-normal text-emerald-500">{unit}</span>
                    </td>

                    {/* Status */}
                    <td className="py-1.5 px-3 border-r border-slate-100 text-center">
                      {getStatusBadge(item.status)}
                    </td>

                    {/* Actions */}
                    <td className="py-1.5 px-2 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center space-x-1 opacity-70 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => onRowClick && onRowClick(item)}
                          className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-blue-50 transition-colors"
                          title="View Details"
                        >
                          <Eye className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => onQuickAdjust && onQuickAdjust(item)}
                          className="p-1 text-slate-400 hover:text-amber-600 rounded hover:bg-amber-50 transition-colors"
                          title="Adjust Stock"
                        >
                          <Sliders className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => onQuickTransfer && onQuickTransfer(item)}
                          className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-blue-50 transition-colors"
                          title="Transfer Stock"
                        >
                          <ArrowRightLeft className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Compact Sheet Footer */}
      <div className="py-1.5 px-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-[10px] text-slate-500">
        <span>Displaying <strong>{items.length}</strong> items in active sheet</span>
        <span className="text-slate-400">Click any row to open slide-over drawer</span>
      </div>
    </div>
  );
}
