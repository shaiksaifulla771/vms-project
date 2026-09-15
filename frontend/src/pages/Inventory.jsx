import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api';
import inventoryService from '../services/inventoryService';
import { useSiteContext } from '../context/SiteContext';
import usePageMeta from '../hooks/usePageMeta';
import { 
  ArrowLeft,
  RefreshCw,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { Button } from '../components/ui/Button';

// Ultra-Compact Excel-Style Inventory Subcomponents
import InventorySummaryBanner from '../components/inventory/InventorySummaryBanner';
import InventoryStockGrid from '../components/inventory/InventoryStockGrid';
import InventoryDetailDrawer from '../components/inventory/InventoryDetailDrawer';
import StockActionModal from '../components/inventory/StockActionModal';

export default function Inventory() {
  usePageMeta('Inventory & Stock Console', 'High-density physical vs reserved stock sheet, warehouse tracking, and audit ledger.');
  
  const [searchParams, setSearchParams] = useSearchParams();
  const urlWhId = searchParams.get('warehouseId') || '';

  const {
    activeSiteId,
    activeWarehouseId
  } = useSiteContext();

  const [activeView, setActiveView] = useState('stock'); // 'stock' | 'audit'
  const [balances, setBalances] = useState([]);
  const [summary, setSummary] = useState({
    totalSKUs: 0,
    totalOnHandUnits: 0,
    totalAvailableUnits: 0,
    totalReservedUnits: 0,
    totalStockValuation: 0,
    lowStockCount: 0,
    outOfStockCount: 0
  });

  const [warehouses, setWarehouses] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [ledgerLogs, setLedgerLogs] = useState([]);

  // Filter States
  const [selectedWarehouseId, setSelectedWarehouseId] = useState(urlWhId || activeWarehouseId || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [loading, setLoading] = useState(true);
  const [toastMsg, setToastMsg] = useState(null);

  // Modals & Drawer
  const [selectedItem, setSelectedItem] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [actionModal, setActionModal] = useState({ isOpen: false, mode: 'ADJUST', item: null });
  const [actionLoading, setActionLoading] = useState(false);

  // Sync url param or context change
  useEffect(() => {
    if (urlWhId && urlWhId !== selectedWarehouseId) {
      setSelectedWarehouseId(urlWhId);
    }
  }, [urlWhId]);

  // 1. Fetch Masters Once on Mount
  useEffect(() => {
    const fetchMasters = async () => {
      try {
        const [whRes, matRes] = await Promise.all([
          api.get('/api/warehouses').catch(() => ({ data: { warehouses: [] } })),
          api.get('/api/materials').catch(() => ({ data: { data: [] } }))
        ]);
        setWarehouses(whRes.data?.warehouses || whRes.data?.data || []);
        setMaterials(matRes.data?.data || matRes.data?.materials || []);
      } catch (err) {
        console.error('Failed to load masters:', err);
      }
    };
    fetchMasters();
  }, []);

  // 2. Fetch Live Balances
  const fetchInventoryData = useCallback(async () => {
    setLoading(true);
    try {
      const query = {};
      if (selectedWarehouseId) query.warehouseId = selectedWarehouseId;
      else if (activeSiteId) query.siteId = activeSiteId;

      const balRes = await inventoryService.getInventoryBalance(query);
      const balData = balRes.data || [];
      setBalances(balData);
      if (balRes.summary) {
        setSummary(balRes.summary);
      }
    } catch (err) {
      console.error('Failed to load inventory:', err);
      setToastMsg({ type: 'error', text: 'Failed to fetch inventory balances' });
    } finally {
      setLoading(false);
    }
  }, [selectedWarehouseId, activeSiteId]);

  // 3. Fetch Audit Logs
  const fetchAuditLogs = useCallback(async () => {
    try {
      const res = await inventoryService.getInventoryTransactions();
      setLedgerLogs(res.data || []);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    }
  }, []);

  useEffect(() => {
    fetchInventoryData();
  }, [fetchInventoryData]);

  useEffect(() => {
    if (activeView === 'audit') {
      fetchAuditLogs();
    }
  }, [activeView, fetchAuditLogs]);

  // Memoized Filtered Balances
  const filteredBalances = useMemo(() => {
    return balances.filter((item) => {
      const q = searchQuery.toLowerCase().trim();
      const code = (item.materialId?.code || '').toLowerCase();
      const name = (item.materialId?.name || '').toLowerCase();
      const batch = (item.batchNumber || '').toLowerCase();

      const matchesSearch = !q || code.includes(q) || name.includes(q) || batch.includes(q);
      const matchesStatus =
        statusFilter === 'ALL' ? true :
        statusFilter === 'IN_STOCK' ? item.status === 'in_stock' :
        statusFilter === 'LOW_STOCK' ? item.status === 'low_stock' :
        statusFilter === 'OUT_OF_STOCK' ? item.status === 'out_of_stock' : true;

      return matchesSearch && matchesStatus;
    });
  }, [balances, searchQuery, statusFilter]);

  // Row Handlers
  const handleRowClick = (item) => {
    setSelectedItem(item);
    setIsDrawerOpen(true);
  };

  const handleQuickAdjust = (item = null) => {
    setActionModal({ isOpen: true, mode: 'ADJUST', item });
  };

  const handleQuickTransfer = (item = null) => {
    setActionModal({ isOpen: true, mode: 'TRANSFER', item });
  };

  // Submit Stock Action (Adjustment or Transfer)
  const handleActionSubmit = async (formData) => {
    setActionLoading(true);
    try {
      if (actionModal.mode === 'ADJUST') {
        const res = await inventoryService.createAdjustment({
          materialId: formData.materialId,
          warehouseId: formData.warehouseId,
          adjustmentType: formData.type,
          quantity: Number(formData.quantity),
          reason: formData.reason,
          description: formData.notes,
          referenceDoc: formData.referenceDoc
        });
        if (res.success) {
          setToastMsg({ type: 'success', text: `✓ Adjustment request ${res.data?.adjNumber || ''} created successfully.` });
          setActionModal({ isOpen: false, mode: 'ADJUST', item: null });
          fetchInventoryData();
        }
      } else {
        const res = await inventoryService.createTransfer({
          materialId: formData.materialId,
          fromWarehouseId: formData.fromWarehouseId,
          toWarehouseId: formData.toWarehouseId,
          quantity: Number(formData.quantity),
          reason: formData.reason,
          notes: formData.notes
        });
        if (res.success) {
          setToastMsg({ type: 'success', text: `✓ Inter-warehouse transfer ${res.data?.transferNumber || ''} initiated.` });
          setActionModal({ isOpen: false, mode: 'TRANSFER', item: null });
          fetchInventoryData();
        }
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || err.message || 'Operation failed';
      setToastMsg({ type: 'error', text: msg });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      {/* Toast Notification */}
      {toastMsg && (
        <div className={`px-3 py-2 rounded-lg border text-xs flex items-center justify-between shadow-xs transition-all ${
          toastMsg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          <div className="flex items-center space-x-2">
            {toastMsg.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <AlertCircle className="w-3.5 h-3.5 text-rose-600" />}
            <span className="font-semibold">{toastMsg.text}</span>
          </div>
          <button onClick={() => setToastMsg(null)} className="font-bold ml-4 hover:opacity-75">✕</button>
        </div>
      )}

      {/* View 1: Main High-Density Stock Console */}
      {activeView === 'stock' ? (
        <>
          {/* Main Excel-Dense Grid with Integrated Top Ribbon */}
          <InventoryStockGrid
            items={filteredBalances}
            loading={loading}
            warehouses={warehouses}
            selectedWarehouseId={selectedWarehouseId}
            onSelectWarehouse={(whId) => {
              setSelectedWarehouseId(whId);
              setSearchParams(whId ? { warehouseId: whId } : {});
            }}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            onRowClick={handleRowClick}
            onQuickAdjust={handleQuickAdjust}
            onQuickTransfer={handleQuickTransfer}
            onOpenAuditLog={() => setActiveView('audit')}
            isAuditLogOpen={false}
            onRefresh={fetchInventoryData}
          />

          {/* Single-Line Excel Status / Formula Bar */}
          <InventorySummaryBanner
            summary={summary}
            activeStatusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
          />
        </>
      ) : (
        /* View 2: Audit Ledger View */
        <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setActiveView('stock')}
                className="p-1 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-200 transition-colors"
                title="Back to Stock Sheet"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">Immutable Stock Ledger</h3>
                <p className="text-[10px] text-slate-500">Append-only audit trail for all inventory postings</p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Button
                size="xs"
                variant="outline"
                onClick={() => setActiveView('stock')}
                className="text-xs h-7 border-slate-300"
              >
                ← Back to Stock Sheet
              </Button>
              <Button
                size="xs"
                variant="outline"
                onClick={fetchAuditLogs}
                className="text-xs h-7 border-slate-300"
                title="Refresh Audit Log"
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                Refresh
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[calc(100vh-160px)]">
            <table className="w-full text-left text-xs text-slate-700 min-w-[700px] border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] border-b border-slate-300 sticky top-0 z-10">
                <tr>
                  <th className="py-2 px-3 border-r border-slate-200">Timestamp</th>
                  <th className="py-2 px-3 border-r border-slate-200">Txn ID</th>
                  <th className="py-2 px-3 border-r border-slate-200">Material</th>
                  <th className="py-2 px-3 border-r border-slate-200">Warehouse</th>
                  <th className="py-2 px-3 border-r border-slate-200">Movement Type</th>
                  <th className="py-2 px-3 border-r border-slate-200 text-right">Delta</th>
                  <th className="py-2 px-3 text-right">Balance After</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {ledgerLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400 text-xs">No ledger entries found.</td>
                  </tr>
                ) : (
                  ledgerLogs.map((log, idx) => {
                    const isPositive = (log.delta || log.quantity) > 0;
                    return (
                      <tr 
                        key={log._id || log.txnId || idx} 
                        className={`hover:bg-blue-50/50 transition-colors ${
                          idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                        }`}
                      >
                        <td className="py-1.5 px-3 border-r border-slate-100 text-slate-500 text-[11px]">
                          {log.createdAt ? new Date(log.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                        </td>
                        <td className="py-1.5 px-3 border-r border-slate-100 font-mono text-[10px] text-slate-600">
                          {log.txnId || '-'}
                        </td>
                        <td className="py-1.5 px-3 border-r border-slate-100 font-semibold text-slate-900">
                          {log.materialId?.name || log.materialId?.code}
                        </td>
                        <td className="py-1.5 px-3 border-r border-slate-100 text-slate-600">
                          {log.warehouseId?.name}
                        </td>
                        <td className="py-1.5 px-3 border-r border-slate-100">
                          <span className="font-bold text-[9px] uppercase px-1.5 py-0.5 bg-slate-100 rounded text-slate-700">
                            {log.type}
                          </span>
                        </td>
                        <td className={`py-1.5 px-3 border-r border-slate-100 text-right font-mono font-bold ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {isPositive ? '+' : ''}{log.delta !== undefined ? log.delta : log.quantity}
                        </td>
                        <td className="py-1.5 px-3 text-right font-mono font-bold text-slate-800">
                          {log.afterQty || log.balance}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Slide-over Item Drawer */}
      <InventoryDetailDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        item={selectedItem}
        onQuickAdjust={handleQuickAdjust}
        onQuickTransfer={handleQuickTransfer}
      />

      {/* Action Modal (Adjust / Transfer) */}
      <StockActionModal
        isOpen={actionModal.isOpen}
        onClose={() => setActionModal({ isOpen: false, mode: 'ADJUST', item: null })}
        mode={actionModal.mode}
        item={actionModal.item}
        materials={materials}
        warehouses={warehouses}
        onSubmit={handleActionSubmit}
        loading={actionLoading}
      />
    </div>
  );
}
