import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../services/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { Button } from '../components/ui/Button';
import { Input, Select, TextArea } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Dialog } from '../components/ui/Dialog';
import { Search, Plus, Edit2, Trash2, Save, Filter, RefreshCw, Cpu, Layers } from 'lucide-react';

const STATUS_OPTIONS = ['Active', 'Inactive', 'Draft'];

const EMPTY_FORM = {
  _id: null,
  mpnCode: '',
  mpnName: '',
  manufacturerName: '',
  materialId: '',
  vendorId: '',
  partDescription: '',
  status: 'Active',
};

export default function MPNMaster() {
  const [rows, setRows] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedIds, setSelectedIds] = useState([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 4000);
  };

  // ---------- Data fetching ----------
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [mpnRes, matRes, venRes] = await Promise.all([
        api.get('/api/mpns'),
        api.get('/api/materials'),
        api.get('/api/vendors'),
      ]);
      setRows(mpnRes.data.data || []);
      setMaterials(matRes.data.data || []);
      setVendors(venRes.data.data || []);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to load MPN data', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

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
      // Non-fatal: user can type code manually
    }
  };

  const openEditModal = (row) => {
    setIsEdit(true);
    setFormErrors({});
    setForm({
      _id: row._id,
      mpnCode: row.mpnCode || '',
      mpnName: row.mpnName || '',
      manufacturerName: row.manufacturerName || '',
      materialId: row.materialId?._id || row.materialId || '',
      vendorId: row.vendorId?._id || row.vendorId || '',
      partDescription: row.partDescription || '',
      status: row.status || 'Active',
    });
    setModalOpen(true);
  };

  const closeModal = () => setModalOpen(false);

  // ---------- Form handling ----------
  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const validate = () => {
    const errors = {};
    if (!form.mpnName.trim()) errors.mpnName = 'MPN name is required';
    if (!form.manufacturerName.trim()) errors.manufacturerName = 'Manufacturer is required';
    if (!form.materialId) errors.materialId = 'Please link a Material';
    if (!form.vendorId) errors.vendorId = 'Please link a Vendor';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Save as Draft
  const saveAsDraft = async () => {
    await submit({ ...form, status: 'Draft' }, true);
  };

  const handleSave = async () => {
    if (!validate()) return;
    await submit(form, false);
  };

  const submit = async (payload, isDraft) => {
    try {
      const body = { ...payload };
      delete body._id;

      if (isEdit) {
        await api.put(`/api/mpns/${form._id}`, body);
        showToast('MPN updated successfully');
      } else {
        await api.post('/api/mpns', body);
        showToast(isDraft ? 'Saved as draft' : 'MPN created successfully');
      }
      setModalOpen(false);
      fetchAll();
    } catch (err) {
      showToast(err.response?.data?.error || 'Save failed', 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this MPN record?')) return;
    try {
      await api.delete(`/api/mpns/${id}`);
      showToast('MPN deleted successfully');
      fetchAll();
    } catch (err) {
      showToast(err.response?.data?.error || 'Delete failed', 'error');
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Delete ${selectedIds.length} selected MPN record(s)?`)) return;
    try {
      await api.post('/api/mpns/batch-delete', { ids: selectedIds });
      showToast('Selected MPNs deleted');
      setSelectedIds([]);
      fetchAll();
    } catch (err) {
      showToast(err.response?.data?.error || 'Batch delete failed', 'error');
    }
  };

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

  // ---------- Search / Filter ----------
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const matchesStatus = statusFilter === 'All' || r.status === statusFilter;
      const haystack = [
        r.mpnCode,
        r.mpnName,
        r.manufacturerName,
        r.materialId?.name,
        r.materialId?.code,
        r.vendorId?.name,
        r.vendorId?.company,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const matchesSearch = haystack.includes(search.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [rows, search, statusFilter]);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Active':
        return <Badge variant="success">Active</Badge>;
      case 'Draft':
        return <Badge variant="warning">Draft</Badge>;
      case 'Inactive':
        return <Badge variant="secondary">Inactive</Badge>;
      default:
        return <Badge variant="default">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Toast alert */}
      {toast.show && (
        <div
          className={`p-3 rounded-lg text-xs font-semibold text-white shadow-md flex justify-between items-center ${
            toast.type === 'error' ? 'bg-red-600' : 'bg-emerald-600'
          }`}
        >
          <span>{toast.message}</span>
          <button onClick={() => setToast({ show: false, message: '', type: 'success' })}>✕</button>
        </div>
      )}

      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Cpu className="h-5 w-5 text-blue-600" />
            MPN Master (Manufacturer Part Numbers)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage manufacturer part numbers linked to Materials and Vendors
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {selectedIds.length > 0 && (
            <Button variant="danger" size="sm" onClick={handleBatchDelete}>
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Delete Selected ({selectedIds.length})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={fetchAll}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Refresh
          </Button>
          <Button variant="primary" size="sm" onClick={openAddModal}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add MPN
          </Button>
        </div>
      </div>

      {/* Search & Filter bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            type="text"
            placeholder="Search MPN code, name, manufacturer, material..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <Filter className="h-4 w-4 text-slate-400 shrink-0" />
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 text-xs w-36"
          >
            <option value="All">All Statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Data Table Card */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="w-10 text-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.length > 0 && selectedIds.length === filteredRows.length}
                      onChange={toggleSelectAll}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </TableHead>
                  <TableHead className="font-bold text-xs">MPN Code</TableHead>
                  <TableHead className="font-bold text-xs">MPN Name</TableHead>
                  <TableHead className="font-bold text-xs">Manufacturer</TableHead>
                  <TableHead className="font-bold text-xs">Linked Material</TableHead>
                  <TableHead className="font-bold text-xs">Linked Vendor</TableHead>
                  <TableHead className="font-bold text-xs">Status</TableHead>
                  <TableHead className="font-bold text-xs text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-xs text-slate-400">
                      Loading MPN records...
                    </TableCell>
                  </TableRow>
                ) : filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-xs text-slate-400">
                      No MPN records found matching your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row) => (
                    <TableRow key={row._id} className="hover:bg-slate-50/80 transition-colors">
                      <TableCell className="text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(row._id)}
                          onChange={() => toggleSelectOne(row._id)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs font-bold text-blue-700">
                        {row.mpnCode || '—'}
                      </TableCell>
                      <TableCell className="font-semibold text-xs text-slate-800">
                        {row.mpnName}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600 font-medium">
                        {row.manufacturerName}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">
                        {row.materialId ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-100">
                            {row.materialId.name} ({row.materialId.code})
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">
                        {row.vendorId ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-purple-50 text-purple-700 border border-purple-100">
                            {row.vendorId.name} {row.vendorId.company ? `(${row.vendorId.company})` : ''}
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(row.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end space-x-1">
                          <button
                            onClick={() => openEditModal(row)}
                            className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            title="Edit MPN"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(row._id)}
                            className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Delete MPN"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add / Edit Dialog Modal */}
      <Dialog isOpen={modalOpen} onClose={closeModal} title={isEdit ? 'Edit MPN Record' : 'Register New MPN Record'}>
        <div className="space-y-4 pt-2">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              MPN Code <span className="text-slate-400 font-normal">(Auto-generated)</span>
            </label>
            <Input
              type="text"
              value={form.mpnCode}
              onChange={(e) => handleChange('mpnCode', e.target.value)}
              disabled={isEdit}
              placeholder="e.g. MPN1001"
              className="text-xs font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              MPN Name <span className="text-red-500">*</span>
            </label>
            <Input
              type="text"
              value={form.mpnName}
              onChange={(e) => handleChange('mpnName', e.target.value)}
              placeholder="e.g. High-Temp Ceramic Resistor 10k"
              className="text-xs"
            />
            {formErrors.mpnName && (
              <p className="text-[11px] text-red-500 font-medium mt-1">{formErrors.mpnName}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Manufacturer Name <span className="text-red-500">*</span>
            </label>
            <Input
              type="text"
              value={form.manufacturerName}
              onChange={(e) => handleChange('manufacturerName', e.target.value)}
              placeholder="e.g. Texas Instruments / Murata Manufacturing"
              className="text-xs"
            />
            {formErrors.manufacturerName && (
              <p className="text-[11px] text-red-500 font-medium mt-1">{formErrors.manufacturerName}</p>
            )}
          </div>

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
              onChange={(e) => handleChange('vendorId', e.target.value)}
              className="text-xs"
            >
              <option value="">-- Select Vendor --</option>
              {vendors.map((v) => (
                <option key={v._id} value={v._id}>
                  {v.name} {v.company ? `— ${v.company}` : ''} ({v.vendorId || 'No ID'})
                </option>
              ))}
            </Select>
            {formErrors.vendorId && (
              <p className="text-[11px] text-red-500 font-medium mt-1">{formErrors.vendorId}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Part Description</label>
            <TextArea
              rows={2}
              value={form.partDescription}
              onChange={(e) => handleChange('partDescription', e.target.value)}
              placeholder="Operational notes, datasheets, or quality parameters..."
              className="text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
            <Select
              value={form.status}
              onChange={(e) => handleChange('status', e.target.value)}
              className="text-xs"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-center justify-end space-x-2 pt-4 border-t border-slate-100">
            <Button variant="outline" size="sm" onClick={closeModal}>
              Cancel
            </Button>
            {!isEdit && (
              <Button variant="secondary" size="sm" onClick={saveAsDraft}>
                Save as Draft
              </Button>
            )}
            <Button variant="primary" size="sm" onClick={handleSave}>
              <Save className="h-3.5 w-3.5 mr-1" />
              {isEdit ? 'Update MPN' : 'Save MPN'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
