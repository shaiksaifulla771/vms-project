import React, { useState, useEffect } from 'react';
import api from '../services/api';
import SiteWarehouseSelector, { getStoredContext } from '../components/SiteWarehouseSelector';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import {
  Boxes, ArrowRightLeft, Sliders, History, Plus, CheckCircle2,
  AlertTriangle, RefreshCw, Clock, ArrowRight, XCircle, ShieldCheck
} from 'lucide-react';

const TABS = [
  { id: 'overview', label: '1. Stock Overview', icon: Boxes },
  { id: 'adjustments', label: '2. Stock Adjustments (Approval)', icon: Sliders },
  { id: 'transfers', label: '3. Inter-Warehouse Transfers', icon: ArrowRightLeft },
  { id: 'ledger', label: '4. Immutable Audit Ledger', icon: History },
];

const Inventory = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [context, setContext] = useState(getStoredContext());
  const [balances, setBalances] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [sites, setSites] = useState([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedWarehouseFilter, setSelectedWarehouseFilter] = useState('');

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

  const exportLedgerCSV = () => {
    if (!transactions.length) {
      alert('No ledger transactions available to export.');
      return;
    }
    const headers = ['Date,Txn Type,Material Code,Material Name,Warehouse,Quantity,Ref Doc,Created By,Approved By'];
    const rows = transactions.map(tx => [
      `"${new Date(tx.createdAt).toLocaleString()}"`,
      `"${tx.type}"`,
      `"${tx.materialId?.code || ''}"`,
      `"${tx.materialId?.name || ''}"`,
      `"${tx.warehouseId?.name || 'Warehouse'}"`,
      tx.quantity,
      `"${tx.referenceId || tx.sourceDocType || ''}"`,
      `"${tx.userId?.username || 'System'}"`,
      `"${tx.approvedBy?.username || ''}"`
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

  const fetchInventoryData = async () => {
    setLoading(true);
    try {
      const query = {};
      if (context.siteId) query.siteId = context.siteId;
      if (context.warehouseId) query.warehouseId = context.warehouseId;

      const [balRes, txRes, adjRes, trfRes, matRes, whRes, siteRes] = await Promise.all([
        api.get('/api/inventory', { params: query }),
        api.get('/api/inventory/ledger', { params: query }),
        api.get('/api/inventory/adjustments'),
        api.get('/api/transfers'),
        api.get('/api/materials'),
        api.get('/api/warehouses'),
        api.get('/api/sites')
      ]);

      setBalances(balRes.data?.data || []);
      setTransactions(txRes.data?.data || []);
      setAdjustments(adjRes.data?.data || []);
      setTransfers(trfRes.data?.data || []);

      const matList = matRes.data?.data || matRes.data?.materials || [];
      const whList = whRes.data?.warehouses || whRes.data?.data || [];
      const siteList = siteRes.data?.sites || siteRes.data?.data || [];

      setMaterials(matList);
      setWarehouses(whList);
      setSites(siteList);
    } catch (err) {
      console.error('Failed to load inventory data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventoryData();
  }, [context.siteId, context.warehouseId]);

  // Adjustments handlers
  const handleCreateAdjustment = async (e) => {
    e.preventDefault();
    try {
      const targetWh = adjForm.warehouseId || context.warehouseId;
      if (!targetWh) {
        alert('Please select a target warehouse.');
        return;
      }
      const res = await api.post('/api/inventory/adjustments', { ...adjForm, warehouseId: targetWh, siteId: context.siteId });
      if (res.data?.success) {
        setToastMsg({ type: 'success', text: `✓ Adjustment request ${res.data.data?.adjNumber || ''} submitted for manager approval.` });
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
      setToastMsg({ type: 'success', text: `✓ Stock adjustment ${adjNum} approved & inventory ledger updated.` });
      fetchInventoryData();
    } catch (err) {
      const errMsg = err.response?.data?.message || err.response?.data?.error || err.message || 'Approval failed';
      setToastMsg({ type: 'error', text: errMsg });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Transfers handlers
  const handleCreateTransfer = async (e) => {
    e.preventDefault();
    try {
      const fromWh = trfForm.fromWarehouseId || context.warehouseId;
      if (!fromWh || !trfForm.toWarehouseId) {
        alert('Please select both source and destination warehouses.');
        return;
      }
      const res = await api.post('/api/transfers', {
        ...trfForm,
        fromWarehouseId: fromWh,
        fromSiteId: context.siteId
      });
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
      setToastMsg({ type: 'success', text: `✓ Transfer ${trfNum} approved & inventory soft-reserved.` });
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
      setToastMsg({ type: 'success', text: `✓ Transfer ${trfNum} received & stock added to destination!` });
      fetchInventoryData();
    } catch (err) {
      const errMsg = err.response?.data?.message || err.response?.data?.error || err.message || 'Receipt failed';
      setToastMsg({ type: 'error', text: errMsg });
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Operating Context Selector */}
      <SiteWarehouseSelector onContextChange={setContext} />



      {/* Toast Feedback */}
      {toastMsg && (
        <div className={`p-4 rounded-xl text-xs font-bold border flex items-center justify-between shadow-sm ${
          toastMsg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
          : toastMsg.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800'
          : 'bg-blue-50 border-blue-200 text-blue-800'
        }`}>
          <div className="flex items-center space-x-2">
            {toastMsg.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
             : <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />}
            <span>{toastMsg.text}</span>
          </div>
          <button onClick={() => setToastMsg(null)} className="text-slate-400 text-sm font-bold">×</button>
        </div>
      )}

      {/* TAB BAR */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-200 bg-white rounded-t-xl px-2 pt-1 gap-2">
        <div className="flex border-b border-transparent">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-1.5 px-4 py-2.5 text-xs font-bold transition-all border-b-2 -mb-px ${
                  isActive
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center space-x-2 pb-1 pr-2">
          <Button
            size="sm"
            variant="outline"
            onClick={fetchInventoryData}
            isLoading={loading}
            className="text-xs font-bold border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh Data
          </Button>
          {activeTab === 'ledger' && (
            <Button
              size="sm"
              onClick={exportLedgerCSV}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
            >
              Export Ledger CSV
            </Button>
          )}
        </div>
      </div>

      {/* TAB 1: STOCK OVERVIEW */}
      {activeTab === 'overview' && (
        <Card className="bg-white border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100 pb-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <CardTitle className="text-xs font-bold text-slate-900 flex items-center space-x-2 uppercase tracking-wider">
                <span>PHYSICAL STOCK OVERVIEW</span>
                <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50 text-[10px]">
                  {balances.length} Stock Balances
                </Badge>
              </CardTitle>

              {/* SEARCH & FILTER CONTROLS */}
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="Search code or material..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="p-1.5 px-3 border border-slate-200 rounded-lg text-xs bg-slate-50 w-48 font-medium"
                />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="p-1.5 px-2 border border-slate-200 rounded-lg text-xs bg-slate-50 font-semibold text-slate-700"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="IN_STOCK">In Stock</option>
                  <option value="OUT_OF_STOCK">Out of Stock</option>
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="p-4">Material Code & Name</th>
                    <th className="p-4">Warehouse</th>
                    <th className="p-4">On-Hand Stock</th>
                    <th className="p-4">Reserved Stock</th>
                    <th className="p-4">Available Stock</th>
                    <th className="p-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {(() => {
                    const filteredBalances = balances.filter(item => {
                      const matCode = item.materialId?.code?.toLowerCase() || '';
                      const matName = item.materialId?.name?.toLowerCase() || '';
                      const q = searchQuery.toLowerCase();
                      const matchesSearch = matCode.includes(q) || matName.includes(q);
                      const avail = (item.balance || item.onHand || 0) - (item.reservedBalance || item.reserved || 0);
                      const matchesStatus =
                        statusFilter === 'ALL' ? true :
                        statusFilter === 'IN_STOCK' ? avail > 0 :
                        statusFilter === 'OUT_OF_STOCK' ? avail <= 0 : true;

                      return matchesSearch && matchesStatus;
                    });

                    if (filteredBalances.length === 0) {
                      return (
                        <tr>
                          <td colSpan="6" className="p-8 text-center text-slate-400 text-xs">
                            No matching stock records found.
                          </td>
                        </tr>
                      );
                    }

                    return filteredBalances.map((item) => {
                      const avail = (item.balance || item.onHand || 0) - (item.reservedBalance || item.reserved || 0);
                      return (
                        <tr key={item._id} className="hover:bg-slate-50">
                          <td className="p-4">
                            <span className="font-mono font-bold text-blue-600 block">{item.materialId?.code}</span>
                            <span className="font-bold text-slate-900">{item.materialId?.name}</span>
                          </td>
                          <td className="p-4 text-slate-700">{item.warehouseId?.name || 'Warehouse'}</td>
                          <td className="p-4 font-mono font-bold text-slate-900">{item.balance || item.onHand || 0} {item.materialId?.unit}</td>
                          <td className="p-4 font-mono font-bold text-amber-600">{item.reservedBalance || item.reserved || 0} {item.materialId?.unit}</td>
                          <td className="p-4 font-mono font-bold text-emerald-600">{avail} {item.materialId?.unit}</td>
                          <td className="p-4 text-center">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                              avail > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}>
                              {avail > 0 ? 'In Stock' : 'Out of Stock'}
                            </span>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* TAB 2: STOCK ADJUSTMENTS */}
      {activeTab === 'adjustments' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Stock Adjustment Requests</h3>
              <p className="text-[11px] text-slate-500 font-medium">Requires manager approval before modifying inventory balance.</p>
            </div>
            <Button size="sm" onClick={() => setIsAdjModalOpen(true)} className="bg-blue-600 text-white font-bold">
              <Plus className="h-4 w-4 mr-1" /> New Adjustment Request
            </Button>
          </div>

          <Card className="bg-white border-slate-200 shadow-sm">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="p-4">Adj Code</th>
                      <th className="p-4">Material</th>
                      <th className="p-4">Warehouse</th>
                      <th className="p-4">Type & Qty</th>
                      <th className="p-4">Reason & Description</th>
                      <th className="p-4">Created By</th>
                      <th className="p-4 text-center">Status</th>
                      <th className="p-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {adjustments.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="p-8 text-center text-slate-400 text-xs">No adjustment records found.</td>
                      </tr>
                    ) : (
                      adjustments.map((adj) => (
                        <tr key={adj._id} className="hover:bg-slate-50">
                          <td className="p-4 font-mono font-bold text-blue-600">{adj.adjNumber}</td>
                          <td className="p-4 font-bold text-slate-900">{adj.materialId?.name}</td>
                          <td className="p-4 text-slate-700">{adj.warehouseId?.name}</td>
                          <td className={`p-4 font-mono font-bold ${adj.adjustmentType === 'IN' ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {adj.adjustmentType === 'IN' ? '+' : '-'}{adj.quantity}
                          </td>
                          <td className="p-4 text-slate-600">{adj.reason}</td>
                          <td className="p-4 font-mono text-slate-500">{adj.createdBy?.username || 'User'}</td>
                          <td className="p-4 text-center">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                              adj.status === 'Approved' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : adj.status === 'Rejected' ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}>
                              {adj.status}
                            </span>
                          </td>
                          <td className="p-4 text-right">
                            {adj.status === 'Pending Approval' && (
                              <Button
                                size="sm"
                                isLoading={actionLoadingId === adj._id}
                                onClick={() => handleApproveAdjustment(adj._id, adj.adjNumber)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
                              >
                                Approve
                              </Button>
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
        </div>
      )}

      {/* TAB 3: STOCK TRANSFERS */}
      {activeTab === 'transfers' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Inter-Warehouse Transfers</h3>
              <p className="text-[11px] text-slate-500 font-medium">Approval → Dispatch (In Transit) → Receive into Destination</p>
            </div>
            <Button size="sm" onClick={() => setIsTrfModalOpen(true)} className="bg-purple-600 text-white font-bold">
              <Plus className="h-4 w-4 mr-1" /> New Transfer Request
            </Button>
          </div>

          <Card className="bg-white border-slate-200 shadow-sm">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="p-4">Transfer Code</th>
                      <th className="p-4">Material</th>
                      <th className="p-4">Source → Destination</th>
                      <th className="p-4">Quantity</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {transfers.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="p-8 text-center text-slate-400 text-xs">No stock transfer records found.</td>
                      </tr>
                    ) : (
                      transfers.map((trf) => (
                        <tr key={trf._id} className="hover:bg-slate-50">
                          <td className="p-4 font-mono font-bold text-purple-600">{trf.transferNumber}</td>
                          <td className="p-4 font-bold text-slate-900">{trf.materialId?.name}</td>
                          <td className="p-4 text-slate-700">{trf.fromWarehouseId?.name} → {trf.toWarehouseId?.name}</td>
                          <td className="p-4 font-mono font-bold text-blue-600">{trf.quantity} {trf.materialId?.unit}</td>
                          <td className="p-4">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                              trf.status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : trf.status === 'In Transit' ? 'bg-purple-50 text-purple-700 border border-purple-200'
                              : trf.status === 'Approved' ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}>
                              {trf.status}
                            </span>
                          </td>
                          <td className="p-4 text-right space-x-2">
                            {trf.status === 'Pending Approval' && (
                              <Button size="sm" onClick={() => handleApproveTransfer(trf._id, trf.transferNumber)} className="bg-emerald-600 text-white font-bold text-xs">Approve</Button>
                            )}
                            {trf.status === 'Approved' && (
                              <Button size="sm" onClick={() => handleDispatchTransfer(trf._id, trf.transferNumber)} className="bg-purple-600 text-white font-bold text-xs">Dispatch (In Transit)</Button>
                            )}
                            {trf.status === 'In Transit' && (
                              <Button size="sm" onClick={() => handleReceiveTransfer(trf._id, trf.transferNumber)} className="bg-emerald-600 text-white font-bold text-xs">Receive Stock</Button>
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
        </div>
      )}

      {/* TAB 4: IMMUTABLE AUDIT LEDGER */}
      {activeTab === 'ledger' && (
        <Card className="bg-white border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100 pb-4">
            <CardTitle className="text-xs font-bold text-slate-900 flex items-center justify-between uppercase tracking-wider">
              <span>IMMUTABLE INVENTORY TRANSACTION LEDGER</span>
              <Badge variant="outline" className="border-slate-200 text-slate-700 bg-slate-50 text-[10px]">
                {transactions.length} Audit Entries
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="p-4">Date & Time</th>
                    <th className="p-4">Txn Type</th>
                    <th className="p-4">Material</th>
                    <th className="p-4">Warehouse</th>
                    <th className="p-4">Quantity</th>
                    <th className="p-4">Ref Doc</th>
                    <th className="p-4">Created By</th>
                    <th className="p-4">Approved By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="p-8 text-center text-slate-400 text-xs">No transaction ledger records found.</td>
                    </tr>
                  ) : (
                    transactions.map((tx) => (
                      <tr key={tx._id} className="hover:bg-slate-50">
                        <td className="p-4 font-mono text-slate-500">{new Date(tx.createdAt).toLocaleString()}</td>
                        <td className="p-4">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-200 font-mono">
                            {tx.type}
                          </span>
                        </td>
                        <td className="p-4 font-bold text-slate-900">{tx.materialId?.name}</td>
                        <td className="p-4 text-slate-700">{tx.warehouseId?.name || 'Warehouse'}</td>
                        <td className={`p-4 font-mono font-bold ${tx.quantity > 0 ? 'text-emerald-600' : 'text-slate-700'}`}>
                          {tx.quantity}
                        </td>
                        <td className="p-4 font-mono text-blue-600">{tx.referenceId || tx.sourceDocType || '—'}</td>
                        <td className="p-4 font-mono text-slate-500">{tx.userId?.username || 'System'}</td>
                        <td className="p-4 font-mono text-emerald-600">{tx.approvedBy?.username || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Adjustment Request Modal */}
      {isAdjModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-sm font-extrabold text-slate-900">New Stock Adjustment Request</h3>
              <button onClick={() => setIsAdjModalOpen(false)} className="text-slate-400 text-base font-bold">×</button>
            </div>
            <form onSubmit={handleCreateAdjustment} className="space-y-3 text-xs">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Select Material *</label>
                <select
                  value={adjForm.materialId}
                  onChange={(e) => setAdjForm({ ...adjForm, materialId: e.target.value })}
                  required
                  className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50"
                >
                  <option value="">-- Select Material --</option>
                  {materials.map(m => <option key={m._id} value={m._id}>{m.code} - {m.name} ({m.unit || 'units'})</option>)}
                </select>
                {adjForm.materialId && (() => {
                  const selMat = materials.find(m => m._id === adjForm.materialId);
                  const selBal = balances.find(b => (b.materialId?._id || b.materialId) === adjForm.materialId);
                  return (
                    <div className="mt-1 text-[10px] text-slate-500 flex items-center justify-between font-mono bg-slate-50 p-1.5 rounded border border-slate-200">
                      <span>UOM: <strong className="text-slate-800">{selMat?.unit || 'pcs'}</strong></span>
                      <span>Category: <strong className="text-slate-800">{selMat?.type || 'Raw'}</strong></span>
                      <span>On-Hand Stock: <strong className="text-blue-600 font-bold">{selBal?.quantity || selBal?.onHandQuantity || 0}</strong></span>
                    </div>
                  );
                })()}
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] font-bold uppercase text-slate-500">Adjustment Action *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjForm({ ...adjForm, adjustmentType: 'IN' })}
                    className={`py-2 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all border ${
                      adjForm.adjustmentType === 'IN'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-sm font-extrabold">+</span> Stock Addition (Increment)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjForm({ ...adjForm, adjustmentType: 'OUT' })}
                    className={`py-2 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all border ${
                      adjForm.adjustmentType === 'OUT'
                        ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-sm font-extrabold">-</span> Stock Deduction (Decrement)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Adjustment Quantity *</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={adjForm.quantity}
                    onChange={(e) => setAdjForm({ ...adjForm, quantity: Math.abs(parseFloat(e.target.value) || 0) })}
                    required
                    className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50 font-mono text-sm font-bold"
                  />
                  {/* Quick Preset Buttons */}
                  <div className="flex items-center gap-1">
                    {[10, 50, 100].map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setAdjForm({ ...adjForm, quantity: q })}
                        className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[10px] font-mono font-bold"
                      >
                        {adjForm.adjustmentType === 'IN' ? `+${q}` : `-${q}`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Reason / Justification *</label>
                <input
                  type="text"
                  value={adjForm.reason}
                  onChange={(e) => setAdjForm({ ...adjForm, reason: e.target.value })}
                  required
                  className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50 text-xs mb-1.5"
                  placeholder="e.g. Physical recount discrepancy"
                />
                <div className="flex flex-wrap gap-1">
                  {['Physical Audit Recount', 'Damage Write-off', 'Found Excess Stock', 'Vendor Return', 'Production Scrap'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAdjForm({ ...adjForm, reason: preset })}
                      className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded text-[9px] font-medium"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-2 bg-slate-50 rounded-lg border border-slate-200 text-[10px] text-slate-500 flex items-center justify-between">
                <span>Requested By: <strong className="text-slate-800 font-bold">System Admin (Operator)</strong></span>
                <span className="font-mono text-emerald-700 font-bold">Audit Logging Enabled</span>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <Button variant="outline" size="sm" type="button" onClick={() => setIsAdjModalOpen(false)}>Cancel</Button>
                <Button size="sm" type="submit" className={adjForm.adjustmentType === 'IN' ? 'bg-emerald-600 hover:bg-emerald-700 text-white font-bold' : 'bg-rose-600 hover:bg-rose-700 text-white font-bold'}>
                  {adjForm.adjustmentType === 'IN' ? '+ Submit Stock Addition' : '- Submit Stock Deduction'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transfer Request Modal */}
      {isTrfModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-sm font-extrabold text-slate-900">New Inter-Warehouse Transfer</h3>
              <button onClick={() => setIsTrfModalOpen(false)} className="text-slate-400 text-base font-bold">×</button>
            </div>
            <form onSubmit={handleCreateTransfer} className="space-y-3 text-xs">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Select Material *</label>
                <select
                  value={trfForm.materialId}
                  onChange={(e) => setTrfForm({ ...trfForm, materialId: e.target.value })}
                  required
                  className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50"
                >
                  <option value="">-- Select Material --</option>
                  {materials.map(m => <option key={m._id} value={m._id}>{m.code} - {m.name} ({m.unit || 'units'})</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Source Warehouse *</label>
                  <select
                    value={trfForm.fromWarehouseId || context.warehouseId || ''}
                    onChange={(e) => setTrfForm({ ...trfForm, fromWarehouseId: e.target.value })}
                    required
                    className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50"
                  >
                    <option value="">-- Select Source --</option>
                    {warehouses.map(w => <option key={w._id} value={w._id}>{w.name} ({w.code})</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Destination Warehouse *</label>
                  <select
                    value={trfForm.toWarehouseId}
                    onChange={(e) => setTrfForm({ ...trfForm, toWarehouseId: e.target.value })}
                    required
                    className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50"
                  >
                    <option value="">-- Select Destination --</option>
                    {warehouses
                      .filter(w => w._id !== (trfForm.fromWarehouseId || context.warehouseId))
                      .map(w => <option key={w._id} value={w._id}>{w.name} ({w.code})</option>)}
                  </select>
                </div>
              </div>

              {trfForm.materialId && (
                <div className="p-2 bg-purple-50 rounded-lg border border-purple-200 text-[10px] text-purple-900 flex items-center justify-between font-mono">
                  <span>Selected Material: <strong className="text-purple-950 font-bold">{materials.find(m => m._id === trfForm.materialId)?.name}</strong></span>
                  <span>UOM: <strong className="font-bold">{materials.find(m => m._id === trfForm.materialId)?.unit || 'units'}</strong></span>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Transfer Quantity *</label>
                <input
                  type="number"
                  value={trfForm.quantity}
                  onChange={(e) => setTrfForm({ ...trfForm, quantity: Math.abs(parseFloat(e.target.value) || 0) })}
                  required
                  min="0.01"
                  step="any"
                  className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50 font-mono text-sm font-bold text-purple-900"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Reason / Notes *</label>
                <input
                  type="text"
                  value={trfForm.reason}
                  onChange={(e) => setTrfForm({ ...trfForm, reason: e.target.value })}
                  required
                  className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50"
                  placeholder="e.g. Stock rebalancing across sites"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <Button variant="outline" size="sm" type="button" onClick={() => setIsTrfModalOpen(false)}>Cancel</Button>
                <Button size="sm" type="submit" className="bg-purple-600 hover:bg-purple-700 text-white font-bold">Request Transfer</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
