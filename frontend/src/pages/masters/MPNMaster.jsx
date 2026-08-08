import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../services/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table';
import { Button } from '../../components/ui/Button';
import { Input, Select, TextArea } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Dialog } from '../../components/ui/Dialog';
import { Search, Plus, Edit2, Trash2, Save, Filter, RefreshCw, Cpu, Download, Eye, RotateCcw, Printer, CheckSquare, Square, X, AlertTriangle, ShieldAlert, FileSpreadsheet } from 'lucide-react';
import ConfirmDeleteDialog from '../../components/ui/ConfirmDeleteDialog';
import MpnBulkModal from '../../components/mpn/MpnBulkModal';

const STATUS_OPTIONS = ['Active', 'Inactive', 'Draft'];

const EMPTY_FORM = {
  _id: null,
  mpnCode: '',
  manufacturerPartNumber: '',
  mpnName: '',
  manufacturerName: '',
  isDirectFromManufacturer: false,
  materialId: '',
  vendorId: '',
  price: '',
  moq: 1,
  gstin: '',
  partDescription: '',
  status: 'Active',
};

export default function MPNMaster() {
  const [rows, setRows] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [manufacturers, setManufacturers] = useState([]);
  const [loading, setLoading] = useState(false);

  // 4 Filter states
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [materialFilter, setMaterialFilter] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [viewRecord, setViewRecord] = useState(null);
  const [isEdit, setIsEdit] = useState(false);
  const [deleteConfirmState, setDeleteConfirmState] = useState({ isOpen: false, itemIds: [] });
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});

  // Auto-complete suggestion dropdown visibility
  const [mfrSuggestionsOpen, setMfrSuggestionsOpen] = useState(false);

  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 4000);
  };

  const selectedVendorObj = useMemo(() => {
    return vendors.find((v) => v._id === form.vendorId);
  }, [vendors, form.vendorId]);

  const isVendorGstinPresent = Boolean(selectedVendorObj?.gstin && selectedVendorObj.gstin.trim());

  // Helper to fetch all paginated records by looping pages until complete
  const fetchAllPages = async (url) => {
    let allRecords = [];
    let page = 1;
    let totalPages = 1;
    do {
      const res = await api.get(url, { params: { page, limit: 100 } });
      const items = Array.isArray(res.data?.data) ? res.data.data : Array.isArray(res.data) ? res.data : [];
      allRecords = [...allRecords, ...items];
      totalPages = res.data?.pagination?.pages || 1;
      page++;
    } while (page <= totalPages && page <= 50);
    return allRecords;
  };

  // ---------- Data fetching ----------
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const endpoint = statusFilter === 'Deleted' ? '/api/mpns/deleted' : '/api/mpns';
      const [mpnRes, matList, venList, mfrRes] = await Promise.all([
        api.get(endpoint, {
          params: {
            status: statusFilter,
            materialId: materialFilter,
            vendorId: vendorFilter,
          },
        }),
        fetchAllPages('/api/materials'),
        fetchAllPages('/api/vendors'),
        api.get('/api/mpns/manufacturers'),
      ]);

      const mpnList = Array.isArray(mpnRes.data?.data) ? mpnRes.data.data : Array.isArray(mpnRes.data) ? mpnRes.data : [];
      const mfrList = Array.isArray(mfrRes.data?.data) ? mfrRes.data.data : Array.isArray(mfrRes.data) ? mfrRes.data : [];

      setRows(mpnList);
      setMaterials(matList);
      setVendors(venList);
      setManufacturers(mfrList);
    } catch (err) {
      console.error('[MPNMaster] fetchAll error:', err);
      showToast(err.response?.data?.error || 'Failed to load MPN data', 'error');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, materialFilter, vendorFilter]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ---------- Add modal: auto-populate next sequence code ----------
  const openAddModal = async () => {
    setIsEdit(false);
    setFormErrors({});
    setForm(EMPTY_FORM);
    setModalOpen(true);
    try {
      const res = await api.get('/api/mpns/sequence-peek');
      if (res.data && res.data.nextCode) {
        setForm((prev) => ({ ...prev, mpnCode: res.data.nextCode }));
      }
    } catch {
      // Non-fatal
    }
  };

  const openEditModal = (row) => {
    setIsEdit(true);
    setFormErrors({});
    setForm({
      _id: row._id,
      mpnCode: row.mpnCode || '',
      manufacturerPartNumber: row.manufacturerPartNumber || '',
      mpnName: row.mpnName || '',
      manufacturerName: row.manufacturerName || '',
      isDirectFromManufacturer: Boolean(row.isDirectFromManufacturer),
      materialId: row.materialId?._id || row.materialId || '',
      vendorId: row.vendorId?._id || row.vendorId || '',
      price: row.price || '',
      moq: row.moq !== undefined ? row.moq : 1,
      gstin: row.gstin || '',
      partDescription: row.partDescription || '',
      status: row.status || 'Active',
    });
    setModalOpen(true);
  };

  const openViewModal = (row) => {
    setViewRecord(row);
    setViewModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setMfrSuggestionsOpen(false);
  };

  // ---------- Form handling & Same-as-Vendor guarded logic ----------
  const handleVendorChange = (vendorIdVal) => {
    setForm((prev) => {
      let newMfr = prev.manufacturerName;
      const foundVen = vendors.find((v) => v._id === vendorIdVal);
      if (prev.isDirectFromManufacturer) {
        newMfr = foundVen ? foundVen.name : '';
      }
      const vGstin = foundVen?.gstin || '';
      return {
        ...prev,
        vendorId: vendorIdVal,
        manufacturerName: newMfr,
        gstin: vGstin ? '' : prev.gstin,
      };
    });
  };

  const handleSameAsVendorToggle = (checked) => {
    setForm((prev) => {
      let newMfr = prev.manufacturerName;
      if (checked) {
        const foundVen = vendors.find((v) => v._id === prev.vendorId);
        newMfr = foundVen ? foundVen.name : '';
      }
      // Unchecking unlocks but retains last synced value (does not clear)
      return {
        ...prev,
        isDirectFromManufacturer: checked,
        manufacturerName: newMfr,
      };
    });
  };

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const validate = () => {
    const errors = {};
    if (!form.manufacturerName.trim()) errors.manufacturerName = 'Manufacturer Name is required';
    if (!form.materialId) errors.materialId = 'Please link a Material';
    if (!form.vendorId) errors.vendorId = 'Please link a Vendor';
    if (!form.moq || Number(form.moq) < 1) errors.moq = 'MOQ must be >= 1';
    if (!form.price || Number(form.price) <= 0) errors.price = 'Price must be > 0';


    if (!isVendorGstinPresent && form.gstin && form.gstin.trim()) {
      const gstinRegex = /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}\d[A-Z]\d[A-Z\d]$/i;
      if (!gstinRegex.test(form.gstin.trim())) {
        errors.gstin = 'Invalid GSTIN format (15 characters: e.g. 27AAAAA0000A1Z5)';
      }
    }

    setFormErrors(errors);
    return !errors.manufacturerName && !errors.materialId && !errors.vendorId && !errors.moq && !errors.price;
  };

  // Single Save button: validation is driven strictly by Status
  const handleSave = async () => {
    if (form.status !== 'Draft') {
      if (!validate()) return;
    }
    await submit(form);
  };

  const submit = async (payload) => {
    try {
      const body = {
        ...payload,
        moq: payload.moq === '' ? 1 : Number(payload.moq),
        gstin: isVendorGstinPresent ? '' : (payload.gstin ? payload.gstin.trim().toUpperCase() : ''),
      };
      delete body._id;

      if (isEdit) {
        await api.put(`/api/mpns/${form._id}`, body);
        showToast('MPN updated successfully');
      } else {
        await api.post('/api/mpns', body);
        showToast(payload.status === 'Draft' ? 'Saved as draft' : 'MPN created successfully');
      }

      setModalOpen(false);
      fetchAll();
    } catch (err) {
      showToast(err.response?.data?.error || 'Save failed', 'error');
    }
  };

  const handleInlinePriceUpdate = async (id, newPrice) => {
    try {
      if (!newPrice || Number(newPrice) <= 0) {
        showToast('Price must be greater than 0', 'error');
        return;
      }
      await api.put(`/api/mpns/${id}`, { price: Number(newPrice) });
      setRows((prev) => prev.map((r) => r._id === id ? { ...r, price: Number(newPrice) } : r));
      showToast('Price updated successfully');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to update price', 'error');
    }
  };

  // ---------- Soft Delete & Restore ----------
  const confirmDeleteMpns = async () => {
    const ids = deleteConfirmState.itemIds;
    if (ids.length === 0) return;
    try {
      if (ids.length === 1) {
        await api.delete(`/api/mpns/${ids[0]}`);
        showToast('MPN soft deleted and moved to history.');
      } else {
        await api.post('/api/mpns/batch-delete', { ids });
        showToast('Selected MPNs deleted');
        setSelectedIds([]);
      }
      fetchAll();
      setDeleteConfirmState({ isOpen: false, itemIds: [] });
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to delete MPN.', 'error');
    }
  };

  const handleDelete = (id) => {
    setDeleteConfirmState({ isOpen: true, itemIds: [id] });
  };

  const handleRestore = async (id) => {
    try {
      await api.put(`/api/mpns/${id}/restore`);
      showToast('MPN record restored successfully');
      fetchAll();
    } catch (err) {
      showToast(err.response?.data?.error || 'Restore failed', 'error');
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    setDeleteConfirmState({ isOpen: true, itemIds: selectedIds });
  };

  // ---------- Excel Export (passing all 4 active filters) ----------
  const handleExportExcel = async () => {
    try {
      const response = await api.get('/api/mpns/export', {
        responseType: 'blob',
        params: {
          search,
          status: statusFilter,
          materialId: materialFilter,
          vendorId: vendorFilter,
        },
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `MPN_Master_Export_${Date.now()}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      showToast('Excel report downloaded successfully');
    } catch (err) {
      showToast('Failed to export Excel file', 'error');
    }
  };

  // ---------- Single Record PDF Print ----------
  const handlePrintPDF = async (id) => {
    try {
      const response = await api.get(`/api/mpns/${id}/pdf`, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (err) {
      showToast('Failed to generate PDF document', 'error');
    }
  };

  // ---------- Search Filter Parity ----------
  const filteredRows = useMemo(() => {
    if (!search || !search.trim()) return rows;
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      const matName = r.materialId?.name || '';
      const matCode = r.materialId?.code || '';
      const venName = r.vendorId?.name || '';
      const venComp = r.vendorId?.company || '';
      const haystack = [
        r.mpnCode,
        r.manufacturerPartNumber,
        r.mpnName,
        r.manufacturerName,
        matName,
        matCode,
        venName,
        venComp,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(term);
    });
  }, [rows, search]);

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredRows.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredRows.map((r) => r._id));
    }
  };

  const toggleSelectOne = (id) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((item) => item !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Active':
        return <span className="font-bold text-emerald-600">Active</span>;
      case 'Draft':
        return <span className="font-bold text-amber-600">Draft</span>;
      case 'Inactive':
        return <span className="font-bold text-slate-600">Inactive</span>;
      case 'Deleted':
        return <span className="font-bold text-red-600">Deleted</span>;
      default:
        return <span className="font-bold text-slate-700">{status}</span>;
    }
  };

  // Manufacturer autocomplete suggestions filtered by user input
  const filteredMfrSuggestions = useMemo(() => {
    if (form.isDirectFromManufacturer) return [];
    if (!form.manufacturerName || !form.manufacturerName.trim()) return manufacturers;
    const term = form.manufacturerName.trim().toLowerCase();
    return manufacturers.filter((m) => m.toLowerCase().includes(term));
  }, [manufacturers, form.manufacturerName, form.isDirectFromManufacturer]);

  // Select mode state
  const [selectMode, setSelectMode] = useState(false);

  const toggleSelectMode = () => {
    if (selectMode) {
      setSelectedIds([]);
    }
    setSelectMode(!selectMode);
  };

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const totalPages = Math.ceil(filteredRows.length / pageSize) || 1;

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, materialFilter, vendorFilter]);

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  return (
    <div className="space-y-4">
      {/* Toast alert */}
      {toast.show && (
        <div
          className={`p-3 rounded-lg text-xs font-semibold text-white shadow-md flex justify-between items-center ${toast.type === 'error' ? 'bg-red-600' : 'bg-emerald-600'
            }`}
        >
          <span>{toast.message}</span>
          <button onClick={() => setToast({ show: false, message: '', type: 'success' })}>✕</button>
        </div>
      )}

      {/* Toolbar & 4 Search/Filter Controls Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Left: Search & Filter Selects */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 flex-1">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                type="text"
                placeholder="Search MPN ID, part #, material..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>

            {/* Status Filter */}
            <div>
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-9 text-xs"
              >
                <option value="All">All Statuses</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Draft">Draft</option>
                <option value="Deleted">Deleted (Restore History)</option>
              </Select>
            </div>

            {/* Material Filter */}
            <div>
              <Select
                value={materialFilter}
                onChange={(e) => setMaterialFilter(e.target.value)}
                className="h-9 text-xs"
              >
                <option value="">All Materials</option>
                {materials.map((m) => (
                  <option key={m._id} value={m._id}>
                    {m.name} ({m.code})
                  </option>
                ))}
              </Select>
            </div>

            {/* Vendor Filter */}
            <div>
              <Select
                value={vendorFilter}
                onChange={(e) => setVendorFilter(e.target.value)}
                className="h-9 text-xs"
              >
                <option value="">All Vendors</option>
                {vendors.map((v) => (
                  <option key={v._id} value={v._id}>
                    {v.name} {v.company ? `(${v.company})` : ''}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {/* Right: Actions & Select Mode */}
          <div className="flex items-center space-x-2 shrink-0 justify-end">
            <Button
              variant={selectMode ? 'secondary' : 'outline'}
              size="sm"
              onClick={toggleSelectMode}
              className="text-xs h-9"
            >
              {selectMode ? (
                <>
                  <CheckSquare className="h-3.5 w-3.5 mr-1 text-blue-600" />
                  Cancel Selection
                </>
              ) : (
                <>
                  <Square className="h-3.5 w-3.5 mr-1" />
                  Select
                </>
              )}
            </Button>

            {selectMode && (
              <>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={selectedIds.length === 0}
                  onClick={handleBatchDelete}
                  className="text-xs h-9"
                  title={
                    selectedIds.length === 0
                      ? 'Select 1 or more records to delete'
                      : `Soft delete ${selectedIds.length} selected record(s)`
                  }
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Delete ({selectedIds.length})
                </Button>
              </>
            )}

            <Button variant="outline" size="sm" onClick={handleExportExcel} className="text-xs h-9">
              <Download className="h-3.5 w-3.5 mr-1" />
              Export to Excel
            </Button>
            <Button variant="outline" size="sm" onClick={fetchAll} className="text-xs h-9">
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={() => setBulkModalOpen(true)} className="text-xs h-9 bg-white text-slate-700 border-slate-300 hover:bg-slate-50 shadow-sm">
              <FileSpreadsheet className="h-3.5 w-3.5 mr-1 text-slate-500" />
              Bulk Create
            </Button>
            <Button variant="primary" size="sm" onClick={openAddModal} className="text-xs h-9">
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add MPN
            </Button>
          </div>
        </div>
      </div>

      {/* Data Table Card - Excel Spreadsheet Formatting */}
      <Card className="border border-slate-300 shadow-sm rounded-xl overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-100/90 text-slate-700 font-bold uppercase tracking-tight border-b border-slate-300 select-none">
                <tr>
                  {selectMode && (
                    <th className="w-10 px-2 py-2 text-center border-r border-slate-200">
                      <input
                        type="checkbox"
                        checked={selectedIds.length > 0 && selectedIds.length === filteredRows.length}
                        onChange={toggleSelectAll}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                    </th>
                  )}
                  <th className="w-10 px-2 py-2 text-center font-mono border-r border-slate-200">#</th>
                  <th className="px-2.5 py-2 w-28 border-r border-slate-200">MPN ID</th>
                  <th className="px-2.5 py-2 min-w-[140px] border-r border-slate-200">Mfr Part No</th>
                  <th className="px-2.5 py-2 min-w-[140px] border-r border-slate-200">Manufacturer</th>
                  <th className="px-2.5 py-2 min-w-[180px] border-r border-slate-200">Linked Material</th>
                  <th className="px-2.5 py-2 min-w-[180px] border-r border-slate-200">Linked Vendor</th>
                  <th className="px-2.5 py-2 w-28 text-right border-r border-slate-200">Price (₹)</th>
                  <th className="px-2.5 py-2 w-20 text-center border-r border-slate-200">MOQ</th>
                  <th className="px-2.5 py-2 w-24 border-r border-slate-200">Status</th>
                  <th className="px-2.5 py-2 w-24 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {loading ? (
                  <tr>
                    <td colSpan={selectMode ? 11 : 10} className="text-center py-8 text-xs text-slate-400">
                      Loading MPN master records...
                    </td>
                  </tr>
                ) : paginatedRows.length === 0 ? (
                  <tr>
                    <td colSpan={selectMode ? 11 : 10} className="text-center py-8 text-xs text-slate-400">
                      No MPN records found matching your filters.
                    </td>
                  </tr>
                ) : (
                  paginatedRows.map((row, index) => (
                    <tr key={row._id} className="hover:bg-slate-50/80 transition-colors border-b border-slate-200">
                      {selectMode && (
                        <td className="px-2 py-1.5 text-center border-r border-slate-200">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(row._id)}
                            onChange={() => toggleSelectOne(row._id)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                        </td>
                      )}
                      <td className="px-2 py-1.5 text-center font-mono text-slate-400 font-semibold text-[11px] border-r border-slate-200 bg-slate-50/50">
                        {((currentPage - 1) * pageSize) + index + 1}
                      </td>
                      <td className="px-2.5 py-1.5 font-mono text-xs font-bold text-blue-700 border-r border-slate-200 truncate max-w-[140px]" title={row.mpnCode || ''}>
                        {row.mpnCode || '—'}
                      </td>
                      <td className="px-2.5 py-1.5 font-mono text-xs text-slate-900 font-medium border-r border-slate-200 truncate max-w-[180px]" title={row.manufacturerPartNumber || ''}>
                        {row.manufacturerPartNumber || '—'}
                      </td>
                      <td className="px-2.5 py-1.5 text-xs text-slate-800 border-r border-slate-200 truncate max-w-[160px]" title={row.manufacturerName || ''}>
                        {row.manufacturerName || 'GENERIC'}
                      </td>
                      <td className="px-2.5 py-1.5 text-xs text-slate-800 font-medium border-r border-slate-200 truncate max-w-[200px]" title={row.materialId ? `${row.materialId.name} (${row.materialId.code || '—'})` : ''}>
                        {row.materialId ? `${row.materialId.name} (${row.materialId.code || '—'})` : '—'}
                      </td>
                      <td className="px-2.5 py-1.5 text-xs text-slate-700 border-r border-slate-200 truncate max-w-[200px]" title={row.vendorId ? `${row.vendorId.name} ${row.vendorId.company ? `(${row.vendorId.company})` : ''}` : ''}>
                        {row.vendorId ? `${row.vendorId.name} ${row.vendorId.company ? `(${row.vendorId.company})` : ''}` : '—'}
                      </td>
                      <td className="px-2.5 py-1.5 text-right border-r border-slate-200">
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          defaultValue={row.price || ''}
                          onBlur={(e) => {
                            if (e.target.value && e.target.value !== String(row.price)) {
                              handleInlinePriceUpdate(row._id, e.target.value);
                            }
                          }}
                          className="w-20 text-xs text-right border-slate-200 rounded focus:ring-blue-500 focus:border-blue-500 px-1.5 py-0.5 font-semibold text-slate-900 bg-slate-50/40"
                          placeholder="Price"
                        />
                      </td>
                      <td className="px-2.5 py-1.5 text-xs text-center font-mono font-medium text-slate-700 border-r border-slate-200">
                        {row.moq !== undefined ? row.moq : 1}
                      </td>
                      <td className="px-2.5 py-1.5 text-xs font-semibold border-r border-slate-200">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${row.status === 'Active'
                            ? 'text-emerald-700 bg-emerald-50 border border-emerald-200'
                            : row.status === 'Draft'
                              ? 'text-amber-700 bg-amber-50 border border-amber-200'
                              : 'text-slate-700 bg-slate-100 border border-slate-200'
                          }`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <div className="flex items-center justify-center space-x-1">
                          <button
                            onClick={() => openViewModal(row)}
                            className="p-1 text-slate-400 hover:text-blue-600 transition-colors"
                            title="View MPN Details"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          {row.status !== 'Deleted' ? (
                            <>
                              <button
                                onClick={() => openEditModal(row)}
                                className="p-1 text-slate-400 hover:text-blue-600 transition-colors"
                                title="Edit MPN"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDelete(row._id)}
                                className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                                title="Soft Delete MPN"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => handleRestore(row._id)}
                              className="p-1 text-emerald-600 hover:text-emerald-700 transition-colors flex items-center"
                              title="Restore Record"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
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

      {/* Pagination Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/50 gap-2">
        <div className="text-xs text-slate-500 font-medium">
          Showing <span className="font-bold text-slate-800">{filteredRows.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}</span> to <span className="font-bold text-slate-800">{Math.min(currentPage * pageSize, filteredRows.length)}</span> of <span className="font-bold text-slate-800">{filteredRows.length}</span> records
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="text-xs h-8 px-2.5"
          >
            Previous
          </Button>
          <span className="text-xs font-semibold text-slate-600">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            className="text-xs h-8 px-2.5"
          >
            Next
          </Button>
        </div>
      </div>

      {/* Full-Screen / Large Viewport Add & Edit Dialog Panel */}
      <Dialog
        isOpen={modalOpen}
        onClose={closeModal}
        title={isEdit ? 'Edit MPN Specification' : 'Register New MPN Record'}
        className="max-w-5xl w-[95vw] max-h-[92vh]"
      >
        <div className="space-y-5 pt-2">
          {/* Section 1: Basic Identifiers & Status */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50/60 p-3.5 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                MPN ID <span className="text-slate-400 font-normal">(Auto-generated)</span>
              </label>
              <Input
                type="text"
                value={form.mpnCode}
                disabled
                placeholder="e.g. MPN1001"
                className="text-xs font-mono bg-slate-100 font-bold text-blue-700"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Status <span className="text-blue-600 text-[10px] font-normal">(Controls Validation)</span>
              </label>
              <Select
                value={form.status}
                onChange={(e) => handleChange('status', e.target.value)}
                className="text-xs font-semibold"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s} {s === 'Draft' ? '(Required checks skipped)' : '(Full validation)'}
                  </option>
                ))}
              </Select>
            </div>

            {/* Same as Vendor Checkbox & Manufacturer Combo Box */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700">
                  Manufacturer Name <span className="text-red-500">*</span>
                </label>
                <label className="flex items-center space-x-1.5 cursor-pointer text-xs font-bold text-blue-700 select-none">
                  <input
                    type="checkbox"
                    checked={form.isDirectFromManufacturer}
                    onChange={(e) => handleSameAsVendorToggle(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Same as Vendor</span>
                </label>
              </div>

              <div className="relative">
                <Input
                  type="text"
                  value={form.manufacturerName}
                  onChange={(e) => {
                    handleChange('manufacturerName', e.target.value);
                    setMfrSuggestionsOpen(true);
                  }}
                  onFocus={() => setMfrSuggestionsOpen(true)}
                  disabled={form.isDirectFromManufacturer}
                  placeholder={
                    form.isDirectFromManufacturer
                      ? form.vendorId
                        ? 'Auto-filled from selected Vendor'
                        : 'Select a Vendor to auto-fill'
                      : 'Type manufacturer name...'
                  }
                  className={`text-xs ${form.isDirectFromManufacturer ? 'bg-slate-100 text-slate-600 font-bold' : ''}`}
                />

                {/* Combo box autocomplete suggestions */}
                {!form.isDirectFromManufacturer && mfrSuggestionsOpen && filteredMfrSuggestions.length > 0 && (
                  <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                    {filteredMfrSuggestions.map((mfr, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          handleChange('manufacturerName', mfr);
                          setMfrSuggestionsOpen(false);
                        }}
                        className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                      >
                        {mfr}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {formErrors.manufacturerName && (
                <p className="text-[11px] text-red-500 font-medium mt-1">{formErrors.manufacturerName}</p>
              )}
            </div>
          </div>

          {/* Section 2: Links */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Linked Material <span className="text-red-500">*</span>
              </label>
              <Select
                value={form.materialId}
                onChange={(e) => handleChange('materialId', e.target.value)}
                className="text-xs"
              >
                <option value="">-- Select Material --</option>
                {materials.map((m) => (
                  <option key={m._id} value={m._id}>
                    {m.name} ({m.code})
                  </option>
                ))}
              </Select>
              {formErrors.materialId && (
                <p className="text-[11px] text-red-500 font-medium mt-1">{formErrors.materialId}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Linked Vendor <span className="text-red-500">*</span>
              </label>
              <Select
                value={form.vendorId}
                onChange={(e) => handleVendorChange(e.target.value)}
                className="text-xs"
              >
                <option value="">-- Select Vendor --</option>
                {vendors.map((v) => (
                  <option key={v._id} value={v._id}>
                    {v.name} {v.company ? `— ${v.company}` : ''}
                  </option>
                ))}
              </Select>
              {formErrors.vendorId && (
                <p className="text-[11px] text-red-500 font-medium mt-1">{formErrors.vendorId}</p>
              )}
            </div>
          </div>

          {/* Section 3: Commercial Terms */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                MPN Name <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <Input
                type="text"
                value={form.mpnName}
                onChange={(e) => handleChange('mpnName', e.target.value)}
                placeholder="e.g. High-Temp Ceramic Resistor (Optional)"
                className="text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                GSTIN <span className="text-slate-400 font-normal">{isVendorGstinPresent ? '(From Vendor)' : '(Manual Fallback)'}</span>
              </label>
              <Input
                type="text"
                maxLength={15}
                value={isVendorGstinPresent ? (selectedVendorObj?.gstin || '') : form.gstin}
                onChange={(e) => handleChange('gstin', e.target.value.toUpperCase())}
                disabled={isVendorGstinPresent}
                placeholder={isVendorGstinPresent ? 'Auto-filled from Vendor' : 'e.g. 27AAAAA0000A1Z5'}
                className={`text-xs font-mono font-bold ${isVendorGstinPresent ? 'bg-slate-100 text-slate-600' : ''}`}
              />
              {formErrors.gstin && (
                <p className="text-[11px] text-amber-600 font-medium mt-1">{formErrors.gstin}</p>
              )}
            </div>
          </div>

          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 shadow-sm">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">Commercial Terms</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  MOQ <span className="text-red-500">*</span>
                </label>
                <Input
                  type="number"
                  min="1"
                  value={form.moq}
                  onChange={(e) => handleChange('moq', e.target.value)}
                  placeholder="1"
                  className="text-xs font-mono"
                />
                {formErrors.moq && (
                  <p className="text-[11px] text-red-500 font-medium mt-1">{formErrors.moq}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Price (₹) <span className="text-red-500">*</span>
                </label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => handleChange('price', e.target.value)}
                  placeholder="0.00"
                  className="text-xs font-mono"
                />
                {formErrors.price && (
                  <p className="text-[11px] text-red-500 font-medium mt-1">{formErrors.price}</p>
                )}
              </div>
            </div>
          </div>

          {/* Section 4: Specifications & Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Part Specifications / Notes</label>
            <TextArea
              rows={3}
              value={form.partDescription}
              onChange={(e) => handleChange('partDescription', e.target.value)}
              placeholder="Technical specs, tolerances, datasheet links, storage guidelines..."
              className="text-xs"
            />
          </div>

          {/* Action Bar */}
          <div className="flex items-center justify-end pt-4 border-t border-slate-200">
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm" onClick={closeModal} className="px-4">
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleSave} className="px-5 font-bold">
                <Save className="h-3.5 w-3.5 mr-1.5" />
                {isEdit ? 'Update MPN Record' : 'Save MPN Record'}
              </Button>
            </div>
          </div>
        </div>
      </Dialog>

      {/* View Detail Modal with Print PDF Button */}
      {viewRecord && (
        <Dialog isOpen={viewModalOpen} onClose={() => setViewModalOpen(false)} title="MPN Specification Sheet">
          <div className="space-y-4 pt-2 text-xs">
            <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div>
                <span className="text-slate-400 font-bold block text-[10px]">MPN ID</span>
                <span className="font-mono font-bold text-blue-700 text-sm">{viewRecord.mpnCode || '—'}</span>
              </div>
              <div>
                <span className="text-slate-400 font-bold block text-[10px]">Status</span>
                {getStatusBadge(viewRecord.status)}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-slate-500 font-semibold block">Manufacturer Part Number</span>
                <span className="font-mono font-bold text-slate-900">{viewRecord.manufacturerPartNumber || '—'}</span>
              </div>
              <div>
                <span className="text-slate-500 font-semibold block">MPN Name</span>
                <span className="font-bold text-slate-800">{viewRecord.mpnName || '—'}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-slate-500 font-semibold block">Manufacturer Name</span>
                <span className="font-medium text-slate-800">
                  {viewRecord.manufacturerName} {viewRecord.isDirectFromManufacturer ? '(Same as Vendor)' : ''}
                </span>
              </div>
              <div>
                <span className="text-slate-500 font-semibold block">Linked Vendor</span>
                <span className="font-medium text-slate-800">
                  {viewRecord.vendorId ? `${viewRecord.vendorId.name} (${viewRecord.vendorId.company || '—'})` : '—'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-slate-500 font-semibold block">Linked Material</span>
                <span className="font-medium text-slate-800">
                  {viewRecord.materialId ? `${viewRecord.materialId.name} (${viewRecord.materialId.code || '—'})` : '—'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 font-semibold block">Commercial Terms</span>
                <span className="font-mono font-bold text-slate-900">
                  (Price: ₹{viewRecord.price || '0.00'}, MOQ: {viewRecord.moq}, GSTIN: {viewRecord.vendorId?.gstin || viewRecord.gstin || '?'})
                </span>
              </div>
            </div>

            {viewRecord.partDescription && (
              <div>
                <span className="text-slate-500 font-semibold block">Part Description / Notes</span>
                <p className="p-2 bg-slate-50 rounded border border-slate-200 text-slate-700 mt-1">
                  {viewRecord.partDescription}
                </p>
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <Button variant="outline" size="sm" onClick={() => handlePrintPDF(viewRecord._id)}>
                <Printer className="h-3.5 w-3.5 mr-1" />
                Print / Download PDF
              </Button>
              <Button variant="primary" size="sm" onClick={() => setViewModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Confirm Delete Dialog */}
      <ConfirmDeleteDialog
        isOpen={deleteConfirmState.isOpen}
        onClose={() => setDeleteConfirmState({ isOpen: false, itemIds: [] })}
        onConfirm={confirmDeleteMpns}
        itemCount={deleteConfirmState.itemIds.length}
      />

      {/* MPN Bulk Create 2-Step Wizard Modal */}
      <MpnBulkModal
        isOpen={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        vendors={vendors}
        materials={materials}
        onSuccess={(count) => {
          showToast(`Successfully created ${count} MPN(s) in bulk.`, 'success');
          fetchAll();
        }}
      />
    </div>
  );
}
