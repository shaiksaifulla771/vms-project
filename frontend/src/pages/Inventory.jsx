import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../services/api';
import { useSiteContext } from '../context/SiteContext';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import {
  Boxes,
  ArrowRightLeft,
  Sliders,
  History,
  Plus,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Clock,
  ArrowRight,
  XCircle,
  ShieldCheck,
  Search,
  IndianRupee,
  TrendingDown,
  Layers,
  Send,
  Truck,
  Check,
  X,
  FileSpreadsheet,
  Globe
} from 'lucide-react';

const TABS = [
  { id: 'overview', label: 'Stock Overview', icon: Boxes },
  { id: 'adjustments', label: 'Stock Adjustments', icon: Sliders },
  { id: 'transfers', label: 'Stock Transfers', icon: ArrowRightLeft },
  { id: 'ledger', label: 'Audit Ledger', icon: History },
];

export default function Inventory() {
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
    totalStockValuation: 0,
    inStockCount: 0,
    outOfStockCount: 0,
    lowStockCount: 0
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

  // Modals
  const [isAdjModalOpen, setIsAdjModalOpen] = useState(false);
  const [isTrfModalOpen, setIsTrfModalOpen] = useState(false);

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
      if (searchQuery && searchQuery.trim() !== '') query.search = searchQuery.trim();
      if (statusFilter !== 'ALL') query.status = statusFilter;

      const [balRes, txRes, adjRes, trfRes, matRes, whRes, siteRes] = await Promise.all([
        api.get('/api/inventory', { params: query }),
        api.get('/api/inventory/ledger', { params: query }),
        api.get('/api/inventory/adjustments'),
        api.get('/api/transfers'),
        api.get('/api/materials'),
        api.get('/api/warehouses'),
        api.get('/api/sites')
      ]);

      const balData = balRes.data?.data || [];
      setBalances(balData);
      if (balRes.data?.summary) {
        setSummary(balRes.data.summary);
      }

      setTransactions(txRes.data?.data || []);
      setAdjustments(adjRes.data?.data || []);
      setTransfers(trfRes.data?.data || []);

      const matList = matRes.data?.data || matRes.data?.materials || [];
      const whList = whRes.data?.warehouses || whRes.data?.data || [];
      const siteList = siteRes.data?.sites || siteRes.data?.data || [];

      setMaterials(matList);
      setWarehouses(whList);
      setSites(siteList);

      // Pre-populate modal defaults with active scope
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
    } finally {
      setLoading(false);
    }
  }, [activeSiteId, activeWarehouseId, filteredWarehouses, searchQuery, statusFilter]);

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

      const avail = (item.balance || item.onHand || 0) - (item.reservedBalance || item.reserved || 0);
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
    let inStock = 0;
    let outOfStock = 0;
    let lowStock = 0;

    source.forEach(item => {
      const onHand = Number(item.balance !== undefined ? item.balance : (item.onHand || 0));
      const reserved = Number(item.reservedBalance !== undefined ? item.reservedBalance : (item.reserved || 0));
      const avail = Math.max(0, onHand - reserved);
      const unitPrice = Number(item.materialId?.basePrice || item.materialId?.standardCost || item.materialId?.cost || item.unitPrice || 0);

      totalOnHand += onHand;
      totalAvail += avail;
      totalRes += reserved;
      totalVal += (onHand * unitPrice);

      if (avail > 0) inStock++;
      else outOfStock++;

      const reorder = item.materialId?.reorderLevel || item.materialId?.safetyStock || 10;
      if (avail > 0 && avail <= reorder) lowStock++;
    });

    return {
      totalSKUs: source.length,
      totalOnHandUnits: Math.round(totalOnHand * 1000) / 1000,
      totalAvailableUnits: Math.round(totalAvail * 1000) / 1000,
      totalReservedUnits: Math.round(totalRes * 1000) / 1000,
      totalStockValuation: Math.round(totalVal * 100) / 100,
      inStockCount: inStock,
      outOfStockCount: outOfStock,
      lowStockCount: lowStock
    };
  }, [filteredBalances, balances, summary, searchQuery, typeFilter, statusFilter]);

  // Adjustments Handlers
  const handleCreateAdjustment = async (e) => {
    e.preventDefault();
    try {
      const targetWh = adjForm.warehouseId || activeWarehouseId || warehouses[0]?._id;
      if (!targetWh) {
        alert('Please select a target warehouse.');
        return;
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
      setToastMsg({ type: 'success', text: `✓ Stock adjustment ${adjNum} approved & inventory updated.` });
      fetchInventoryData();
    } catch (err) {
      const errMsg = err.response?.data?.message || err.response?.data?.error || err.message || 'Approval failed';
      setToastMsg({ type: 'error', text: errMsg });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRejectAdjustment = async (id, adjNum) => {
    setActionLoadingId(id);
    try {
      await api.post(`/api/inventory/adjustments/${id}/reject`, { reason: 'Rejected by manager' });
      setToastMsg({ type: 'info', text: `Stock adjustment ${adjNum} rejected.` });
      fetchInventoryData();
    } catch (err) {
      const errMsg = err.response?.data?.message || err.response?.data?.error || err.message || 'Rejection failed';
      setToastMsg({ type: 'error', text: errMsg });
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
        setToastMsg({ type: 'success', text: `✓ Transfer request ${res.data.data?.transferNumber || ''} created (Pending Approval).` });
        setIsTrfModalOpen(false);
        fetchInventoryData();
      }
    } catch (err) {
      const errMsg = err.response?.data?.message || err.response?.data?.error || err.message || 'Transfer failed';
      setToastMsg({ type: 'error', text: errMsg });
    }
  };

  const handleApproveTransfer = async (id, trfNum) => {
    setActionLoadingId(id);
    try {
      await api.post(`/api/transfers/${id}/approve`);
      setToastMsg({ type: 'success', text: `✓ Transfer ${trfNum} approved & stock reserved.` });
      fetchInventoryData();
    } catch (err) {
      const errMsg = err.response?.data?.message || err.response?.data?.error || err.message || 'Approval failed';
      setToastMsg({ type: 'error', text: errMsg });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDispatchTransfer = async (id, trfNum) => {
    setActionLoadingId(id);
    try {
      await api.post(`/api/transfers/${id}/dispatch`);
      setToastMsg({ type: 'info', text: `🚚 Transfer ${trfNum} dispatched (In Transit).` });
      fetchInventoryData();
    } catch (err) {
      const errMsg = err.response?.data?.message || err.response?.data?.error || err.message || 'Dispatch failed';
      setToastMsg({ type: 'error', text: errMsg });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReceiveTransfer = async (id, trfNum) => {
    setActionLoadingId(id);
    try {
      await api.post(`/api/transfers/${id}/receive`);
      setToastMsg({ type: 'success', text: `✓ Transfer ${trfNum} received & stock credited to destination!` });
      fetchInventoryData();
    } catch (err) {
      const errMsg = err.response?.data?.message || err.response?.data?.error || err.message || 'Receipt failed';
      setToastMsg({ type: 'error', text: errMsg });
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

  // Open Quick Adjustment for Row
  const openQuickAdjustment = (item) => {
    setAdjForm({
      materialId: item.materialId?._id || item.materialId,
      warehouseId: item.warehouseId?._id || item.warehouseId,
      adjustmentType: 'IN',
      quantity: 10,
      reason: 'Physical cycle count update',
      description: `Stock adjustment for ${item.materialId?.name}`,
      referenceDoc: 'MANUAL-COUNT',
    });
    setIsAdjModalOpen(true);
  };

  // Open Quick Transfer for Row
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

  return (
    <div className="space-y-3.5 font-sans text-slate-900 bg-slate-50/60 min-h-screen p-3 md:p-6">
      {/* COMPACT TOP ACTION BAR (No bulky card background) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-transparent">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-blue-600 text-white rounded-xl shadow-xs">
            <Boxes className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              Physical Stock & Inventory
              <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-blue-100 text-blue-800 rounded-md">
                {activeSummary.totalSKUs} SKUs
              </span>
            </h1>
            <p className="text-[11px] text-slate-500 font-medium">
              Multi-warehouse inventory balances & stock movements
            </p>
          </div>
        </div>

        {/* 2 Primary Action Buttons on Top in Same Position */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAdjModalOpen(true)}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 active:scale-95"
          >
            <Plus className="h-4 w-4" />
            <span>Stock Adjustment</span>
          </button>

          <button
            onClick={() => setIsTrfModalOpen(true)}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 active:scale-95"
          >
            <ArrowRightLeft className="h-4 w-4" />
            <span>Inter-Warehouse Transfer</span>
          </button>

          <button
            onClick={fetchInventoryData}
            className="p-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl shadow-xs transition-colors"
            title="Refresh Inventory Data"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* TOAST NOTIFICATION */}
      {toastMsg && (
        <div className={`p-3 rounded-xl text-xs font-bold border flex items-center justify-between shadow-xs animate-fadeIn ${
          toastMsg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
          : toastMsg.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-900'
          : 'bg-blue-50 border-blue-200 text-blue-900'
        }`}>
          <div className="flex items-center space-x-2">
            {toastMsg.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
             : <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />}
            <span>{toastMsg.text}</span>
          </div>
          <button onClick={() => setToastMsg(null)} className="text-slate-400 hover:text-slate-600 text-sm font-bold">×</button>
        </div>
      )}

      {/* COMPACT KPI METRICS TILES */}
      <div className="grid gap-2.5 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs space-y-0.5">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[10px] font-extrabold uppercase tracking-wider">Total SKUs</span>
            <Layers className="h-3.5 w-3.5 text-blue-600" />
          </div>
          <p className="text-lg sm:text-xl font-black text-slate-900">{activeSummary.totalSKUs} <span className="text-[10px] font-normal text-slate-500">lines</span></p>
          <p className="text-[10px] text-slate-500 font-medium truncate">{activeSummary.inStockCount} in stock &bull; {activeSummary.outOfStockCount} zero</p>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-3 shadow-xs space-y-0.5">
          <div className="flex items-center justify-between text-blue-700">
            <span className="text-[10px] font-extrabold uppercase tracking-wider">On-Hand Stock</span>
            <Boxes className="h-3.5 w-3.5 text-blue-600" />
          </div>
          <p className="text-lg sm:text-xl font-black text-blue-800">{activeSummary.totalOnHandUnits.toLocaleString()} <span className="text-[10px] font-normal text-blue-600">units</span></p>
          <p className="text-[10px] text-blue-600/80 font-medium truncate">Physical inventory</p>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 shadow-xs space-y-0.5">
          <div className="flex items-center justify-between text-emerald-700">
            <span className="text-[10px] font-extrabold uppercase tracking-wider">Available Stock</span>
            <Check className="h-3.5 w-3.5 text-emerald-600" />
          </div>
          <p className="text-lg sm:text-xl font-black text-emerald-800">{activeSummary.totalAvailableUnits.toLocaleString()} <span className="text-[10px] font-normal text-emerald-600">units</span></p>
          <p className="text-[10px] text-emerald-600/80 font-medium truncate">Unreserved & ready</p>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3 shadow-xs space-y-0.5">
          <div className="flex items-center justify-between text-amber-700">
            <span className="text-[10px] font-extrabold uppercase tracking-wider">Reserved Stock</span>
            <Clock className="h-3.5 w-3.5 text-amber-600" />
          </div>
          <p className="text-lg sm:text-xl font-black text-amber-800">{activeSummary.totalReservedUnits.toLocaleString()} <span className="text-[10px] font-normal text-amber-600">units</span></p>
          <p className="text-[10px] text-amber-600/80 font-medium truncate">Allocated to orders</p>
        </div>

        <div className="rounded-xl border border-purple-200 bg-purple-50/40 p-3 shadow-xs space-y-0.5 col-span-2 md:col-span-1">
          <div className="flex items-center justify-between text-purple-700">
            <span className="text-[10px] font-extrabold uppercase tracking-wider">Total Valuation</span>
            <IndianRupee className="h-3.5 w-3.5 text-purple-600" />
          </div>
          <p className="text-lg sm:text-xl font-black text-purple-900">₹{activeSummary.totalStockValuation.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <p className="text-[10px] text-purple-600/80 font-medium truncate">Live inventory value</p>
        </div>
      </div>

      {/* NAVIGATION TABS */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-200 bg-white rounded-2xl p-2 gap-2 shadow-sm">
        <div className="flex items-center gap-1 overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {activeTab === 'ledger' && (
          <Button
            size="sm"
            onClick={exportLedgerCSV}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl flex items-center gap-1.5"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> Export CSV
          </Button>
        )}
      </div>

      {/* TAB 1: PHYSICAL STOCK OVERVIEW */}
      {activeTab === 'overview' && (
        <Card className="bg-white border-slate-200/90 shadow-sm rounded-2xl overflow-hidden">
          <CardHeader className="border-b border-slate-100 p-4 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-xs font-black text-slate-900 uppercase tracking-wider">
                  PHYSICAL STOCK OVERVIEW & VALUATION
                </CardTitle>
                <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50 text-[10px] font-extrabold font-mono">
                  {filteredBalances.length} Lines
                </Badge>
                {activeSite && (
                  <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700">
                    Scope: {activeSite.name} {activeWarehouse ? `(${activeWarehouse.name})` : '(All Warehouses)'}
                  </span>
                )}
              </div>

              {/* SEARCH & MULTI-FILTER CONTROLS */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[200px]">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search material or code..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
                  />
                </div>

                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="p-1.5 px-2.5 border border-slate-200 rounded-xl text-xs bg-slate-50 font-bold text-slate-700"
                >
                  <option value="ALL">All Material Types</option>
                  <option value="Raw Material">Raw Material</option>
                  <option value="Packaged Material">Packaged Material</option>
                  <option value="Semi-Finished">Semi-Finished</option>
                  <option value="Finished">Finished Goods</option>
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="p-1.5 px-2.5 border border-slate-200 rounded-xl text-xs bg-slate-50 font-bold text-slate-700"
                >
                  <option value="ALL">All Stock Statuses</option>
                  <option value="IN_STOCK">In Stock (&gt; 0)</option>
                  <option value="LOW_STOCK">Low Stock Alert</option>
                  <option value="OUT_OF_STOCK">Out of Stock (0)</option>
                </select>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 text-slate-500 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="p-3.5">Material Details</th>
                    <th className="p-3.5">Warehouse & Site</th>
                    <th className="p-3.5 text-center">Batch / Lot</th>
                    <th className="p-3.5 text-right whitespace-nowrap">On-Hand</th>
                    <th className="p-3.5 text-right whitespace-nowrap">Reserved</th>
                    <th className="p-3.5 text-right whitespace-nowrap">Available</th>
                    <th className="p-3.5 text-right whitespace-nowrap">Unit Price</th>
                    <th className="p-3.5 text-right whitespace-nowrap">Total Value</th>
                    <th className="p-3.5 text-center whitespace-nowrap min-w-[120px]">Status</th>
                    <th className="p-3.5 text-right whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredBalances.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-8 text-center">
                        <div className="max-w-md mx-auto space-y-2 py-3">
                          <p className="text-xs font-black text-slate-800 uppercase tracking-wide">
                            No Stock Items Found in Selected Scope
                          </p>
                          <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                            {activeSite 
                              ? `Currently filtered to "${activeSite.name}" ${activeWarehouse ? `→ "${activeWarehouse.name}"` : ''}. If you adjusted stock in another facility, switch plant in the top header or click below.` 
                              : 'No stock records match the current search or filters.'}
                          </p>
                          {(activeSiteId || (activeWarehouseId && activeWarehouseId !== 'all')) && (
                            <button
                              type="button"
                              onClick={() => {
                                setActiveSiteId(null);
                                setActiveWarehouseId('all');
                              }}
                              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-extrabold text-[11px] rounded-xl transition-all shadow-xs"
                            >
                              <Globe className="h-3.5 w-3.5" />
                              <span>View All Facilities & Warehouses</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredBalances.map((item) => {
                      const onHand = Number(item.balance !== undefined ? item.balance : (item.onHand || 0));
                      const reserved = Number(item.reservedBalance !== undefined ? item.reservedBalance : (item.reserved || 0));
                      const avail = Math.max(0, onHand - reserved);
                      const unitPrice = Number(item.materialId?.basePrice || item.materialId?.standardCost || item.materialId?.cost || item.unitPrice || 0);
                      const totalVal = onHand * unitPrice;
                      const reorder = item.materialId?.reorderLevel || item.materialId?.safetyStock || 10;
                      const isLow = avail > 0 && avail <= reorder;

                      const formattedOnHand = Math.round(onHand * 1000) / 1000;
                      const formattedReserved = Math.round(reserved * 1000) / 1000;
                      const formattedAvail = Math.round(avail * 1000) / 1000;

                      return (
                        <tr key={item._id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="p-3.5">
                            <span className="font-mono font-bold text-blue-600 block text-[11px]">{item.materialId?.code}</span>
                            <span className="font-bold text-slate-900 block">{item.materialId?.name}</span>
                            <span className="text-[10px] text-slate-400 uppercase font-semibold">{item.materialId?.type || 'Material'}</span>
                          </td>
                          <td className="p-3.5">
                            <p className="font-extrabold text-slate-800">{item.warehouseId?.name || 'Warehouse'}</p>
                            <p className="text-[10px] text-slate-400">{item.siteId?.name || item.warehouseId?.siteId?.name || 'Primary Site'}</p>
                          </td>
                          <td className="p-3.5 text-center font-mono text-[11px] text-slate-600 whitespace-nowrap">
                            {item.batchNumber || 'DEFAULT'}
                          </td>
                          <td className="p-3.5 text-right font-mono font-extrabold text-slate-900 whitespace-nowrap">
                            {formattedOnHand} <span className="text-[10px] font-normal text-slate-500">{item.materialId?.unit || 'pcs'}</span>
                          </td>
                          <td className="p-3.5 text-right font-mono font-bold text-amber-600 whitespace-nowrap">
                            {formattedReserved} <span className="text-[10px] font-normal text-slate-500">{item.materialId?.unit || 'pcs'}</span>
                          </td>
                          <td className="p-3.5 text-right font-mono font-black text-emerald-700 whitespace-nowrap">
                            {formattedAvail} <span className="text-[10px] font-normal text-emerald-600">{item.materialId?.unit || 'pcs'}</span>
                          </td>
                          <td className="p-3.5 text-right font-mono text-slate-600 whitespace-nowrap">
                            ₹{unitPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="p-3.5 text-right font-mono font-extrabold text-purple-900 whitespace-nowrap">
                            ₹{totalVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="p-3.5 text-center whitespace-nowrap">
                            <span className={`inline-flex items-center justify-center px-3 py-1 rounded-md text-[10px] font-extrabold uppercase whitespace-nowrap tracking-wide leading-none ${
                              avail === 0 ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                              isLow ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                              'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}>
                              {avail === 0 ? 'Out of Stock' : isLow ? 'Low Stock' : 'In Stock'}
                            </span>
                          </td>
                          <td className="p-3.5 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => openQuickAdjustment(item)}
                                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold rounded-lg text-[10px] transition-colors"
                                title="Adjust Stock"
                              >
                                Adjust
                              </button>
                              <button
                                onClick={() => openQuickTransfer(item)}
                                className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-extrabold rounded-lg text-[10px] transition-colors"
                                title="Transfer to another warehouse"
                              >
                                Transfer
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
          </CardContent>
        </Card>
      )}

      {/* TAB 2: STOCK ADJUSTMENTS */}
      {activeTab === 'adjustments' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div>
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">Stock Adjustment Requests & Approvals</h3>
              <p className="text-[11px] text-slate-500 font-medium">Physical inventory discrepancies require supervisor authorization before ledger write.</p>
            </div>
            <button
              onClick={() => setIsAdjModalOpen(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow-sm flex items-center gap-1.5"
            >
              <Plus className="h-4 w-4" /> New Adjustment Request
            </button>
          </div>

          <Card className="bg-white border-slate-200/90 shadow-sm rounded-2xl overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/80 text-slate-500 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="p-3.5">Adj Code</th>
                      <th className="p-3.5">Material</th>
                      <th className="p-3.5">Warehouse</th>
                      <th className="p-3.5 text-center">Type & Qty</th>
                      <th className="p-3.5">Reason</th>
                      <th className="p-3.5">Created By</th>
                      <th className="p-3.5 text-center whitespace-nowrap min-w-[120px]">Status</th>
                      <th className="p-3.5 text-right whitespace-nowrap">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {adjustments.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-slate-400 text-xs italic">No adjustment records found.</td>
                      </tr>
                    ) : (
                      adjustments.map((adj) => {
                        const isPending = adj.status === 'Pending Approval';
                        return (
                          <tr key={adj._id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="p-3.5 font-mono font-extrabold text-blue-600 whitespace-nowrap">{adj.adjNumber}</td>
                            <td className="p-3.5">
                              <p className="font-extrabold text-slate-900">{adj.materialId?.name}</p>
                              <p className="text-[10px] text-slate-400 font-mono">{adj.materialId?.code}</p>
                            </td>
                            <td className="p-3.5 text-slate-700">{adj.warehouseId?.name}</td>
                            <td className="p-3.5 text-center whitespace-nowrap">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded font-mono font-bold text-[10px] whitespace-nowrap ${
                                adj.adjustmentType === 'IN' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                              }`}>
                                {adj.adjustmentType} {adj.quantity} {adj.materialId?.unit || 'pcs'}
                              </span>
                            </td>
                            <td className="p-3.5 text-slate-600 max-w-xs truncate">{adj.reason}</td>
                            <td className="p-3.5 text-slate-500 whitespace-nowrap">{adj.createdBy?.username || 'User'}</td>
                            <td className="p-3.5 text-center whitespace-nowrap">
                              <span className={`inline-flex items-center justify-center px-3 py-1 rounded-md text-[10px] font-extrabold uppercase whitespace-nowrap tracking-wide leading-none ${
                                adj.status === 'Approved' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                adj.status === 'Rejected' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                                'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}>
                                {adj.status}
                              </span>
                            </td>
                            <td className="p-3.5 text-right">
                              {isPending ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={() => handleApproveAdjustment(adj._id, adj.adjNumber)}
                                    disabled={actionLoadingId === adj._id}
                                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] rounded-lg transition-colors"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => handleRejectAdjustment(adj._id, adj.adjNumber)}
                                    disabled={actionLoadingId === adj._id}
                                    className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-extrabold text-[11px] rounded-lg transition-colors"
                                  >
                                    Reject
                                  </button>
                                </div>
                              ) : (
                                <span className="text-[10px] text-slate-400 font-mono">{adj.approvedBy?.username ? `by ${adj.approvedBy.username}` : 'Processed'}</span>
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
        </div>
      )}

      {/* TAB 3: INTER-WAREHOUSE TRANSFERS */}
      {activeTab === 'transfers' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div>
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">Inter-Warehouse Stock Transfers</h3>
              <p className="text-[11px] text-slate-500 font-medium">Track stock transit across sites: Request &bull; Approve &bull; Dispatch &bull; Receive.</p>
            </div>
            <button
              onClick={() => setIsTrfModalOpen(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-sm flex items-center gap-1.5"
            >
              <Plus className="h-4 w-4" /> New Transfer Request
            </button>
          </div>

          <Card className="bg-white border-slate-200/90 shadow-sm rounded-2xl overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/80 text-slate-500 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="p-3.5 whitespace-nowrap">Transfer Code</th>
                      <th className="p-3.5">Material</th>
                      <th className="p-3.5">Source &rarr; Destination</th>
                      <th className="p-3.5 text-right whitespace-nowrap">Quantity</th>
                      <th className="p-3.5 text-center whitespace-nowrap min-w-[120px]">Status</th>
                      <th className="p-3.5 whitespace-nowrap">Created At</th>
                      <th className="p-3.5 text-right whitespace-nowrap">Lifecycle Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {transfers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-400 text-xs italic">No transfer records found.</td>
                      </tr>
                    ) : (
                      transfers.map((trf) => (
                        <tr key={trf._id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="p-3.5 font-mono font-extrabold text-indigo-600 whitespace-nowrap">{trf.transferNumber}</td>
                          <td className="p-3.5">
                            <p className="font-extrabold text-slate-900">{trf.materialId?.name}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{trf.materialId?.code}</p>
                          </td>
                          <td className="p-3.5">
                            <div className="flex items-center gap-1.5 text-slate-700">
                              <span className="font-bold">{trf.fromWarehouseId?.name}</span>
                              <ArrowRight className="h-3 w-3 text-slate-400" />
                              <span className="font-bold text-slate-900">{trf.toWarehouseId?.name}</span>
                            </div>
                          </td>
                          <td className="p-3.5 text-right font-mono font-black text-slate-900 whitespace-nowrap">
                            {trf.quantity} <span className="text-[10px] font-normal text-slate-500">{trf.materialId?.unit || 'pcs'}</span>
                          </td>
                          <td className="p-3.5 text-center whitespace-nowrap">
                            <span className={`inline-flex items-center justify-center px-3 py-1 rounded-md text-[10px] font-extrabold uppercase whitespace-nowrap tracking-wide leading-none ${
                              trf.status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                              trf.status === 'In Transit' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                              trf.status === 'Approved' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                              trf.status === 'Cancelled' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                              'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}>
                              {trf.status}
                            </span>
                          </td>
                          <td className="p-3.5 text-slate-500 text-[11px] whitespace-nowrap">{new Date(trf.createdAt).toLocaleDateString()}</td>
                          <td className="p-3.5 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              {trf.status === 'Pending Approval' && (
                                <button
                                  onClick={() => handleApproveTransfer(trf._id, trf.transferNumber)}
                                  disabled={actionLoadingId === trf._id}
                                  className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-[11px] rounded-lg transition-colors"
                                >
                                  Approve
                                </button>
                              )}
                              {trf.status === 'Approved' && (
                                <button
                                  onClick={() => handleDispatchTransfer(trf._id, trf.transferNumber)}
                                  disabled={actionLoadingId === trf._id}
                                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[11px] rounded-lg transition-colors flex items-center gap-1"
                                >
                                  <Truck className="h-3 w-3" /> Dispatch
                                </button>
                              )}
                              {trf.status === 'In Transit' && (
                                <button
                                  onClick={() => handleReceiveTransfer(trf._id, trf.transferNumber)}
                                  disabled={actionLoadingId === trf._id}
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] rounded-lg transition-colors flex items-center gap-1"
                                >
                                  <Check className="h-3 w-3" /> Receive
                                </button>
                              )}
                              {trf.status === 'Completed' && (
                                <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Delivered
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 4: IMMUTABLE AUDIT LEDGER */}
      {activeTab === 'ledger' && (
        <Card className="bg-white border-slate-200/90 shadow-sm rounded-2xl overflow-hidden">
          <CardHeader className="border-b border-slate-100 p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-xs font-black text-slate-900 uppercase tracking-wider">
                IMMUTABLE INVENTORY AUDIT LEDGER
              </CardTitle>
              <p className="text-[11px] text-slate-500 font-medium">Append-only audit trail recording every stock inward, outward, adjustment, and transfer.</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={ledgerTypeFilter}
                onChange={(e) => setLedgerTypeFilter(e.target.value)}
                className="p-1.5 px-2.5 border border-slate-200 rounded-xl text-xs bg-slate-50 font-bold text-slate-700"
              >
                <option value="ALL">All Transaction Types</option>
                <option value="GRN">Goods Receipt (GRN)</option>
                <option value="ADJUSTMENT_IN">Adjustment IN</option>
                <option value="ADJUSTMENT_OUT">Adjustment OUT</option>
                <option value="TRANSFER_OUT">Transfer Dispatch</option>
                <option value="TRANSFER_IN">Transfer Receipt</option>
                <option value="Issue">Issue / Consumption</option>
              </select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 text-slate-500 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="p-3.5 whitespace-nowrap">Timestamp</th>
                    <th className="p-3.5 text-center whitespace-nowrap">Type</th>
                    <th className="p-3.5">Material</th>
                    <th className="p-3.5">Warehouse</th>
                    <th className="p-3.5 text-right whitespace-nowrap">Quantity</th>
                    <th className="p-3.5">Reference Document</th>
                    <th className="p-3.5 whitespace-nowrap">User</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium font-mono text-[11px]">
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400 font-sans italic text-xs">No ledger entries recorded.</td>
                    </tr>
                  ) : (
                    transactions
                      .filter(tx => ledgerTypeFilter === 'ALL' || tx.type === ledgerTypeFilter)
                      .map((tx) => (
                        <tr key={tx._id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="p-3.5 text-slate-500 font-sans text-xs whitespace-nowrap">{new Date(tx.createdAt).toLocaleString()}</td>
                          <td className="p-3.5 text-center whitespace-nowrap">
                            <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded font-extrabold uppercase text-[10px] bg-slate-100 text-slate-800 font-sans`}>
                              {tx.type}
                            </span>
                          </td>
                          <td className="p-3.5 font-sans">
                            <span className="font-bold text-slate-900 block">{tx.materialId?.name}</span>
                            <span className="font-mono text-slate-400 text-[10px]">{tx.materialId?.code}</span>
                          </td>
                          <td className="p-3.5 font-sans text-slate-700">{tx.warehouseId?.name || 'Warehouse'}</td>
                          <td className={`p-3.5 text-right font-black whitespace-nowrap ${tx.quantity >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {tx.quantity > 0 ? `+${tx.quantity}` : tx.quantity} {tx.materialId?.unit || 'pcs'}
                          </td>
                          <td className="p-3.5 text-slate-600 truncate max-w-xs">{tx.referenceId || tx.sourceDocType || '—'}</td>
                          <td className="p-3.5 font-sans text-slate-500 whitespace-nowrap">{tx.userId?.username || 'System'}</td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* MODAL 1: CREATE STOCK ADJUSTMENT */}
      {isAdjModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-100 text-blue-600 rounded-xl">
                  <Sliders className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">New Stock Adjustment Request</h3>
                  <p className="text-xs text-slate-500">Record physical count variance or inventory write-on/off</p>
                </div>
              </div>
              <button onClick={() => setIsAdjModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAdjustment} className="space-y-3.5 text-xs">
              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Target Material</label>
                <select
                  value={adjForm.materialId}
                  onChange={(e) => setAdjForm({ ...adjForm, materialId: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                  required
                >
                  {materials.map(m => (
                    <option key={m._id} value={m._id}>{m.name} ({m.code}) — {m.type}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Warehouse Location</label>
                  <select
                    value={adjForm.warehouseId}
                    onChange={(e) => setAdjForm({ ...adjForm, warehouseId: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-xs"
                    required
                  >
                    {warehouses.map(w => {
                      const sName = w.siteId?.name || (sites.find(s => s._id === (w.siteId?._id || w.siteId))?.name) || 'Facility';
                      const isCurrent = (w.siteId?._id || w.siteId) === activeSiteId;
                      return (
                        <option key={w._id} value={w._id}>
                          {w.name} — [{sName}]{isCurrent ? ' ⭐ Active Scope' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Adjustment Direction</label>
                  <select
                    value={adjForm.adjustmentType}
                    onChange={(e) => setAdjForm({ ...adjForm, adjustmentType: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                  >
                    <option value="IN">IN (Stock Increase / Found)</option>
                    <option value="OUT">OUT (Stock Decrease / Damaged)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Adjustment Quantity</label>
                  <input
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={adjForm.quantity}
                    onChange={(e) => setAdjForm({ ...adjForm, quantity: Number(e.target.value) })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Reason Code</label>
                  <select
                    value={adjForm.reason}
                    onChange={(e) => setAdjForm({ ...adjForm, reason: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                  >
                    <option value="Physical count discrepancy">Physical count discrepancy</option>
                    <option value="Damaged / Expired stock">Damaged / Expired stock</option>
                    <option value="Sample testing consumption">Sample testing consumption</option>
                    <option value="Opening balance calibration">Opening balance calibration</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Notes & Description (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Discrepancy observed during quarterly audit"
                  value={adjForm.description}
                  onChange={(e) => setAdjForm({ ...adjForm, description: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAdjModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl text-xs shadow-sm transition-colors flex items-center gap-1.5"
                >
                  <Check className="h-4 w-4" /> Submit for Approval
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: CREATE INTER-WAREHOUSE TRANSFER */}
      {isTrfModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl">
                  <ArrowRightLeft className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">New Inter-Warehouse Stock Transfer</h3>
                  <p className="text-xs text-slate-500">Initiate physical stock dispatch across facilities</p>
                </div>
              </div>
              <button onClick={() => setIsTrfModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTransfer} className="space-y-3.5 text-xs">
              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Transfer Material</label>
                <select
                  value={trfForm.materialId}
                  onChange={(e) => setTrfForm({ ...trfForm, materialId: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                  required
                >
                  {materials.map(m => (
                    <option key={m._id} value={m._id}>{m.name} ({m.code}) — {m.type}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Source Warehouse (FROM)</label>
                  <select
                    value={trfForm.fromWarehouseId}
                    onChange={(e) => setTrfForm({ ...trfForm, fromWarehouseId: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-xs"
                    required
                  >
                    {warehouses.map(w => {
                      const sName = w.siteId?.name || (sites.find(s => s._id === (w.siteId?._id || w.siteId))?.name) || 'Facility';
                      return (
                        <option key={w._id} value={w._id}>{w.name} — [{sName}]</option>
                      );
                    })}
                  </select>
                </div>
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Destination Warehouse (TO)</label>
                  <select
                    value={trfForm.toWarehouseId}
                    onChange={(e) => setTrfForm({ ...trfForm, toWarehouseId: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-xs"
                    required
                  >
                    {warehouses.filter(w => w._id !== trfForm.fromWarehouseId).map(w => {
                      const sName = w.siteId?.name || (sites.find(s => s._id === (w.siteId?._id || w.siteId))?.name) || 'Facility';
                      return (
                        <option key={w._id} value={w._id}>{w.name} — [{sName}]</option>
                      );
                    })}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Transfer Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={trfForm.quantity}
                    onChange={(e) => setTrfForm({ ...trfForm, quantity: Number(e.target.value) })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Transfer Reason</label>
                  <input
                    type="text"
                    value={trfForm.reason}
                    onChange={(e) => setTrfForm({ ...trfForm, reason: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                    required
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsTrfModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl shadow-sm transition-all"
                >
                  Submit Transfer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
