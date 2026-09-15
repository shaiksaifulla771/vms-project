import React, { useState, useEffect } from 'react';
import { 
  X, 
  Boxes, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  History, 
  Sliders, 
  ArrowRightLeft, 
  IndianRupee,
  FileText,
  User,
  Calendar,
  Building2,
  Tag
} from 'lucide-react';
import api from '../../services/api';
import { Button } from '../ui/Button';

export default function InventoryDetailDrawer({
  isOpen,
  onClose,
  item,
  onQuickAdjust,
  onQuickTransfer
}) {
  const [activeTab, setActiveTab] = useState('overview');
  const [transactions, setTransactions] = useState([]);
  const [loadingTxns, setLoadingTxns] = useState(false);

  useEffect(() => {
    if (!isOpen || !item) return;

    const fetchHistory = async () => {
      setLoadingTxns(true);
      try {
        const matId = item.materialId?._id || item.materialId;
        const whId = item.warehouseId?._id || item.warehouseId;
        const res = await api.get('/api/inventory/transactions', {
          params: { materialId: matId, warehouseId: whId, limit: 15 }
        });
        setTransactions(res.data?.data || res.data || []);
      } catch (err) {
        console.error('Failed to load transaction history:', err);
      } finally {
        setLoadingTxns(false);
      }
    };

    fetchHistory();
  }, [isOpen, item]);

  if (!isOpen || !item) return null;

  const onHand = item.onHand !== undefined ? item.onHand : (item.balance || 0);
  const reserved = item.reserved !== undefined ? item.reserved : (item.reservedBalance || 0);
  const available = item.available !== undefined ? item.available : Math.max(0, onHand - reserved);
  const unit = item.materialId?.unit || 'Units';
  const unitPrice = item.unitPrice || item.materialId?.basePrice || 0;
  const totalValue = onHand * unitPrice;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-xs flex justify-end transition-opacity animate-in fade-in">
      <div 
        className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex items-start justify-between">
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                {item.materialId?.code || 'SKU'}
              </span>
              <span className="text-[11px] text-slate-500 font-semibold">
                {item.warehouseId?.name || 'Warehouse'}
              </span>
            </div>
            <h2 className="text-base font-bold text-slate-900 mt-1">
              {item.materialId?.name || 'Material Details'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Metric Strip */}
        <div className="p-4 grid grid-cols-3 gap-2 bg-slate-50/40 border-b border-slate-100 text-center">
          <div className="p-2 bg-white rounded-lg border border-slate-200">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">On Hand</span>
            <span className="text-sm font-extrabold text-slate-900 font-mono">{onHand.toLocaleString()}</span>
            <span className="text-[9px] text-slate-400 block">{unit}</span>
          </div>
          <div className="p-2 bg-white rounded-lg border border-slate-200">
            <span className="text-[10px] uppercase font-bold text-amber-600 block">Reserved</span>
            <span className="text-sm font-extrabold text-amber-600 font-mono">{reserved.toLocaleString()}</span>
            <span className="text-[9px] text-slate-400 block">{unit}</span>
          </div>
          <div className="p-2 bg-white rounded-lg border border-emerald-200 bg-emerald-50/30">
            <span className="text-[10px] uppercase font-bold text-emerald-700 block">Available</span>
            <span className="text-sm font-extrabold text-emerald-700 font-mono">{available.toLocaleString()}</span>
            <span className="text-[9px] text-emerald-600 block">{unit}</span>
          </div>
        </div>

        {/* Drawer Tabs */}
        <div className="flex border-b border-slate-200 px-4 bg-white text-xs font-bold">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-2.5 px-3 border-b-2 transition-all ${
              activeTab === 'overview'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`py-2.5 px-3 border-b-2 transition-all flex items-center space-x-1 ${
              activeTab === 'history'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <span>Movement Log</span>
            {transactions.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[9px] bg-slate-100 text-slate-600">
                {transactions.length}
              </span>
            )}
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-4">
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {/* Financial Valuation */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-600">
                  <span>Standard Unit Cost:</span>
                  <strong className="font-mono text-slate-900 font-bold">₹{unitPrice.toLocaleString()}</strong>
                </div>
                <div className="flex items-center justify-between text-slate-600 pt-1.5 border-t border-slate-200">
                  <span>Stock Valuation:</span>
                  <strong className="font-mono text-emerald-700 font-bold text-sm">₹{totalValue.toLocaleString()}</strong>
                </div>
              </div>

              {/* Material Attributes */}
              <div className="space-y-2 text-xs">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Stock Parameters</span>
                <div className="grid grid-cols-2 gap-2 text-slate-700">
                  <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-400 block">Reorder Point</span>
                    <strong className="font-mono font-bold text-slate-800">
                      {item.materialId?.reorderLevel || 10} {unit}
                    </strong>
                  </div>
                  <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-400 block">Safety Stock</span>
                    <strong className="font-mono font-bold text-slate-800">
                      {item.materialId?.safetyStock || 5} {unit}
                    </strong>
                  </div>
                  <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-400 block">Default Batch</span>
                    <strong className="font-mono font-semibold text-slate-800 truncate block">
                      {item.batchNumber || 'DEFAULT'}
                    </strong>
                  </div>
                  <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-400 block">Bin / Zone</span>
                    <strong className="font-mono font-semibold text-slate-800">
                      {item.binLocation || 'A-01'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Quick Actions Panel */}
              <div className="pt-3 border-t border-slate-200 space-y-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Quick Operations</span>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      onClose();
                      onQuickAdjust && onQuickAdjust(item);
                    }}
                    className="w-full text-xs justify-center border-slate-300 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-300"
                  >
                    <Sliders className="w-3.5 h-3.5 mr-1.5 text-amber-500" />
                    Adjust Stock
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      onClose();
                      onQuickTransfer && onQuickTransfer(item);
                    }}
                    className="w-full text-xs justify-center border-slate-300 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5 mr-1.5 text-blue-500" />
                    Transfer Stock
                  </Button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-2.5">
              {loadingTxns ? (
                <div className="py-8 text-center text-xs text-slate-400">Loading audit history...</div>
              ) : transactions.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">No ledger transactions found for this item.</div>
              ) : (
                transactions.map((tx) => {
                  const isPositive = (tx.delta || tx.quantity) > 0;
                  const dateStr = tx.createdAt ? new Date(tx.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

                  return (
                    <div key={tx._id || tx.txnId} className="p-2.5 rounded-lg border border-slate-200 bg-white hover:border-slate-300 transition-colors text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 uppercase text-[10px]">
                          {tx.type || 'Transaction'}
                        </span>
                        <span className={`font-mono font-bold text-xs ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {isPositive ? '+' : ''}{tx.delta !== undefined ? tx.delta : tx.quantity} {unit}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>Balance after: <strong className="font-mono text-slate-700">{tx.afterQty || tx.balance}</strong></span>
                        <span>{dateStr}</span>
                      </div>
                      {tx.reason && (
                        <div className="text-[10px] text-slate-400 italic">
                          Reason: {tx.reason}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
