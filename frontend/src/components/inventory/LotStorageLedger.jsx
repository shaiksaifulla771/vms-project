import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../../services/api';
import { useSiteContext } from '../../context/SiteContext';
import * as XLSX from 'xlsx';
import {
  Layers,
  Search,
  RefreshCw,
  Plus,
  Minus,
  Download,
  Calendar,
  Building2,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Filter,
  FileSpreadsheet,
  Clock,
  Boxes
  Boxes,
  ArrowRightLeft,
  Edit3,
  Sliders
} from 'lucide-react';

export default function LotStorageLedger({ onRefreshParent }) {
  const { sites, warehouses, activeSiteId, activeWarehouseId } = useSiteContext();

  const [aggregates, setAggregates] = useState([]);
  const [lots, setLots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRows, setExpandedRows] = useState({});
  const [viewMode, setViewMode] = useState('AGGREGATE'); // 'AGGREGATE' | 'GRANULAR'
  const [toastMsg, setToastMsg] = useState(null);

  // Inward / Outward Modals
  const [isInwardModalOpen, setIsInwardModalOpen] = useState(false);
  const [isOutwardModalOpen, setIsOutwardModalOpen] = useState(false);
  const [submittingAction, setSubmittingAction] = useState(false);

  // Materials & Vendors Masters
  const [materialsList, setMaterialsList] = useState([]);
  const [vendorsList, setVendorsList] = useState([]);

  // Inward Form State
  const [inwardForm, setInwardForm] = useState({
    materialId: '',
    vendorId: '',
    mpnId: '',
    siteId: '',
    warehouseId: '',
    lotNumber: '',
    mfgDate: new Date().toISOString().slice(0, 10),
    expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    quantity: '',
    unitCost: 0,
    referenceDoc: ''
  });

  // Outward Form State
  const [outwardForm, setOutwardForm] = useState({
    materialId: '',
    siteId: '',
    warehouseId: '',
    lotNumber: '',
    quantity: '',
    reason: 'Production Issue',
    referenceDoc: ''
  });
  const [availableLotsForMaterial, setAvailableLotsForMaterial] = useState([]);
  const [loadingLots, setLoadingLots] = useState(false);

  // Transfer Form State
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferForm, setTransferForm] = useState({
    materialId: '',
    fromWarehouseId: '',
    toWarehouseId: '',
    lotNumber: '',
    quantity: '',
    reason: 'Inter-warehouse replenishment',
    notes: ''
  });

  // Edit / Reconcile Lot State
  const [isEditLotModalOpen, setIsEditLotModalOpen] = useState(false);
  const [editLotForm, setEditLotForm] = useState({
    materialId: '',
    materialName: '',
    warehouseId: '',
    warehouseName: '',
    lotNumber: '',
    onHand: 0,
    available: 0,
    newQuantity: '',
    newExpiryDate: '',
    newMfgDate: '',
    reason: 'Physical count discrepancy',
    notes: ''
  });

  // Fetch Lot Storage Ledger from API
  const fetchLedger = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (activeWarehouseId && activeWarehouseId !== 'all') {
        params.warehouseId = activeWarehouseId;
      } else if (activeSiteId) {
        params.siteId = activeSiteId;
      }

      const res = await api.get('/api/inventory/lot-ledger', { params });
      if (res.data?.success) {
        setAggregates(res.data.aggregates || []);
        setLots(res.data.lots || []);
      }
    } catch (err) {
      console.error('Failed to load lot storage ledger:', err);
      setToastMsg({ type: 'error', text: 'Failed to fetch lot storage ledger' });
    } finally {
      setLoading(false);
    }
  }, [activeSiteId, activeWarehouseId]);

  // Fetch Masters for Modals
  useEffect(() => {
    const fetchMasters = async () => {
      try {
        const [matRes, venRes] = await Promise.all([
          api.get('/api/materials').catch(() => ({ data: { data: [] } })),
          api.get('/api/vendors').catch(() => ({ data: { data: [] } })),
        ]);
        setMaterialsList(matRes.data?.data || matRes.data?.materials || []);
        setVendorsList(venRes.data?.data || venRes.data?.vendors || []);
      } catch (e) {
        console.error('Failed to load masters:', e);
      }
    };
    fetchMasters();
  }, []);

  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

  // Toggle Row Expansion
  const toggleRow = (key) => {
    setExpandedRows(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Filtered Aggregates
  const filteredAggregates = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return aggregates;
    return aggregates.filter(row => 
      (row.material || '').toLowerCase().includes(q) ||
      (row.mpn || '').toLowerCase().includes(q) ||
      (row.vendor || '').toLowerCase().includes(q) ||
      (row.classification || '').toLowerCase().includes(q)
    );
  }, [aggregates, searchQuery]);

  // Filtered Granular Lots
  const filteredGranularLots = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return lots;
    return lots.filter(lot =>
      (lot.material || '').toLowerCase().includes(q) ||
      (lot.mpn || '').toLowerCase().includes(q) ||
      (lot.lotNo || '').toLowerCase().includes(q) ||
      (lot.vendor || '').toLowerCase().includes(q) ||
      (lot.location || '').toLowerCase().includes(q) ||
      (lot.wh || '').toLowerCase().includes(q)
    );
  }, [lots, searchQuery]);

  // Metrics
  const metrics = useMemo(() => {
    const totalLots = lots.length;
    const totalQty = lots.reduce((acc, l) => acc + (l.qty || 0), 0);
    const expiringSoon = lots.filter(l => {
      if (!l.expDate) return false;
      const diffDays = (new Date(l.expDate) - new Date()) / (1000 * 60 * 60 * 24);
      return diffDays <= 60 && diffDays >= 0;
    }).length;
    return { totalLots, totalQty, expiringSoon };
  }, [lots]);

  // Open Inward Modal with auto-defaulted site & WH (Section 10)
  const openInwardModal = () => {
    const defaultSite = activeSiteId || (sites[0]?._id || '');
    const targetSiteObj = sites.find(s => s._id === defaultSite);
    const defaultWh = targetSiteObj?.defaultWarehouse?._id || 
      warehouses.find(w => (w.siteId?._id || w.siteId) === defaultSite && w.isDefault)?._id || 
      warehouses.find(w => (w.siteId?._id || w.siteId) === defaultSite)?._id || '';

    setInwardForm({
      materialId: materialsList[0]?._id || '',
      vendorId: vendorsList[0]?._id || '',
      mpnId: '',
      siteId: defaultSite,
      warehouseId: defaultWh,
      lotNumber: `LOT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-4)}`,
      mfgDate: new Date().toISOString().slice(0, 10),
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      quantity: '',
      unitCost: 0,
      referenceDoc: ''
    });
    setIsInwardModalOpen(true);
  };

  // Open Outward Modal
  const openOutwardModal = () => {
    const defaultSite = activeSiteId || (sites[0]?._id || '');
    const defaultWh = activeWarehouseId && activeWarehouseId !== 'all' ? activeWarehouseId : '';
    const initialMatId = materialsList[0]?._id || '';

    setOutwardForm({
      materialId: initialMatId,
      siteId: defaultSite,
      warehouseId: defaultWh,
      lotNumber: '',
      quantity: '',
      reason: 'Production Issue',
      referenceDoc: ''
    });
    setIsOutwardModalOpen(true);
    if (initialMatId) {
      loadLotsForMaterial(initialMatId);
    }
  };

  // Fetch FIFO sorted lots for material
  const loadLotsForMaterial = async (matId) => {
    setLoadingLots(true);
    try {
      const res = await api.get(`/api/inventory/lots-for-material/${matId}`);
      if (res.data?.success) {
        const available = (res.data.data || []).filter(l => (l.available || l.balance || 0) > 0);
        setAvailableLotsForMaterial(available);
        if (available.length > 0) {
          setOutwardForm(prev => ({ ...prev, lotNumber: available[0].lotNumber || available[0].batchNumber }));
        }
      }
    } catch (err) {
      console.error('Failed to load lots for material:', err);
    } finally {
      setLoadingLots(false);
    }
  };

  // Submit Inward (POST /api/inventory/inward)
  const handleInwardSubmit = async (e) => {
    e.preventDefault();
    if (!inwardForm.materialId || !inwardForm.lotNumber || Number(inwardForm.quantity) <= 0) {
      setToastMsg({ type: 'error', text: 'Material, Lot Number, and positive Quantity are required.' });
      return;
    }

    setSubmittingAction(true);
    try {
      const res = await api.post('/api/inventory/inward', {
        materialId: inwardForm.materialId,
        vendorId: inwardForm.vendorId || undefined,
        siteId: inwardForm.siteId || undefined,
        warehouseId: inwardForm.warehouseId || undefined,
        lotNumber: inwardForm.lotNumber.trim(),
        mfgDate: inwardForm.mfgDate,
        expiryDate: inwardForm.expiryDate,
        quantity: Number(inwardForm.quantity),
        unitCost: Number(inwardForm.unitCost || 0),
        referenceDoc: inwardForm.referenceDoc || undefined
      });

      if (res.data?.success) {
        setToastMsg({ type: 'success', text: `✓ Inward GRN recorded! Lot ${inwardForm.lotNumber} added to stock.` });
        setIsInwardModalOpen(false);
        fetchLedger();
        if (onRefreshParent) onRefreshParent();
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.message || err.message || 'Inward failed';
      setToastMsg({ type: 'error', text: msg });
    } finally {
      setSubmittingAction(false);
    }
  };

  // Submit Outward (POST /api/inventory/outward)
  const handleOutwardSubmit = async (e) => {
    e.preventDefault();
    if (!outwardForm.materialId || !outwardForm.lotNumber || Number(outwardForm.quantity) <= 0) {
      setToastMsg({ type: 'error', text: 'Material, mandatory Lot selection, and positive Quantity are required.' });
      return;
    }

    setSubmittingAction(true);
    try {
      const res = await api.post('/api/inventory/outward', {
        materialId: outwardForm.materialId,
        siteId: outwardForm.siteId || undefined,
        warehouseId: outwardForm.warehouseId || undefined,
        lotNumber: outwardForm.lotNumber,
        quantity: Number(outwardForm.quantity),
        reason: outwardForm.reason,
        referenceDoc: outwardForm.referenceDoc || undefined
      });

      if (res.data?.success) {
        setToastMsg({ type: 'success', text: `✓ Outward issue recorded! Stock deducted from Lot ${outwardForm.lotNumber}.` });
        setIsOutwardModalOpen(false);
        fetchLedger();
        if (onRefreshParent) onRefreshParent();
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.message || err.message || 'Outward failed';
      setToastMsg({ type: 'error', text: msg });
    } finally {
      setSubmittingAction(false);
    }
  };

  // Open Transfer Modal
  const openTransferModal = (lot = null) => {
    let matId = '';
    if (lot?.materialId) {
      matId = lot.materialId._id || lot.materialId;
    } else if (lot?.material) {
      const foundMat = materialsList.find(m => m.name === lot.material);
      if (foundMat) matId = foundMat._id;
    }
    if (!matId) matId = materialsList[0]?._id || '';

    let originWh = '';
    if (lot?.warehouseId) {
      originWh = lot.warehouseId._id || lot.warehouseId;
    } else if (lot?.wh) {
      const foundWh = warehouses.find(w => w.name === lot.wh || w.code === lot.wh);
      if (foundWh) originWh = foundWh._id;
    }
    if (!originWh) originWh = activeWarehouseId || warehouses[0]?._id || '';

    const destWh = warehouses.find(w => w._id !== originWh)?._id || '';

    setTransferForm({
      materialId: matId,
      fromWarehouseId: originWh,
      toWarehouseId: destWh,
      lotNumber: lot?.lotNo || lot?.lotNumber || '',
      quantity: '',
      reason: 'Inter-warehouse replenishment',
      notes: ''
    });
    setIsTransferModalOpen(true);
    if (matId) loadLotsForMaterial(matId);
  };

  // Submit Transfer (POST /api/inventory/transfer)
  const handleTransferSubmit = async (e) => {
    e.preventDefault();
    if (!transferForm.materialId || !transferForm.lotNumber || !transferForm.fromWarehouseId || !transferForm.toWarehouseId || Number(transferForm.quantity) <= 0) {
      setToastMsg({ type: 'error', text: 'Please fill in all transfer fields with positive quantity.' });
      return;
    }
    if (transferForm.fromWarehouseId === transferForm.toWarehouseId) {
      setToastMsg({ type: 'error', text: 'Source and Destination warehouses must be different.' });
      return;
    }

    setSubmittingAction(true);
    try {
      const res = await api.post('/api/inventory/transfer', {
        materialId: transferForm.materialId,
        fromWarehouseId: transferForm.fromWarehouseId,
        toWarehouseId: transferForm.toWarehouseId,
        lotNumber: transferForm.lotNumber,
        quantity: Number(transferForm.quantity),
        reason: transferForm.reason,
        notes: transferForm.notes
      });
      if (res.data?.success) {
        setToastMsg({ type: 'success', text: `✓ ${res.data.message}` });
        setIsTransferModalOpen(false);
        fetchLedger();
        if (onRefreshParent) onRefreshParent();
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.message || err.message || 'Transfer failed';
      setToastMsg({ type: 'error', text: msg });
    } finally {
      setSubmittingAction(false);
    }
  };

  // Open Edit / Reconcile Lot Modal
  const openEditLotModal = (lot) => {
    let matId = '';
    if (lot?.materialId) {
      matId = lot.materialId._id || lot.materialId;
    } else if (lot?.material) {
      const foundMat = materialsList.find(m => m.name === lot.material);
      if (foundMat) matId = foundMat._id;
    }
    if (!matId) matId = materialsList[0]?._id || '';

    let whId = '';
    if (lot?.warehouseId) {
      whId = lot.warehouseId._id || lot.warehouseId;
    } else if (lot?.wh) {
      const foundWh = warehouses.find(w => w.name === lot.wh || w.code === lot.wh);
      if (foundWh) whId = foundWh._id;
    }
    if (!whId) whId = activeWarehouseId || warehouses[0]?._id || '';

    setEditLotForm({
      materialId: matId,
      materialName: lot.material || 'Material',
      warehouseId: whId,
      warehouseName: lot.wh || 'Warehouse',
      lotNumber: lot.lotNo || lot.lotNumber,
      onHand: lot.qty || lot.onHand || 0,
      available: lot.available || 0,
      newQuantity: lot.qty || lot.onHand || 0,
      newExpiryDate: lot.expDate ? new Date(lot.expDate).toISOString().slice(0, 10) : '',
      newMfgDate: lot.mfgDate ? new Date(lot.mfgDate).toISOString().slice(0, 10) : '',
      reason: 'Physical count reconciliation',
      notes: ''
    });
    setIsEditLotModalOpen(true);
  };

  // Submit Edit Lot (POST /api/inventory/adjust-lot)
  const handleEditLotSubmit = async (e) => {
    e.preventDefault();
    if (!editLotForm.materialId || !editLotForm.lotNumber || !editLotForm.warehouseId) {
      setToastMsg({ type: 'error', text: 'Lot details are incomplete.' });
      return;
    }

    setSubmittingAction(true);
    try {
      const res = await api.post('/api/inventory/adjust-lot', {
        materialId: editLotForm.materialId,
        warehouseId: editLotForm.warehouseId,
        lotNumber: editLotForm.lotNumber,
        newQuantity: Number(editLotForm.newQuantity),
        newExpiryDate: editLotForm.newExpiryDate || undefined,
        newMfgDate: editLotForm.newMfgDate || undefined,
        reason: editLotForm.reason,
        notes: editLotForm.notes
      });
      if (res.data?.success) {
        setToastMsg({ type: 'success', text: `✓ Lot ${editLotForm.lotNumber} reconciled & updated successfully!` });
        setIsEditLotModalOpen(false);
        fetchLedger();
        if (onRefreshParent) onRefreshParent();
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.message || err.message || 'Update failed';
      setToastMsg({ type: 'error', text: msg });
    } finally {
      setSubmittingAction(false);
    }
  };

  // Export to Excel
  const exportToExcel = () => {
    const exportData = lots.map(l => ({
      'MPN': l.mpn,
      'Classification': l.classification,
      'Material Name': l.material,
      'Primary Vendor': l.vendor,
      'Location / Site': l.location,
      'Warehouse': l.wh,
      'Lot Number': l.lotNo,
      'Expiry Date': l.expDate ? new Date(l.expDate).toLocaleDateString() : 'N/A',
      'Available Qty': l.available,
      'Total Qty': l.qty,
      'UOM': l.uom
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Lot_Storage_Ledger');
    XLSX.writeFile(wb, `Lot_Storage_Ledger_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-3">
      {/* TOAST ALERT */}
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

      {/* METRICS STRIP */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Total Active Lots</span>
            <div className="text-xl font-black text-slate-900">{metrics.totalLots} <span className="text-xs font-semibold text-slate-500">Tracked Batches</span></div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Active Lots</span>
            <div className="text-xl font-black text-slate-900">{metrics.totalLots} <span className="text-xs font-semibold text-slate-500">Lots</span></div>
          </div>
          <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Total Ledger Stock</span>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Total Stock</span>
            <div className="text-xl font-black text-slate-900">{metrics.totalQty.toLocaleString()} <span className="text-xs font-semibold text-slate-500">Units</span></div>
          </div>
          <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
            <Boxes className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Lots Expiring (60 Days)</span>
            <div className="text-xl font-black text-amber-600">{metrics.expiringSoon} <span className="text-xs font-semibold text-slate-500">FIFO Alert</span></div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Expiring Soon</span>
            <div className="text-xl font-black text-amber-600">{metrics.expiringSoon} <span className="text-xs font-semibold text-slate-500">Within 60d</span></div>
          </div>
          <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
            <Clock className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* CONTROL RIBBON */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Material, MPN, Vendor, Lot #..."
              className="w-full pl-8 pr-2.5 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 font-medium"
            />
          </div>

          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg text-[11px] font-bold">
            <button
              onClick={() => setViewMode('AGGREGATE')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                viewMode === 'AGGREGATE' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Aggregated View
              By Item
            </button>
            <button
              onClick={() => setViewMode('GRANULAR')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                viewMode === 'GRANULAR' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Granular (Sheet 2)
              By Lot
            </button>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={fetchLedger}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
            title="Refresh Ledger"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={exportToExcel}
            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg border border-slate-200 flex items-center space-x-1 transition-colors"
            title="Export Sheet 2 to Excel"
            title="Export to Excel"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Excel</span>
            <span>Excel</span>
          </button>

          <button
            onClick={() => openTransferModal()}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg flex items-center space-x-1 shadow-2xs transition-colors"
            title="Inter-Warehouse Stock Transfer"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span>⇄ Transfer</span>
          </button>

          <button
            onClick={openOutwardModal}
            className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg flex items-center space-x-1 shadow-2xs transition-colors"
            title="Issue / Dispatch Stock (FIFO Lot Selection)"
          >
            <Minus className="w-3.5 h-3.5" />
            <span>- Outward Stock</span>
            <span>- Dispatch</span>
          </button>

          <button
            onClick={openInwardModal}
            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center space-x-1 shadow-2xs transition-colors"
            title="Receive / Inward Stock with Lot #"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Inward Stock</span>
            <span>+ Inward</span>
          </button>
        </div>
      </div>

      {/* SHEET 2: LOT STORAGE LEDGER TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto max-h-[68vh]">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 sticky top-0 z-10">
              <tr>
                {viewMode === 'AGGREGATE' && <th className="p-2 w-8"></th>}
                <th className="p-2.5 uppercase text-[10px] tracking-wider">MPN</th>
                <th className="p-2.5 uppercase text-[10px] tracking-wider">Classification</th>
                <th className="p-2.5 uppercase text-[10px] tracking-wider">Material</th>
                <th className="p-2.5 uppercase text-[10px] tracking-wider">Vendor</th>
                <th className="p-2.5 uppercase text-[10px] tracking-wider">Location</th>
                <th className="p-2.5 uppercase text-[10px] tracking-wider">WH</th>
                {viewMode === 'GRANULAR' ? (
                  <>
                    <th className="p-2.5 uppercase text-[10px] tracking-wider">Lot No</th>
                    <th className="p-2.5 uppercase text-[10px] tracking-wider">Exp Date</th>
                    <th className="p-2.5 uppercase text-[10px] tracking-wider text-right">Available Qty</th>
                    <th className="p-2.5 uppercase text-[10px] tracking-wider text-center">Actions</th>
                  </>
                ) : (
                  <>
                    <th className="p-2.5 uppercase text-[10px] tracking-wider text-center">Lot Count</th>
                    <th className="p-2.5 uppercase text-[10px] tracking-wider text-right">Total Qty</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {viewMode === 'AGGREGATE' ? (
                // AGGREGATE VIEW WITH EXPANDABLE LOTS
                filteredAggregates.map((row, idx) => {
                  const rowKey = `${row.materialId}-${idx}`;
                  const isExpanded = !!expandedRows[rowKey];
                  return (
                    <React.Fragment key={rowKey}>
                      <tr className="hover:bg-blue-50/40 transition-colors cursor-pointer" onClick={() => toggleRow(rowKey)}>
                        <td className="p-2 text-center text-slate-400">
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-blue-600" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </td>
                        <td className="p-2.5 font-mono font-bold text-blue-700">{row.mpn}</td>
                        <td className="p-2.5">
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-semibold">
                            {row.classification}
                          </span>
                        </td>
                        <td className="p-2.5 font-bold text-slate-900">{row.material}</td>
                        <td className="p-2.5 text-slate-600">{row.vendor}</td>
                        <td className="p-2.5">{row.location}</td>
                        <td className="p-2.5 font-mono text-[11px]">{row.wh}</td>
                        <td className="p-2.5 text-center font-bold text-blue-600">
                          <span className="px-2 py-0.5 bg-blue-50 border border-blue-200 rounded-full text-[10px]">
                            {row.lotCount} lots
                          </span>
                        </td>
                        <td className="p-2.5 text-right font-mono font-black text-slate-900">
                          {row.totalQty.toLocaleString()} {row.uom}
                        </td>
                      </tr>

                      {/* EXPANDED GRANULAR LOT SUB-ROWS */}
                      {isExpanded && row.lots && row.lots.length > 0 && (
                        <tr className="bg-slate-50/80">
                          <td colSpan={9} className="p-2.5 pl-10">
                          <td colSpan={10} className="p-2.5 pl-10">
                            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                              <table className="w-full text-left text-[11px]">
                                <thead className="bg-slate-100 text-slate-500 font-bold border-b border-slate-200">
                                  <tr>
                                    <th className="p-2 font-mono">Lot Number</th>
                                    <th className="p-2">Warehouse</th>
                                    <th className="p-2">Expiry Date</th>
                                    <th className="p-2 text-right">Available Qty</th>
                                    <th className="p-2 text-right">Total Qty</th>
                                    <th className="p-2 text-center">Actions</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 font-medium">
                                  {row.lots.map((lt, lIdx) => (
                                    <tr key={lIdx} className="hover:bg-slate-50">
                                      <td className="p-2 font-mono font-bold text-slate-900">{lt.lotNo}</td>
                                      <td className="p-2 font-mono text-slate-600">{lt.wh}</td>
                                      <td className="p-2 text-slate-600">
                                        {lt.expDate ? new Date(lt.expDate).toLocaleDateString() : 'N/A'}
                                      </td>
                                      <td className="p-2 text-right font-mono font-black text-emerald-700">
                                        {lt.available.toLocaleString()} {lt.uom}
                                      </td>
                                      <td className="p-2 text-right font-mono text-slate-600">
                                        {lt.qty.toLocaleString()} {lt.uom}
                                      </td>
                                      <td className="p-2 text-center">
                                        <div className="flex items-center justify-center space-x-1">
                                          <button
                                            onClick={(e) => { e.stopPropagation(); openTransferModal({ ...lt, material: row.material, materialId: row.materialId }); }}
                                            className="px-2 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded text-[10px] font-bold transition-colors"
                                            title="Transfer to another warehouse"
                                          >
                                            ⇄ Move
                                          </button>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); openEditLotModal({ ...lt, material: row.material, materialId: row.materialId }); }}
                                            className="px-2 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded text-[10px] font-bold transition-colors"
                                            title="Edit Lot / Reconcile Stock"
                                          >
                                            ✏ Edit
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              ) : (
                // GRANULAR FLAT VIEW (EXACT 9 COLUMNS OF SHEET 2)
                // GRANULAR FLAT VIEW (EXACT 9 COLUMNS OF SHEET 2 + ACTIONS)
                filteredGranularLots.map((l, idx) => (
                  <tr key={l._id || idx} className="hover:bg-slate-50 transition-colors">
                    <td className="p-2.5 font-mono font-bold text-blue-700">{l.mpn}</td>
                    <td className="p-2.5">
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-semibold">
                        {l.classification}
                      </span>
                    </td>
                    <td className="p-2.5 font-bold text-slate-900">{l.material}</td>
                    <td className="p-2.5 text-slate-600">{l.vendor}</td>
                    <td className="p-2.5">{l.location}</td>
                    <td className="p-2.5 font-mono text-[11px]">{l.wh}</td>
                    <td className="p-2.5 font-mono font-bold text-slate-900">{l.lotNo}</td>
                    <td className="p-2.5 text-slate-600">
                      {l.expDate ? new Date(l.expDate).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="p-2.5 text-right font-mono font-black text-emerald-700">
                      {l.available.toLocaleString()} {l.uom}
                    </td>
                    <td className="p-2.5 text-center">
                      <div className="flex items-center justify-center space-x-1">
                        <button
                          onClick={() => openTransferModal(l)}
                          className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded text-[10px] font-bold transition-colors"
                          title="Transfer to another warehouse"
                        >
                          ⇄ Move
                        </button>
                        <button
                          onClick={() => openEditLotModal(l)}
                          className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded text-[10px] font-bold transition-colors"
                          title="Edit Lot / Reconcile Stock"
                        >
                          ✏ Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}

              {((viewMode === 'AGGREGATE' && filteredAggregates.length === 0) ||
                (viewMode === 'GRANULAR' && filteredGranularLots.length === 0)) && !loading && (
                <tr>
                  <td colSpan={viewMode === 'AGGREGATE' ? 9 : 9} className="p-8 text-center text-slate-400 font-semibold">
                    No lot storage records found. Click "+ Inward Stock" to register the first batch receipt.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* INWARD STOCK MODAL (GRN) */}
      {isInwardModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 animate-fadeIn">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Plus className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-tight">
                  Inward Stock Entry &bull; Lot Storage Ledger
                </h3>
              </div>
              <button onClick={() => setIsInwardModalOpen(false)} className="text-slate-400 hover:text-slate-700 font-bold">✕</button>
            </div>

            <form onSubmit={handleInwardSubmit} className="p-4 space-y-3 text-xs">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Raw Material</label>
                <select
                  required
                  value={inwardForm.materialId}
                  onChange={(e) => setInwardForm({ ...inwardForm, materialId: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-semibold text-slate-900 focus:outline-blue-500"
                >
                  {materialsList.map(m => (
                    <option key={m._id} value={m._id}>{m.code} &bull; {m.name} ({m.unit})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Supplier / Vendor</label>
                <select
                  value={inwardForm.vendorId}
                  onChange={(e) => setInwardForm({ ...inwardForm, vendorId: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-semibold text-slate-900 focus:outline-blue-500"
                >
                  {vendorsList.map(v => (
                    <option key={v._id} value={v._id}>{v.name} ({v.vendorCode || v.code || 'VEN'})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Location (Site)</label>
                  <select
                    value={inwardForm.siteId}
                    onChange={(e) => {
                      const sId = e.target.value;
                      const s = sites.find(item => item._id === sId);
                      const defWh = s?.defaultWarehouse?._id || warehouses.find(w => (w.siteId?._id || w.siteId) === sId && w.isDefault)?._id || '';
                      setInwardForm({ ...inwardForm, siteId: sId, warehouseId: defWh });
                    }}
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-semibold text-slate-900 focus:outline-blue-500"
                  >
                    {sites.map(s => (
                      <option key={s._id} value={s._id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">
                    Warehouse <span className="text-blue-600 font-bold">(Auto-Default)</span>
                  </label>
                  <select
                    value={inwardForm.warehouseId}
                    onChange={(e) => setInwardForm({ ...inwardForm, warehouseId: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-semibold text-slate-900 focus:outline-blue-500"
                  >
                    {warehouses
                      .filter(w => !inwardForm.siteId || (w.siteId?._id || w.siteId) === inwardForm.siteId)
                      .map(w => (
                        <option key={w._id} value={w._id}>
                          {w.name} {w.isDefault ? '★ [Default]' : ''}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Lot Number</label>
                  <input
                    type="text"
                    required
                    value={inwardForm.lotNumber}
                    onChange={(e) => setInwardForm({ ...inwardForm, lotNumber: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono font-bold text-slate-900 focus:outline-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Mfg Date</label>
                  <input
                    type="date"
                    required
                    value={inwardForm.mfgDate}
                    onChange={(e) => setInwardForm({ ...inwardForm, mfgDate: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-semibold text-slate-900 focus:outline-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Expiry Date</label>
                  <input
                    type="date"
                    required
                    value={inwardForm.expiryDate}
                    onChange={(e) => setInwardForm({ ...inwardForm, expiryDate: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-semibold text-slate-900 focus:outline-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Inward Quantity</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={inwardForm.quantity}
                    onChange={(e) => setInwardForm({ ...inwardForm, quantity: e.target.value })}
                    placeholder="e.g. 500"
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono font-black text-slate-900 focus:outline-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Unit Cost (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={inwardForm.unitCost}
                    onChange={(e) => setInwardForm({ ...inwardForm, unitCost: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono text-slate-900 focus:outline-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Reason for Inward</label>
                <select
                  value={inwardForm.reason || 'PO Receipt'}
                  onChange={(e) => setInwardForm({ ...inwardForm, reason: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-semibold text-slate-900 focus:outline-blue-500"
                >
                  <option value="PO Receipt">PO Receipt / Vendor Delivery</option>
                  <option value="Initial Stock Entry">Initial Stock Entry / Opening Count</option>
                  <option value="Production Yield">Production Yield / FG Output</option>
                  <option value="Customer Return">Customer Return</option>
                  <option value="Transfer In">Transfer In</option>
                  <option value="Physical Audit Surplus">Physical Audit Surplus</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Reference PO / Invoice Doc #</label>
                <input
                  type="text"
                  value={inwardForm.referenceDoc}
                  onChange={(e) => setInwardForm({ ...inwardForm, referenceDoc: e.target.value })}
                  placeholder="e.g. PO-2026-0819 / INV-991"
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900 focus:outline-blue-500"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsInwardModalOpen(false)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAction}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-xs"
                >
                  {submittingAction ? 'Processing Inward...' : 'Post Inward Receipt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* OUTWARD STOCK MODAL (FIFO LOT SELECTION) */}
      {isOutwardModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 animate-fadeIn">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Minus className="w-4 h-4 text-rose-600" />
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-tight">
                  Outward Issue Entry &bull; Mandatory FIFO Lot Selection
                </h3>
              </div>
              <button onClick={() => setIsOutwardModalOpen(false)} className="text-slate-400 hover:text-slate-700 font-bold">✕</button>
            </div>

            <form onSubmit={handleOutwardSubmit} className="p-4 space-y-3 text-xs">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Material to Issue</label>
                <select
                  required
                  value={outwardForm.materialId}
                  onChange={(e) => {
                    const mId = e.target.value;
                    setOutwardForm({ ...outwardForm, materialId: mId });
                    loadLotsForMaterial(mId);
                  }}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-semibold text-slate-900 focus:outline-blue-500"
                >
                  {materialsList.map(m => (
                    <option key={m._id} value={m._id}>{m.code} &bull; {m.name}</option>
                  ))}
                </select>
              </div>

              {/* MANDATORY LOT SELECTION (SORTED FIFO BY EXPIRY) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[10px] font-black text-slate-500 uppercase">
                    Mandatory Lot Selection <span className="text-blue-600 font-bold">(FIFO Expiry Sorted)</span>
                  </label>
                  {loadingLots && <span className="text-[10px] text-blue-600 font-semibold animate-pulse">Loading lots...</span>}
                </div>

                <select
                  required
                  value={outwardForm.lotNumber}
                  onChange={(e) => setOutwardForm({ ...outwardForm, lotNumber: e.target.value })}
                  className="w-full border-2 border-blue-400 bg-blue-50/40 rounded-lg px-2.5 py-1.5 font-mono font-bold text-slate-900 focus:outline-blue-500"
                >
                  <option value="">-- Select Lot to Deduct --</option>
                  {availableLotsForMaterial.map(lot => (
                    <option key={lot._id} value={lot.lotNumber || lot.batchNumber}>
                      Lot: {lot.lotNumber || lot.batchNumber} &bull; Avail: {lot.available || lot.balance} &bull; Exp: {lot.expiryDate ? new Date(lot.expiryDate).toLocaleDateString() : 'N/A'}
                    </option>
                  ))}
                </select>
                {availableLotsForMaterial.length === 0 && !loadingLots && (
                  <p className="text-[10px] text-rose-600 font-bold mt-1">
                    No active lots available in stock for this material.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Outward Quantity</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={outwardForm.quantity}
                    onChange={(e) => setOutwardForm({ ...outwardForm, quantity: e.target.value })}
                    placeholder="e.g. 50"
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono font-black text-slate-900 focus:outline-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Issue Reason</label>
                  <select
                    value={outwardForm.reason}
                    onChange={(e) => setOutwardForm({ ...outwardForm, reason: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-semibold text-slate-900 focus:outline-blue-500"
                  >
                    <option value="Production Issue">Production Issue</option>
                    <option value="Customer Dispatch">Customer Dispatch</option>
                    <option value="Sample / Quality Testing">Sample / Quality Testing</option>
                    <option value="Scrap / Damage">Scrap / Damage</option>
                    <option value="Inter-Facility Transfer">Inter-Facility Transfer</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Reference Document / Work Order #</label>
                <input
                  type="text"
                  value={outwardForm.referenceDoc}
                  onChange={(e) => setOutwardForm({ ...outwardForm, referenceDoc: e.target.value })}
                  placeholder="e.g. WO-2026-001 / DSP-441"
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900 focus:outline-blue-500"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsOutwardModalOpen(false)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAction || availableLotsForMaterial.length === 0}
                  className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl shadow-xs"
                >
                  {submittingAction ? 'Processing Outward...' : 'Post Outward Issue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* INTER-WAREHOUSE TRANSFER MODAL */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 animate-fadeIn">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <ArrowRightLeft className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-tight">
                  Inter-Warehouse Stock Transfer
                </h3>
              </div>
              <button onClick={() => setIsTransferModalOpen(false)} className="text-slate-400 hover:text-slate-700 font-bold">✕</button>
            </div>

            <form onSubmit={handleTransferSubmit} className="p-4 space-y-3 text-xs">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Material to Transfer</label>
                <select
                  required
                  value={transferForm.materialId}
                  onChange={(e) => {
                    const mId = e.target.value;
                    setTransferForm({ ...transferForm, materialId: mId });
                    loadLotsForMaterial(mId);
                  }}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-semibold text-slate-900 focus:outline-blue-500"
                >
                  {materialsList.map(m => (
                    <option key={m._id} value={m._id}>{m.code} &bull; {m.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Origin (Source WH)</label>
                  <select
                    required
                    value={transferForm.fromWarehouseId}
                    onChange={(e) => setTransferForm({ ...transferForm, fromWarehouseId: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-semibold text-slate-900 focus:outline-blue-500"
                  >
                    {warehouses.map(w => (
                      <option key={w._id} value={w._id}>{w.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Destination (Target WH)</label>
                  <select
                    required
                    value={transferForm.toWarehouseId}
                    onChange={(e) => setTransferForm({ ...transferForm, toWarehouseId: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-semibold text-slate-900 focus:outline-blue-500"
                  >
                    <option value="">-- Select Target WH --</option>
                    {warehouses
                      .filter(w => w._id !== transferForm.fromWarehouseId)
                      .map(w => (
                        <option key={w._id} value={w._id}>{w.name}</option>
                      ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Select Lot to Transfer (FIFO)</label>
                <select
                  required
                  value={transferForm.lotNumber}
                  onChange={(e) => setTransferForm({ ...transferForm, lotNumber: e.target.value })}
                  className="w-full border-2 border-blue-400 bg-blue-50/40 rounded-lg px-2.5 py-1.5 font-mono font-bold text-slate-900 focus:outline-blue-500"
                >
                  <option value="">-- Select Lot --</option>
                  {availableLotsForMaterial.map(lot => (
                    <option key={lot._id} value={lot.lotNumber || lot.batchNumber}>
                      Lot: {lot.lotNumber || lot.batchNumber} &bull; Avail: {lot.available} &bull; Exp: {lot.expiryDate ? new Date(lot.expiryDate).toLocaleDateString() : 'N/A'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Transfer Quantity</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={transferForm.quantity}
                    onChange={(e) => setTransferForm({ ...transferForm, quantity: e.target.value })}
                    placeholder="Qty to move..."
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono font-black text-slate-900 focus:outline-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Transfer Reason</label>
                  <input
                    type="text"
                    value={transferForm.reason}
                    onChange={(e) => setTransferForm({ ...transferForm, reason: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900 focus:outline-blue-500"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end space-x-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsTransferModalOpen(false)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAction}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-xs"
                >
                  {submittingAction ? 'Transferring...' : 'Execute Stock Transfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT LOT / STOCK RECONCILIATION MODAL */}
      {isEditLotModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 animate-fadeIn">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Sliders className="w-4 h-4 text-amber-600" />
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-tight">
                  Edit Lot &bull; Stock Count Reconciliation
                </h3>
              </div>
              <button onClick={() => setIsEditLotModalOpen(false)} className="text-slate-400 hover:text-slate-700 font-bold">✕</button>
            </div>

            <form onSubmit={handleEditLotSubmit} className="p-4 space-y-3 text-xs">
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 space-y-1">
                <div className="flex justify-between font-bold">
                  <span className="text-slate-500">Material:</span>
                  <span className="text-slate-900">{editLotForm.materialName}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span className="text-slate-500">Warehouse:</span>
                  <span className="text-slate-900">{editLotForm.warehouseName}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span className="text-slate-500">Lot Number:</span>
                  <span className="font-mono text-blue-700">{editLotForm.lotNumber}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span className="text-slate-500">Current Ledger On-Hand:</span>
                  <span className="font-mono text-slate-900">{editLotForm.onHand}</span>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">
                  New Physical Count Quantity
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editLotForm.newQuantity}
                    onChange={(e) => setEditLotForm({ ...editLotForm, newQuantity: e.target.value })}
                    className="w-full border-2 border-amber-400 bg-amber-50/30 rounded-lg px-2.5 py-1.5 font-mono font-black text-slate-900 focus:outline-amber-500"
                  />
                  <div className="text-xs font-black shrink-0">
                    {Number(editLotForm.newQuantity) - editLotForm.onHand !== 0 && (
                      <span className={`px-2 py-1 rounded-md ${
                        Number(editLotForm.newQuantity) - editLotForm.onHand > 0
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}>
                        {Number(editLotForm.newQuantity) - editLotForm.onHand > 0 ? '+' : ''}
                        {(Number(editLotForm.newQuantity) - editLotForm.onHand).toFixed(2)} Diff
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Manufacturing Date</label>
                  <input
                    type="date"
                    value={editLotForm.newMfgDate}
                    onChange={(e) => setEditLotForm({ ...editLotForm, newMfgDate: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900 focus:outline-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Expiry Date</label>
                  <input
                    type="date"
                    value={editLotForm.newExpiryDate}
                    onChange={(e) => setEditLotForm({ ...editLotForm, newExpiryDate: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900 focus:outline-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">
                  Reason for Adjustment <span className="text-rose-600">*</span>
                </label>
                <select
                  required
                  value={editLotForm.reason}
                  onChange={(e) => setEditLotForm({ ...editLotForm, reason: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-semibold text-slate-900 focus:outline-blue-500"
                >
                  <option value="Physical count discrepancy">Physical count discrepancy / Audit</option>
                  <option value="Damage / Spoilage">Damage / Spoilage write-off</option>
                  <option value="Expiry date correction">Expiry date correction</option>
                  <option value="Typo / System correction">Typo / System correction</option>
                  <option value="Quality Inspection Release">Quality Inspection Release</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end space-x-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditLotModalOpen(false)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAction}
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl shadow-xs"
                >
                  {submittingAction ? 'Updating Lot...' : 'Save Lot Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

