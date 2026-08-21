import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../services/api';
import { useSiteContext } from '../context/SiteContext';
import usePageMeta from '../hooks/usePageMeta';
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

const statusStyles = {
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  REJECTED: 'bg-rose-50 text-rose-700 border-rose-200',
  IN_TRANSIT: 'bg-blue-50 text-blue-700 border-blue-200',
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CANCELLED: 'bg-slate-100 text-slate-600 border-slate-200',
  Pending: 'bg-amber-50 text-amber-700 border-amber-200',
  Approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Rejected: 'bg-rose-50 text-rose-700 border-rose-200',
  Completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Available: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  LowStock: 'bg-amber-50 text-amber-700 border-amber-200',
  OutOfStock: 'bg-rose-50 text-rose-700 border-rose-200',
  Draft: 'bg-slate-50 text-slate-600 border-slate-200',
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
  const [stockOutWarningModal, setStockOutWarningModal] = useState(null);

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
      const unitPrice = Number(item.unitPrice !== undefined ? item.unitPrice : (item.materialId?.unitPrice || item.materialId?.basePrice || item.materialId?.standardCost || item.materialId?.cost || item.materialId?.purchasePrice || item.materialId?.price || 0));
      const totalValItem = Number(item.totalValue !== undefined ? item.totalValue : (onHand * unitPrice));

      totalOnHand += onHand;
      totalAvail += avail;
      totalRes += reserved;
      totalVal += totalValItem;

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

  // Adjustments Handlers with Stock Out Over-Withdrawal Validation
  const handleCreateAdjustment = async (e) => {
    e.preventDefault();
    try {
      const targetWh = adjForm.warehouseId || activeWarehouseId || warehouses[0]?._id;
      if (!targetWh) {
        setToastMsg({ type: 'error', text: 'Please select a target warehouse.' });
        return;
      }

      // Check for over-withdrawal when adjustmentType is OUT
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
                className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap ${isActive
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
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-xs min-w-[900px]">
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
                      const unitPrice = Number(item.unitPrice !== undefined ? item.unitPrice : (item.materialId?.unitPrice || item.materialId?.basePrice || item.materialId?.standardCost || item.materialId?.cost || item.materialId?.purchasePrice || item.materialId?.price || 0));
                      const totalVal = Number(item.totalValue !== undefined ? item.totalValue : (onHand * unitPrice));
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
                          <td className="p-3.5 text-right font-mono whitespace-nowrap">
                            <div className="flex flex-col items-end">
                              <span className="font-extrabold text-slate-900">
                                ₹{unitPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                              {item.hasBom ? (
                                <span className="inline-flex items-center text-[9px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 mt-0.5" title={`BOM Unit Cost (${item.bomNumber || 'BOM'})`}>
                                  BOM Cost
                                </span>
                              ) : (
                                item.priceSource && item.priceSource !== 'Default' && (
                                  <span className="text-[9px] text-slate-400 font-semibold mt-0.5">
                                    {item.priceSource}
                                  </span>
                                )
                              )}
                            </div>
                          </td>
                          <td className="p-3.5 text-right font-mono font-extrabold text-purple-900 whitespace-nowrap">
                            ₹{totalVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="p-3.5 text-center whitespace-nowrap">
                            <span className={`inline-flex items-center justify-center px-3 py-1 rounded-md text-[10px] font-extrabold uppercase whitespace-nowrap tracking-wide leading-none ${avail === 0 ? 'bg-rose-50 text-rose-700 border border-rose-200' :
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
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left text-xs min-w-[750px]">
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
                        <td colSpan={8} className="p-8 text-center text-slate-400 text-xs italic">No adjustment requests found.</td>
                      </tr>
                    ) : (
                      adjustments.map((adj) => {
                        const isAddition = adj.adjustmentType === 'IN' || adj.type === 'INCREASE' || adj.type === 'ADJUSTMENT_IN' || adj.type === 'IN';
                        const formattedQty = Math.abs(Number(adj.quantity || 0));
                        return (
                          <tr key={adj._id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="p-3.5 font-mono font-extrabold text-blue-600 whitespace-nowrap">
                              {adj.adjNumber || adj.adjustmentNumber || 'ADJ'}
                            </td>
                            <td className="p-3.5">
                              <p className="font-extrabold text-slate-900">{adj.materialId?.name}</p>
                              <p className="text-[10px] text-slate-400 font-mono">{adj.materialId?.code}</p>
                            </td>
                            <td className="p-3.5 text-slate-700 font-bold">{adj.warehouseId?.name}</td>
                            <td className="p-3.5 text-center whitespace-nowrap">
                              <div className="flex flex-col items-center gap-0.5">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full font-black text-[10px] ${
                                  isAddition ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                                }`}>
                                  {isAddition ? `+${formattedQty}` : `-${formattedQty}`} {adj.materialId?.unit || 'pcs'}
                                </span>
                                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                                  {isAddition ? 'Addition (IN)' : 'Reduction (OUT)'}
                                </span>
                              </div>
                            </td>
                            <td className="p-3.5 text-slate-600 text-[11px] max-w-xs truncate">{adj.reason}</td>
                            <td className="p-3.5 text-slate-600 text-xs">{adj.createdBy?.username || 'Planner'}</td>
                            <td className="p-3.5 text-center whitespace-nowrap">
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${statusStyles[adj.status]}`}>
                                {adj.status}
                              </span>
                            </td>
                            <td className="p-3.5 text-right whitespace-nowrap">
                              {adj.status === 'PENDING' ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={() => handleApproveAdjustment(adj._id, adj.adjNumber || adj.adjustmentNumber)}
                                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => handleRejectAdjustment(adj._id, adj.adjNumber || adj.adjustmentNumber)}
                                    className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition-all"
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
        </div>
      )}

      {/* TAB 3: INTER-WAREHOUSE TRANSFERS */}
      {activeTab === 'transfers' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-200/90 shadow-sm">
            <div>
              <h2 className="text-sm font-extrabold text-slate-900 tracking-tight">Inter-Warehouse Inventory Transfers</h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">Move materials between storage facilities and production bays</p>
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
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left text-xs min-w-[800px]">
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
                          <td className="p-3.5 text-right font-black text-slate-900 whitespace-nowrap">{trf.quantity} {trf.materialId?.unit || 'pcs'}</td>
                          <td className="p-3.5 text-center whitespace-nowrap">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${statusStyles[trf.status]}`}>
                              {trf.status}
                            </span>
                          </td>
                          <td className="p-3.5 text-slate-500 whitespace-nowrap text-xs">{new Date(trf.createdAt).toLocaleDateString()}</td>
                          <td className="p-3.5 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              {trf.status === 'PENDING' && (
                                <button
                                  onClick={() => handleUpdateTransferStatus(trf._id, 'IN_TRANSIT')}
                                  className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold transition-all shadow-xs"
                                >
                                  Dispatch
                                </button>
                              )}
                              {trf.status === 'IN_TRANSIT' && (
                                <button
                                  onClick={() => handleUpdateTransferStatus(trf._id, 'COMPLETED')}
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs"
                                >
                                  Receive
                                </button>
                              )}
                              {['PENDING', 'IN_TRANSIT'].includes(trf.status) && (
                                <button
                                  onClick={() => handleUpdateTransferStatus(trf._id, 'CANCELLED')}
                                  className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition-all"
                                >
                                  Cancel
                                </button>
                              )}
                              {['COMPLETED', 'CANCELLED'].includes(trf.status) && (
                                <span className="text-slate-400 text-xs italic">Finished</span>
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
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-xs min-w-[750px]">
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
                          <td className={`p-3.5 text-right font-black whitespace-nowrap ${
                            (['ADJUSTMENT_OUT', 'TRANSFER_OUT', 'Issue', 'CONSUMPTION', 'SCRAP'].includes(tx.type) || tx.quantity < 0)
                              ? 'text-rose-700' : 'text-emerald-700'
                          }`}>
                            {(() => {
                              const isOutward = ['ADJUSTMENT_OUT', 'TRANSFER_OUT', 'Issue', 'CONSUMPTION', 'SCRAP'].includes(tx.type) || tx.quantity < 0;
                              const absQty = Math.abs(Number(tx.quantity || 0));
                              return `${isOutward ? '-' : '+'}${absQty} ${tx.materialId?.unit || 'pcs'}`;
                            })()}
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

      {/* MODAL: STOCK OUT OVER-WITHDRAWAL DEFICIT POPUP */}
      {stockOutWarningModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white border border-rose-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-scaleUp">
            <div className="flex items-center gap-3 pb-3 border-b border-rose-100">
              <div className="p-2.5 bg-rose-100 text-rose-600 rounded-xl">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">Stock Out Limit Exceeded</h3>
                <p className="text-xs text-rose-600 font-bold">Action Cannot Be Performed</p>
              </div>
            </div>

            <div className="p-3.5 bg-rose-50/80 border border-rose-200 rounded-xl text-xs space-y-2 text-rose-950 font-medium">
              <p className="font-bold text-slate-900">
                {stockOutWarningModal.materialName} ({stockOutWarningModal.materialCode})
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="p-2 bg-white rounded-lg border border-rose-200">
                  <span className="text-[10px] text-slate-500 block font-bold uppercase">Present Stock</span>
                  <span className="text-sm font-black text-emerald-700 font-mono">
                    {stockOutWarningModal.availableStock} {stockOutWarningModal.unit}
                  </span>
                </div>
                <div className="p-2 bg-white rounded-lg border border-rose-200">
                  <span className="text-[10px] text-slate-500 block font-bold uppercase">Requested Stock Out</span>
                  <span className="text-sm font-black text-rose-700 font-mono">
                    {stockOutWarningModal.requestedQty} {stockOutWarningModal.unit}
                  </span>
                </div>
              </div>
              <p className="text-xs text-rose-900 pt-1 leading-relaxed font-semibold">
                ⚠ Present stock is only <strong>{stockOutWarningModal.availableStock} {stockOutWarningModal.unit}</strong>. Requested withdrawal of <strong>{stockOutWarningModal.requestedQty} {stockOutWarningModal.unit}</strong> exceeds inventory by <strong className="font-mono text-rose-950 underline">{stockOutWarningModal.deficit} {stockOutWarningModal.unit}</strong>.
              </p>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setStockOutWarningModal(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs rounded-xl shadow-sm transition-colors"
              >
                Understood, Modify Quantity
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FLOATING TOAST NOTIFICATION (BOTTOM RIGHT) */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md w-full animate-slideUp pointer-events-auto">
          <div className={`p-4 rounded-2xl shadow-2xl border flex items-start justify-between gap-3 backdrop-blur-md ${
            toastMsg.type === 'success'
              ? 'bg-slate-900/95 text-white border-emerald-500/40'
              : toastMsg.type === 'error'
                ? 'bg-slate-900/95 text-white border-rose-500/40'
                : 'bg-slate-900/95 text-white border-blue-500/40'
          }`}>
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-xl mt-0.5 ${
                toastMsg.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
              }`}>
                {toastMsg.type === 'success' ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                ) : (
                  <AlertTriangle className="h-5 w-5 shrink-0" />
                )}
              </div>
              <div>
                <div className={`text-xs font-black uppercase tracking-wider ${
                  toastMsg.type === 'success' ? 'text-emerald-400' : 'text-rose-400'
                }`}>
                  {toastMsg.type === 'success' ? 'Operation Success' : 'Attention / Error'}
                </div>
                <div className="text-xs font-medium text-slate-200 mt-1 leading-relaxed">{toastMsg.text}</div>
              </div>
            </div>
            <button onClick={() => setToastMsg(null)} className="text-slate-400 hover:text-white text-lg font-bold p-1 leading-none">×</button>
          </div>
        </div>
      )}
    </div>
  );
}

