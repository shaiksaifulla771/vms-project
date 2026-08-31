import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../services/api';
import { useSiteContext } from '../context/SiteContext';
import usePageMeta from '../hooks/usePageMeta';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import DetailDrawer from '../components/ui/DetailDrawer';
import RowActionsMenu from '../components/ui/RowActionsMenu';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import {
  Boxes,
  ArrowRightLeft,
  Sliders,
  History,
  Plus,
  Search,
  IndianRupee,
  Layers,
  Check,
  FileSpreadsheet,
  Globe,
  Clock,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Package,
  Building2
} from 'lucide-react';

const TABS = [
  { id: 'overview', label: 'Stock', icon: Boxes },
  { id: 'adjustments', label: 'Adjustments', icon: Sliders },
  { id: 'transfers', label: 'Transfers', icon: ArrowRightLeft },
  { id: 'ledger', label: 'Audit Log', icon: History },
];

const STATUS_MAP = {
  in_stock: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  low_stock: 'bg-amber-50 text-amber-700 border-amber-200',
  out_of_stock: 'bg-rose-50 text-rose-700 border-rose-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 border-rose-200',
  in_transit: 'bg-blue-50 text-blue-700 border-blue-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-slate-100 text-slate-600 border-slate-200'
};

const getStatusBadgeClass = (status = '') => {
  const key = String(status).toLowerCase().replace(/\s+/g, '_');
  return STATUS_MAP[key] || 'bg-slate-100 text-slate-700 border-slate-200';
};

export default function Inventory() {
  usePageMeta('Inventory & Materials Management', 'Real-time stock ledger, batch tracking, warehouse balances, and adjustments.');
  const {
    activeSiteId,
    activeWarehouseId,
    activeSite,
    activeWarehouse,
    setActiveSiteId,
    setActiveWarehouseId,
    filteredWarehouses
  } = useSiteContext();

  const [activeTab, setActiveTab] = useState('overview');
  const [balances, setBalances] = useState([]);
  const [summary, setSummary] = useState({
    totalSKUs: 0,
    totalOnHandUnits: 0,
    totalAvailableUnits: 0,
    totalReservedUnits: 0,
    totalStockValuation: 0
  });

  const [transactions, setTransactions] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [sites, setSites] = useState([]);

  // Search & Filtering
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState('ALL');

  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);

  // Modals & Drawers
  const [isAdjModalOpen, setIsAdjModalOpen] = useState(false);
  const [isTrfModalOpen, setIsTrfModalOpen] = useState(false);
  const [stockOutWarningModal, setStockOutWarningModal] = useState(null);
  const [detailItem, setDetailItem] = useState(null);
  const [confirmWriteOffItem, setConfirmWriteOffItem] = useState(null);

  // Forms
  const [adjForm, setAdjForm] = useState({
    materialId: '',
    warehouseId: '',
    adjustmentType: 'IN',
    quantity: 10,
    reason: 'Physical count discrepancy',
    description: '',
    referenceDoc: '',
  });

  const [trfForm, setTrfForm] = useState({
    fromSiteId: '',
    fromWarehouseId: '',
    toSiteId: '',
    toWarehouseId: '',
    materialId: '',
    quantity: 50,
    reason: 'Stock balancing across sites',
    notes: '',
  });

  // Fetch Core Inventory Data
  const fetchInventoryData = useCallback(async () => {
    setLoading(true);
    try {
      const query = {};
      if (activeSiteId) query.siteId = activeSiteId;
      if (activeWarehouseId && activeWarehouseId !== 'all') query.warehouseId = activeWarehouseId;

      const balRes = await api.get('/api/inventory', { params: query });
      const balData = balRes.data?.data || [];
      setBalances(balData);
      if (balRes.data?.summary) {
        setSummary(balRes.data.summary);
      }
      setLoading(false);

      // Background secondary data
      const [txRes, adjRes, trfRes, matRes, whRes, siteRes] = await Promise.all([
        api.get('/api/inventory/ledger', { params: query }).catch(() => ({ data: { data: [] } })),
        api.get('/api/inventory/adjustments').catch(() => ({ data: { data: [] } })),
        api.get('/api/transfers').catch(() => ({ data: { data: [] } })),
        api.get('/api/materials').catch(() => ({ data: { data: [] } })),
        api.get('/api/warehouses').catch(() => ({ data: { data: [] } })),
        api.get('/api/sites').catch(() => ({ data: { data: [] } }))
      ]);

      setTransactions(txRes.data?.data || []);
      setAdjustments(adjRes.data?.data || []);
      setTransfers(trfRes.data?.data || []);

      const matList = matRes.data?.data || matRes.data?.materials || [];
      const whList = whRes.data?.warehouses || whRes.data?.data || [];
      const siteList = siteRes.data?.sites || siteRes.data?.data || [];

      setMaterials(matList);
      setWarehouses(whList);
      setSites(siteList);

      if (matList.length > 0) {
        const defaultWh = (activeWarehouseId && activeWarehouseId !== 'all')
          ? activeWarehouseId
          : (filteredWarehouses[0]?._id || whList[0]?._id || '');
        setAdjForm(prev => ({
          ...prev,
          materialId: prev.materialId || matList[0]._id,
          warehouseId: prev.warehouseId || defaultWh
        }));
        setTrfForm(prev => ({
          ...prev,
          materialId: prev.materialId || matList[0]._id,
          fromWarehouseId: prev.fromWarehouseId || defaultWh,
          toWarehouseId: prev.toWarehouseId || whList[1]?._id || whList[0]?._id || ''
        }));
      }
    } catch (err) {
      console.error('Failed to load inventory data:', err);
      setToastMsg({ type: 'error', text: err.response?.data?.error || err.message || 'Failed to load inventory data' });
      setLoading(false);
    }
  }, [activeSiteId, activeWarehouseId, filteredWarehouses]);

  useEffect(() => {
    fetchInventoryData();
  }, [fetchInventoryData]);

  // Filtered Stock Overview
  const filteredBalances = useMemo(() => {
    return balances.filter(item => {
      const matCode = item.materialId?.code?.toLowerCase() || '';
      const matName = item.materialId?.name?.toLowerCase() || '';
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q || matCode.includes(q) || matName.includes(q);

      const matType = item.materialId?.type || 'Raw Material';
      const matchesType = typeFilter === 'ALL' || matType === typeFilter;

      const onHand = Number(item.balance !== undefined ? item.balance : (item.onHand || 0));
      const reserved = Number(item.reservedBalance !== undefined ? item.reservedBalance : (item.reserved || 0));
      const avail = Math.max(0, onHand - reserved);
      const reorder = item.materialId?.reorderLevel || item.materialId?.safetyStock || 10;

      const matchesStatus =
        statusFilter === 'ALL' ? true :
          statusFilter === 'IN_STOCK' ? avail > 0 :
            statusFilter === 'OUT_OF_STOCK' ? avail <= 0 :
              statusFilter === 'LOW_STOCK' ? (avail <= reorder && avail > 0) : true;

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [balances, searchQuery, typeFilter, statusFilter]);

  // Live KPI Summary computed from active balances
  const activeSummary = useMemo(() => {
    const source = (balances && balances.length > 0) ? filteredBalances : [];
    if (source.length === 0 && summary.totalSKUs > 0 && !searchQuery && typeFilter === 'ALL' && statusFilter === 'ALL') {
      return summary;
    }

    let totalOnHand = 0;
    let totalAvail = 0;
    let totalRes = 0;
    let totalVal = 0;

    source.forEach(item => {
      const onHand = Number(item.balance !== undefined ? item.balance : (item.onHand || 0));
      const reserved = Number(item.reservedBalance !== undefined ? item.reservedBalance : (item.reserved || 0));
      const avail = Math.max(0, onHand - reserved);
      const unitPrice = Number(item.unitPrice !== undefined ? item.unitPrice : (item.materialId?.unitPrice || item.materialId?.basePrice || item.materialId?.standardCost || item.materialId?.cost || item.materialId?.purchasePrice || item.materialId?.price || 0));
      const totalValItem = Number(item.totalValue !== undefined ? item.totalValue : (onHand * unitPrice));

      totalOnHand += onHand;
      totalAvail += avail;
      totalRes += reserved;
      totalVal += totalValItem;
    });

    return {
      totalSKUs: source.length,
      totalOnHandUnits: Math.round(totalOnHand * 1000) / 1000,
      totalAvailableUnits: Math.round(totalAvail * 1000) / 1000,
      totalReservedUnits: Math.round(totalRes * 1000) / 1000,
      totalStockValuation: Math.round(totalVal * 100) / 100
    };
  }, [filteredBalances, balances, summary, searchQuery, typeFilter, statusFilter]);

  // Adjustments Handlers
  const handleCreateAdjustment = async (e) => {
    e.preventDefault();
    try {
      const targetWh = adjForm.warehouseId || activeWarehouseId || warehouses[0]?._id;
      if (!targetWh) {
        setToastMsg({ type: 'error', text: 'Please select a target warehouse.' });
        return;
      }

      if (adjForm.adjustmentType === 'OUT') {
        const mat = materials.find(m => m._id === adjForm.materialId);
        const curBal = balances.find(b =>
          (b.materialId?._id === adjForm.materialId || b.materialId === adjForm.materialId) &&
          (b.warehouseId?._id === targetWh || b.warehouseId === targetWh)
        );
        const availStock = curBal ? (curBal.available !== undefined ? curBal.available : Math.max(0, (curBal.balance || 0) - (curBal.reserved || 0))) : 0;
        const reqQty = Number(adjForm.quantity || 0);

        if (reqQty > availStock) {
          setStockOutWarningModal({
            materialName: mat?.name || 'Selected Material',
            materialCode: mat?.code || '',
            unit: mat?.unit || 'pcs',
            availableStock: availStock,
            requestedQty: reqQty,
            deficit: Math.round((reqQty - availStock) * 1000) / 1000
          });
          return;
        }
      }

      const res = await api.post('/api/inventory/adjustments', {
        ...adjForm,
        warehouseId: targetWh,
        siteId: activeSiteId || undefined
      });
      if (res.data?.success) {
        setToastMsg({ type: 'success', text: `✓ Adjustment request ${res.data.data?.adjNumber || ''} submitted for approval.` });
        setIsAdjModalOpen(false);
        fetchInventoryData();
      }
    } catch (err) {
      const errMsg = err.response?.data?.message || err.response?.data?.error || err.message || 'Adjustment failed';
      setToastMsg({ type: 'error', text: errMsg });
    }
  };

  const handleApproveAdjustment = async (id, adjNum) => {
    setActionLoadingId(id);
    try {
      await api.post(`/api/inventory/adjustments/${id}/approve`);
      setToastMsg({ type: 'success', text: `✓ Adjustment ${adjNum} approved & stock updated.` });
      fetchInventoryData();
    } catch (err) {
      setToastMsg({ type: 'error', text: err.response?.data?.message || err.message || 'Approval failed' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRejectAdjustment = async (id, adjNum) => {
    setActionLoadingId(id);
    try {
      await api.post(`/api/inventory/adjustments/${id}/reject`, { reason: 'Rejected by manager' });
      setToastMsg({ type: 'info', text: `Adjustment ${adjNum} rejected.` });
      fetchInventoryData();
    } catch (err) {
      setToastMsg({ type: 'error', text: err.response?.data?.message || err.message || 'Rejection failed' });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Transfers Handlers
  const handleCreateTransfer = async (e) => {
    e.preventDefault();
    try {
      const fromWh = trfForm.fromWarehouseId || activeWarehouseId || warehouses[0]?._id;
      if (!fromWh || !trfForm.toWarehouseId) {
        alert('Please select both source and destination warehouses.');
        return;
      }
      const payload = {
        materialId: trfForm.materialId,
        fromWarehouseId: fromWh,
        toWarehouseId: trfForm.toWarehouseId,
        quantity: trfForm.quantity,
        reason: trfForm.reason,
        notes: trfForm.notes || ''
      };
      if (trfForm.fromSiteId) payload.fromSiteId = trfForm.fromSiteId;
      if (trfForm.toSiteId) payload.toSiteId = trfForm.toSiteId;

      const res = await api.post('/api/transfers', payload);
      if (res.data?.success) {
        setToastMsg({ type: 'success', text: `✓ Transfer request ${res.data.data?.transferNumber || ''} created.` });
        setIsTrfModalOpen(false);
        fetchInventoryData();
      }
    } catch (err) {
      setToastMsg({ type: 'error', text: err.response?.data?.message || err.message || 'Transfer failed' });
    }
  };

  const handleUpdateTransferStatus = async (id, status) => {
    setActionLoadingId(id);
    try {
      let endpoint = `/api/transfers/${id}`;
      if (status === 'IN_TRANSIT') endpoint = `/api/transfers/${id}/dispatch`;
      else if (status === 'COMPLETED') endpoint = `/api/transfers/${id}/receive`;
      else if (status === 'CANCELLED') endpoint = `/api/transfers/${id}/cancel`;

      await api.post(endpoint);
      setToastMsg({ type: 'success', text: `✓ Transfer status updated to ${status}.` });
      fetchInventoryData();
    } catch (err) {
      setToastMsg({ type: 'error', text: err.response?.data?.message || err.message || 'Transfer update failed' });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Export Ledger CSV
  const exportLedgerCSV = () => {
    if (!transactions.length) {
      alert('No ledger transactions available to export.');
      return;
    }
    const headers = ['Date,Txn Type,Material Code,Material Name,Warehouse,Quantity,Ref Doc,Created By'];
    const rows = transactions.map(tx => [
      `"${new Date(tx.createdAt).toLocaleString()}"`,
      `"${tx.type}"`,
      `"${tx.materialId?.code || ''}"`,
      `"${tx.materialId?.name || ''}"`,
      `"${tx.warehouseId?.name || 'Warehouse'}"`,
      tx.quantity,
      `"${tx.referenceId || tx.sourceDocType || ''}"`,
      `"${tx.userId?.username || 'System'}"`
    ].join(','));

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Inventory_Ledger_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Quick Action Triggers
  const openQuickAdjustment = (item) => {
    setAdjForm({
      materialId: item.materialId?._id || item.materialId,
      warehouseId: item.warehouseId?._id || item.warehouseId,
      adjustmentType: 'IN',
      quantity: 10,
      reason: 'Physical count discrepancy',
      description: `Stock adjustment for ${item.materialId?.name || ''}`,
      referenceDoc: 'CYCLE-COUNT',
    });
    setIsAdjModalOpen(true);
  };

  const openQuickTransfer = (item) => {
    const fromWhId = item.warehouseId?._id || item.warehouseId;
    const destWh = warehouses.find(w => w._id !== fromWhId) || warehouses[0];
    setTrfForm({
      fromSiteId: item.siteId?._id || item.siteId || '',
      fromWarehouseId: fromWhId,
      toSiteId: destWh?.siteId?._id || destWh?.siteId || '',
      toWarehouseId: destWh?._id || '',
      materialId: item.materialId?._id || item.materialId,
      quantity: Math.min(item.available || item.balance || 10, 20),
      reason: 'Stock balancing transfer',
      notes: '',
    });
    setIsTrfModalOpen(true);
  };

  const handleExecuteWriteOff = async () => {
    if (!confirmWriteOffItem) return;
    try {
      const onHand = Number(confirmWriteOffItem.balance !== undefined ? confirmWriteOffItem.balance : (confirmWriteOffItem.onHand || 0));
      if (onHand <= 0) {
        setToastMsg({ type: 'info', text: 'Stock is already 0.' });
        setConfirmWriteOffItem(null);
        return;
      }
      await api.post('/api/inventory/adjustment', {
        materialId: confirmWriteOffItem.materialId?._id || confirmWriteOffItem.materialId,
        warehouseId: confirmWriteOffItem.warehouseId?._id || confirmWriteOffItem.warehouseId,
        type: 'ADJUSTMENT_OUT',
        quantity: onHand,
        reason: 'Zero-out balance write-off',
        referenceDoc: 'INVENTORY-RETIRE'
      });
      setToastMsg({ type: 'success', text: `✓ Wrote off remaining stock for ${confirmWriteOffItem.materialId?.name}.` });
      setConfirmWriteOffItem(null);
      fetchInventoryData();
    } catch (err) {
      setToastMsg({ type: 'error', text: err.response?.data?.message || 'Failed to write off balance' });
    }
  };

  return (
    <div className="space-y-2 font-sans text-slate-900 w-full">
      {/* 1-ROW COMPACT METRIC STRIP */}
      <div className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 flex flex-wrap items-center justify-between gap-3 text-xs shadow-2xs">
        <div className="flex flex-wrap items-center gap-4 text-slate-600 font-medium">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase text-slate-500">SKUs:</span>
            <span className="font-extrabold text-slate-900">{activeSummary.totalSKUs}</span>
          </div>
          <div className="h-3 w-px bg-slate-200" />
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase text-slate-500">On-Hand:</span>
            <span className="font-extrabold text-slate-900">{activeSummary.totalOnHandUnits.toLocaleString()}</span>
          </div>
          <div className="h-3 w-px bg-slate-200" />
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase text-slate-500">Available:</span>
            <span className="font-extrabold text-slate-900">{activeSummary.totalAvailableUnits.toLocaleString()}</span>
          </div>
          <div className="h-3 w-px bg-slate-200" />
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase text-slate-500">Reserved:</span>
            <span className="font-extrabold text-slate-900">{activeSummary.totalReservedUnits.toLocaleString()}</span>
          </div>
          <div className="h-3 w-px bg-slate-200" />
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase text-slate-500">Valuation:</span>
            <span className="font-extrabold text-slate-900">₹{activeSummary.totalStockValuation.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
          </div>
        </div>

        {/* Global Facility Scope Reminder */}
        {(activeSiteId || (activeWarehouseId && activeWarehouseId !== 'all')) && (
          <button
            type="button"
            onClick={() => {
              setActiveSiteId(null);
              setActiveWarehouseId('all');
            }}
            className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
          >
            <Globe className="h-3 w-3" />
            <span>Reset Plant Filter</span>
          </button>
        )}
      </div>

      {/* TABS & ACTIONS UNIFIED BAR */}
      <div className="flex flex-wrap items-center justify-between bg-white border border-slate-200 rounded-lg p-1 gap-2 shadow-2xs">
        <div className="flex items-center gap-1 overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-1.5 px-3 py-1 text-xs font-bold rounded-md transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 pr-0.5">
          {activeTab === 'ledger' && (
            <button
              onClick={exportLedgerCSV}
              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded flex items-center gap-1 transition-colors"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" /> Export CSV
            </button>
          )}

          <button
            onClick={() => setIsAdjModalOpen(true)}
            className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded flex items-center gap-1 transition-colors shadow-2xs"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Adjustment</span>
          </button>

          <button
            onClick={() => setIsTrfModalOpen(true)}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded flex items-center gap-1 transition-colors shadow-2xs"
          >
            <ArrowRightLeft className="h-3.5 w-3.5" />
            <span>Transfer</span>
          </button>
        </div>
      </div>

      {/* TAB 1: STOCK */}
      {activeTab === 'overview' && (
        <Card className="bg-white border-slate-200 shadow-2xs rounded-xl overflow-hidden">
          <CardHeader className="bg-slate-50 border-b border-slate-200 p-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="relative w-[240px] sm:w-[280px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search material or code..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                  />
                </div>

                <Badge variant="outline" className="border-slate-300 text-slate-700 bg-white text-[10px] font-bold font-mono">
                  {filteredBalances.length} items
                </Badge>
              </div>

              <div className="flex items-center gap-1.5 text-xs">
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="py-1 px-2 border border-slate-200 rounded-lg text-xs bg-white font-bold text-slate-700 focus:outline-none"
                >
                  <option value="ALL">All Types</option>
                  <option value="Raw Material">Raw Material</option>
                  <option value="Packaged Material">Packaged Material</option>
                  <option value="Semi-Finished">Semi-Finished</option>
                  <option value="Finished">Finished Goods</option>
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="py-1 px-2 border border-slate-200 rounded-lg text-xs bg-white font-bold text-slate-700 focus:outline-none"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="IN_STOCK">In Stock (&gt; 0)</option>
                  <option value="LOW_STOCK">Low Stock</option>
                  <option value="OUT_OF_STOCK">Out of Stock (0)</option>
                </select>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-xs min-w-[850px]">
                <thead className="bg-slate-100/90 text-slate-700 font-bold uppercase text-[10px] tracking-tight border-b border-slate-300 select-none">
                  <tr>
                    <th className="px-3 py-2">Material</th>
                    <th className="px-3 py-2">Warehouse</th>
                    <th className="px-3 py-2 text-right whitespace-nowrap">On-Hand</th>
                    <th className="px-3 py-2 text-right whitespace-nowrap">Reserved</th>
                    <th className="px-3 py-2 text-right whitespace-nowrap">Available</th>
                    <th className="px-3 py-2 text-right whitespace-nowrap">Unit Price</th>
                    <th className="px-3 py-2 text-right whitespace-nowrap">Total Value</th>
                    <th className="px-3 py-2 text-center whitespace-nowrap">Status</th>
                    <th className="px-3 py-2 text-right whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredBalances.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-6 text-center text-slate-400 italic">
                        No inventory records matching current filter.
                      </td>
                    </tr>
                  ) : (
                    filteredBalances.map((item) => {
                      const onHand = Number(item.balance !== undefined ? item.balance : (item.onHand || 0));
                      const reserved = Number(item.reservedBalance !== undefined ? item.reservedBalance : (item.reserved || 0));
                      const avail = Math.max(0, onHand - reserved);
                      const unitPrice = Number(item.unitPrice !== undefined ? item.unitPrice : (item.materialId?.unitPrice || item.materialId?.basePrice || item.materialId?.standardCost || item.materialId?.cost || item.materialId?.purchasePrice || item.materialId?.price || 0));
                      const totalVal = Number(item.totalValue !== undefined ? item.totalValue : (onHand * unitPrice));
                      const reorder = item.materialId?.reorderLevel || item.materialId?.safetyStock || 10;
                      const isLow = avail > 0 && avail <= reorder;
                      const statusBadge = avail === 0 ? 'Out of Stock' : isLow ? 'Low Stock' : 'In Stock';

                      return (
                        <tr key={item._id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-3 py-2">
                            <span className="font-mono font-bold text-blue-600 block text-[11px]">{item.materialId?.code}</span>
                            <span className="font-bold text-slate-900 block leading-tight">{item.materialId?.name}</span>
                            <span className="text-[9px] text-slate-400 uppercase font-semibold">{item.materialId?.type || 'Material'}</span>
                          </td>
                          <td className="px-3 py-2">
                            <p className="font-bold text-slate-800 leading-tight">{item.warehouseId?.name || 'Warehouse'}</p>
                            <p className="text-[10px] text-slate-400">{item.siteId?.name || item.warehouseId?.siteId?.name || 'Primary Site'}</p>
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-extrabold text-slate-900 whitespace-nowrap">
                            {Math.round(onHand * 1000) / 1000} <span className="text-[10px] font-normal text-slate-500">{item.materialId?.unit || 'pcs'}</span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-amber-600 whitespace-nowrap">
                            {Math.round(reserved * 1000) / 1000} <span className="text-[10px] font-normal text-slate-500">{item.materialId?.unit || 'pcs'}</span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-black text-emerald-700 whitespace-nowrap">
                            {Math.round(avail * 1000) / 1000} <span className="text-[10px] font-normal text-emerald-600">{item.materialId?.unit || 'pcs'}</span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono whitespace-nowrap font-bold text-slate-800">
                            ₹{unitPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-extrabold text-indigo-900 whitespace-nowrap">
                            ₹{totalVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-3 py-2 text-center whitespace-nowrap">
                            <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-[9px] font-extrabold uppercase border ${getStatusBadgeClass(statusBadge)}`}>
                              {statusBadge}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            <RowActionsMenu
                              onView={() => setDetailItem(item)}
                              onAdjust={() => openQuickAdjustment(item)}
                              onTransfer={() => openQuickTransfer(item)}
                              onDelete={onHand > 0 ? () => setConfirmWriteOffItem(item) : null}
                              deleteLabel="Write off remaining balance"
                            />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* TAB 2: ADJUSTMENTS */}
      {activeTab === 'adjustments' && (
        <Card className="bg-white border-slate-200 shadow-2xs rounded-xl overflow-hidden">
          <CardHeader className="bg-slate-50 border-b border-slate-200 p-2 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">Stock Adjustments</h3>
            <button
              onClick={() => setIsAdjModalOpen(true)}
              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded flex items-center gap-1"
            >
              <Plus className="h-3.5 w-3.5" /> New Request
            </button>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-xs min-w-[700px]">
                <thead className="bg-slate-100/90 text-slate-700 font-bold uppercase text-[10px] tracking-tight border-b border-slate-300">
                  <tr>
                    <th className="px-3 py-2">Code</th>
                    <th className="px-3 py-2">Material</th>
                    <th className="px-3 py-2">Warehouse</th>
                    <th className="px-3 py-2 text-center">Type & Qty</th>
                    <th className="px-3 py-2">Reason</th>
                    <th className="px-3 py-2 text-center whitespace-nowrap">Status</th>
                    <th className="px-3 py-2 text-right whitespace-nowrap">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {adjustments.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-slate-400 italic">No adjustment requests recorded.</td>
                    </tr>
                  ) : (
                    adjustments.map((adj) => {
                      const isAddition = adj.adjustmentType === 'IN' || adj.type === 'INCREASE' || adj.type === 'ADJUSTMENT_IN' || adj.type === 'IN';
                      const formattedQty = Math.abs(Number(adj.quantity || 0));
                      return (
                        <tr key={adj._id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-3 py-2 font-mono font-bold text-blue-600 whitespace-nowrap">
                            {adj.adjNumber || adj.adjustmentNumber || 'ADJ'}
                          </td>
                          <td className="px-3 py-2">
                            <p className="font-bold text-slate-900 leading-tight">{adj.materialId?.name}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{adj.materialId?.code}</p>
                          </td>
                          <td className="px-3 py-2 text-slate-700 font-bold">{adj.warehouseId?.name}</td>
                          <td className="px-3 py-2 text-center whitespace-nowrap">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded font-bold text-[10px] border ${
                              isAddition ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                            }`}>
                              {isAddition ? `+${formattedQty}` : `-${formattedQty}`} {adj.materialId?.unit || 'pcs'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-600 text-[11px] max-w-xs truncate">{adj.reason}</td>
                          <td className="px-3 py-2 text-center whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${getStatusBadgeClass(adj.status)}`}>
                              {adj.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            {adj.status === 'PENDING' ? (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => handleApproveAdjustment(adj._id, adj.adjNumber || adj.adjustmentNumber)}
                                  disabled={actionLoadingId === adj._id}
                                  className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold transition-all"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleRejectAdjustment(adj._id, adj.adjNumber || adj.adjustmentNumber)}
                                  disabled={actionLoadingId === adj._id}
                                  className="px-2 py-0.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-xs font-bold transition-all"
                                >
                                  Reject
                                </button>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-xs italic">Closed</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* TAB 3: TRANSFERS */}
      {activeTab === 'transfers' && (
        <Card className="bg-white border-slate-200 shadow-2xs rounded-xl overflow-hidden">
          <CardHeader className="bg-slate-50 border-b border-slate-200 p-2 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">Stock Transfers</h3>
            <button
              onClick={() => setIsTrfModalOpen(true)}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded flex items-center gap-1"
            >
              <Plus className="h-3.5 w-3.5" /> New Transfer
            </button>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-xs min-w-[700px]">
                <thead className="bg-slate-100/90 text-slate-700 font-bold uppercase text-[10px] tracking-tight border-b border-slate-300">
                  <tr>
                    <th className="px-3 py-2">Transfer Code</th>
                    <th className="px-3 py-2">Material</th>
                    <th className="px-3 py-2">Route</th>
                    <th className="px-3 py-2 text-right">Quantity</th>
                    <th className="px-3 py-2 text-center whitespace-nowrap">Status</th>
                    <th className="px-3 py-2 text-right whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {transfers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-400 italic">No transfer records found.</td>
                    </tr>
                  ) : (
                    transfers.map((trf) => (
                      <tr key={trf._id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-3 py-2 font-mono font-bold text-indigo-600 whitespace-nowrap">{trf.transferNumber}</td>
                        <td className="px-3 py-2">
                          <p className="font-bold text-slate-900 leading-tight">{trf.materialId?.name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{trf.materialId?.code}</p>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5 text-slate-700 font-bold">
                            <span>{trf.fromWarehouseId?.name}</span>
                            <ArrowRight className="h-3 w-3 text-slate-400" />
                            <span>{trf.toWarehouseId?.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-slate-900 whitespace-nowrap">{trf.quantity} {trf.materialId?.unit || 'pcs'}</td>
                        <td className="px-3 py-2 text-center whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${getStatusBadgeClass(trf.status)}`}>
                            {trf.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {trf.status === 'PENDING' && (
                            <button
                              onClick={() => handleUpdateTransferStatus(trf._id, 'IN_TRANSIT')}
                              disabled={actionLoadingId === trf._id}
                              className="px-2 py-0.5 bg-amber-500 hover:bg-amber-600 text-white rounded text-xs font-bold transition-all"
                            >
                              Dispatch
                            </button>
                          )}
                          {trf.status === 'IN_TRANSIT' && (
                            <button
                              onClick={() => handleUpdateTransferStatus(trf._id, 'COMPLETED')}
                              disabled={actionLoadingId === trf._id}
                              className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold transition-all"
                            >
                              Receive
                            </button>
                          )}
                          {['COMPLETED', 'CANCELLED'].includes(trf.status) && (
                            <span className="text-slate-400 text-xs italic">Closed</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* TAB 4: AUDIT LOG */}
      {activeTab === 'ledger' && (
        <Card className="bg-white border-slate-200 shadow-2xs rounded-xl overflow-hidden">
          <CardHeader className="bg-slate-50 border-b border-slate-200 p-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">Audit Log</h3>
            <select
              value={ledgerTypeFilter}
              onChange={(e) => setLedgerTypeFilter(e.target.value)}
              className="py-1 px-2 border border-slate-200 rounded-lg text-xs bg-white font-bold text-slate-700 focus:outline-none"
            >
              <option value="ALL">All Transactions</option>
              <option value="GRN">Goods Receipt (GRN)</option>
              <option value="ADJUSTMENT_IN">Adjustment IN</option>
              <option value="ADJUSTMENT_OUT">Adjustment OUT</option>
              <option value="TRANSFER_OUT">Transfer Dispatch</option>
              <option value="TRANSFER_IN">Transfer Receipt</option>
              <option value="Issue">Issue / Consumption</option>
            </select>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-xs min-w-[700px]">
                <thead className="bg-slate-100/90 text-slate-700 font-bold uppercase text-[10px] tracking-tight border-b border-slate-300">
                  <tr>
                    <th className="px-3 py-2 whitespace-nowrap">Timestamp</th>
                    <th className="px-3 py-2 text-center whitespace-nowrap">Type</th>
                    <th className="px-3 py-2">Material</th>
                    <th className="px-3 py-2">Warehouse</th>
                    <th className="px-3 py-2 text-right whitespace-nowrap">Qty</th>
                    <th className="px-3 py-2">Ref Doc</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium font-mono text-[11px]">
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-400 font-sans italic text-xs">No ledger entries recorded.</td>
                    </tr>
                  ) : (
                    transactions
                      .filter(tx => ledgerTypeFilter === 'ALL' || tx.type === ledgerTypeFilter)
                      .map((tx) => {
                        const isOutward = ['ADJUSTMENT_OUT', 'TRANSFER_OUT', 'Issue', 'CONSUMPTION', 'SCRAP'].includes(tx.type) || tx.quantity < 0;
                        const absQty = Math.abs(Number(tx.quantity || 0));
                        return (
                          <tr key={tx._id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-3 py-2 text-slate-500 font-sans text-xs whitespace-nowrap">{new Date(tx.createdAt).toLocaleString()}</td>
                            <td className="px-3 py-2 text-center whitespace-nowrap">
                              <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded font-bold uppercase text-[9px] bg-slate-100 text-slate-800 font-sans">
                                {tx.type}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-sans">
                              <span className="font-bold text-slate-900 block leading-tight">{tx.materialId?.name}</span>
                              <span className="font-mono text-slate-400 text-[10px]">{tx.materialId?.code}</span>
                            </td>
                            <td className="px-3 py-2 font-sans text-slate-700">{tx.warehouseId?.name || 'Warehouse'}</td>
                            <td className={`px-3 py-2 text-right font-bold whitespace-nowrap ${isOutward ? 'text-rose-700' : 'text-emerald-700'}`}>
                              {isOutward ? `-${absQty}` : `+${absQty}`} {tx.materialId?.unit || 'pcs'}
                            </td>
                            <td className="px-3 py-2 text-slate-600 truncate max-w-xs">{tx.referenceId || tx.sourceDocType || '—'}</td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* DETAIL DRAWER */}
      <DetailDrawer
        isOpen={!!detailItem}
        onClose={() => setDetailItem(null)}
        title={detailItem?.materialId?.name || 'Material Details'}
        subtitle={detailItem?.materialId?.code}
        badge={detailItem?.materialId?.type}
      >
        {detailItem && (
          <div className="space-y-3">
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 grid grid-cols-2 gap-2">
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase block">Warehouse</span>
                <span className="font-bold text-slate-800">{detailItem.warehouseId?.name || 'Assigned Warehouse'}</span>
              </div>
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase block">Facility Site</span>
                <span className="font-bold text-slate-800">{detailItem.siteId?.name || detailItem.warehouseId?.siteId?.name || 'Primary Plant'}</span>
              </div>
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase block">Batch / Lot</span>
                <span className="font-mono font-bold text-slate-800">{detailItem.batchNumber || 'DEFAULT'}</span>
              </div>
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase block">Reorder Level</span>
                <span className="font-mono font-bold text-slate-800">{detailItem.materialId?.reorderLevel || 10} {detailItem.materialId?.unit || 'pcs'}</span>
              </div>
            </div>

            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">On-Hand Units:</span>
                <span className="font-mono font-bold text-slate-900">{detailItem.balance || detailItem.onHand || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Reserved Units:</span>
                <span className="font-mono font-bold text-amber-600">{detailItem.reservedBalance || detailItem.reserved || 0}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1">
                <span className="text-slate-700 font-bold">Available to Issue:</span>
                <span className="font-mono font-extrabold text-emerald-700">
                  {Math.max(0, (detailItem.balance || detailItem.onHand || 0) - (detailItem.reservedBalance || detailItem.reserved || 0))}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => {
                  const it = detailItem;
                  setDetailItem(null);
                  openQuickAdjustment(it);
                }}
                className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs transition-colors text-center"
              >
                Create Adjustment
              </button>
              <button
                onClick={() => {
                  const it = detailItem;
                  setDetailItem(null);
                  openQuickTransfer(it);
                }}
                className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-lg text-xs transition-colors text-center"
              >
                Transfer Stock
              </button>
            </div>
          </div>
        )}
      </DetailDrawer>

      {/* MODAL 1: STOCK ADJUSTMENT */}
      {isAdjModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-md w-full p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-xs font-bold text-slate-900">Stock Adjustment</h3>
              <button onClick={() => setIsAdjModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-base font-bold">✕</button>
            </div>

            <form onSubmit={handleCreateAdjustment} className="space-y-2.5 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Target Material *</label>
                <select
                  value={adjForm.materialId}
                  onChange={(e) => setAdjForm({ ...adjForm, materialId: e.target.value })}
                  className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded font-medium"
                  required
                >
                  {materials.map(m => (
                    <option key={m._id} value={m._id}>{m.name} ({m.code}) — {m.type}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Warehouse *</label>
                  <select
                    value={adjForm.warehouseId}
                    onChange={(e) => setAdjForm({ ...adjForm, warehouseId: e.target.value })}
                    className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded font-medium text-xs"
                    required
                  >
                    {warehouses.map(w => (
                      <option key={w._id} value={w._id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Direction *</label>
                  <select
                    value={adjForm.adjustmentType}
                    onChange={(e) => setAdjForm({ ...adjForm, adjustmentType: e.target.value })}
                    className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded font-medium"
                  >
                    <option value="IN">IN (+ Stock)</option>
                    <option value="OUT">OUT (- Stock)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Quantity *</label>
                  <input
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={adjForm.quantity}
                    onChange={(e) => setAdjForm({ ...adjForm, quantity: Number(e.target.value) })}
                    className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded font-bold font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Reason *</label>
                  <select
                    value={adjForm.reason}
                    onChange={(e) => setAdjForm({ ...adjForm, reason: e.target.value })}
                    className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded font-medium"
                  >
                    <option value="Physical count discrepancy">Count Discrepancy</option>
                    <option value="Damaged / Expired stock">Damaged / Expired</option>
                    <option value="Sample testing consumption">Sample Testing</option>
                    <option value="Opening balance calibration">Balance Calibration</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAdjModalOpen(false)}
                  className="px-3 py-1 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold rounded text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded text-xs shadow-2xs transition-colors"
                >
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: INTER-WAREHOUSE TRANSFER */}
      {isTrfModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-md w-full p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-xs font-bold text-slate-900">Inter-Warehouse Transfer</h3>
              <button onClick={() => setIsTrfModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-base font-bold">✕</button>
            </div>

            <form onSubmit={handleCreateTransfer} className="space-y-2.5 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Material *</label>
                <select
                  value={trfForm.materialId}
                  onChange={(e) => setTrfForm({ ...trfForm, materialId: e.target.value })}
                  className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded font-medium"
                  required
                >
                  {materials.map(m => (
                    <option key={m._id} value={m._id}>{m.name} ({m.code})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">From *</label>
                  <select
                    value={trfForm.fromWarehouseId}
                    onChange={(e) => setTrfForm({ ...trfForm, fromWarehouseId: e.target.value })}
                    className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded font-medium text-xs"
                    required
                  >
                    {warehouses.map(w => (
                      <option key={w._id} value={w._id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">To *</label>
                  <select
                    value={trfForm.toWarehouseId}
                    onChange={(e) => setTrfForm({ ...trfForm, toWarehouseId: e.target.value })}
                    className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded font-medium text-xs"
                    required
                  >
                    {warehouses.filter(w => w._id !== trfForm.fromWarehouseId).map(w => (
                      <option key={w._id} value={w._id}>{w.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Quantity *</label>
                  <input
                    type="number"
                    min="1"
                    value={trfForm.quantity}
                    onChange={(e) => setTrfForm({ ...trfForm, quantity: Number(e.target.value) })}
                    className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded font-bold font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Reason *</label>
                  <input
                    type="text"
                    value={trfForm.reason}
                    onChange={(e) => setTrfForm({ ...trfForm, reason: e.target.value })}
                    className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded font-medium"
                    required
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsTrfModalOpen(false)}
                  className="px-3 py-1 text-slate-600 hover:bg-slate-100 font-bold rounded text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded text-xs shadow-2xs transition-all"
                >
                  Submit Transfer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: OVER-WITHDRAWAL DEFICIT POPUP */}
      {stockOutWarningModal && (
        <div className="fixed inset-0 bg-slate-950/60 flex items-center justify-center p-4 z-50 backdrop-blur-xs">
          <div className="bg-white border border-rose-200 rounded-xl max-w-md w-full p-4 space-y-3 shadow-2xl">
            <div className="flex items-center gap-2.5 pb-2 border-b border-rose-100">
              <div className="p-1.5 bg-rose-100 text-rose-600 rounded-md">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-900">Stock Limit Exceeded</h3>
                <p className="text-[10px] text-rose-600 font-bold">Action Blocked</p>
              </div>
            </div>

            <div className="p-2.5 bg-rose-50/80 border border-rose-200 rounded-lg text-xs space-y-2 text-rose-950 font-medium">
              <p className="font-bold text-slate-900">
                {stockOutWarningModal.materialName} ({stockOutWarningModal.materialCode})
              </p>
              <div className="grid grid-cols-2 gap-2 pt-0.5">
                <div className="p-1.5 bg-white rounded border border-rose-200">
                  <span className="text-[9px] text-slate-500 block font-bold uppercase">Present Stock</span>
                  <span className="text-xs font-bold text-emerald-700 font-mono">
                    {stockOutWarningModal.availableStock} {stockOutWarningModal.unit}
                  </span>
                </div>
                <div className="p-1.5 bg-white rounded border border-rose-200">
                  <span className="text-[9px] text-slate-500 block font-bold uppercase">Requested Out</span>
                  <span className="text-xs font-bold text-rose-700 font-mono">
                    {stockOutWarningModal.requestedQty} {stockOutWarningModal.unit}
                  </span>
                </div>
              </div>
              <p className="text-xs text-rose-900 pt-0.5 leading-relaxed font-semibold">
                Requested withdrawal of <strong>{stockOutWarningModal.requestedQty}</strong> exceeds available stock by <strong className="font-mono text-rose-950">{stockOutWarningModal.deficit} {stockOutWarningModal.unit}</strong>.
              </p>
            </div>

            <div className="pt-1 flex justify-end">
              <button
                type="button"
                onClick={() => setStockOutWarningModal(null)}
                className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded shadow-xs transition-colors"
              >
                Modify Quantity
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM ZERO-OUT DIALOG */}
      <ConfirmDialog
        isOpen={!!confirmWriteOffItem}
        onClose={() => setConfirmWriteOffItem(null)}
        onConfirm={handleExecuteWriteOff}
        title="Zero-Out Stock Balance"
        message={`Are you sure you want to write off the entire remaining on-hand stock (${confirmWriteOffItem?.balance || 0} units) for ${confirmWriteOffItem?.materialId?.name}? An audit-backed ledger adjustment will be recorded.`}
        confirmText="Write Off Balance"
        isDestructive={true}
      />

      {/* FLOATING TOAST */}
      {toastMsg && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm w-full">
          <div className="p-3 rounded-lg shadow-xl border bg-slate-900 text-white border-slate-700 flex items-start justify-between gap-2.5">
            <div className="flex items-start gap-2">
              <div className={`p-1 rounded mt-0.5 ${
                toastMsg.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
              }`}>
                {toastMsg.type === 'success' ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                )}
              </div>
              <div className="text-xs font-medium text-slate-200 leading-tight">{toastMsg.text}</div>
            </div>
            <button onClick={() => setToastMsg(null)} className="text-slate-400 hover:text-white text-sm font-bold leading-none">×</button>
          </div>
        </div>
      )}
    </div>
  );
}
