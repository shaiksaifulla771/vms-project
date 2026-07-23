import React, { useEffect, useState, useRef } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Dialog } from '../components/ui/Dialog';
import { 
  Search, 
  Plus, 
  Trash2, 
  Upload, 
  Database, 
  FileCheck, 
  RefreshCw, 
  FileX, 
  Sparkles, 
  ShieldAlert, 
  X,
  UserCheck,
  Building2,
  Lock,
  Mail,
  Fingerprint
} from 'lucide-react';
import * as XLSX from 'xlsx';

const Vendors = () => {
  const { user } = useAuth();
  
  // Tabs & Views
  const [viewTab, setViewTab] = useState('active'); // 'active' or 'archived'
  
  // Data lists
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  
  // Toast notifications state
  const [toasts, setToasts] = useState([]);

  // Manual Form Dialog
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    Vendor_ID: '',
    Company_Name: '',
    Tax_ID: '',
    Contact_Email: '',
    Status: 'Active'
  });
  const [formErrors, setFormErrors] = useState({});
  const [submitLoading, setSubmitLoading] = useState(false);

  // Bulk Upload Dialog & States
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [bulkErrors, setBulkErrors] = useState([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const fileInputRef = useRef(null);

  const showToast = (message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev.slice(-4), { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/vendor-masters', {
        params: { view: viewTab }
      });
      if (res.data && res.data.success) {
        setRecords(res.data.data);
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to fetch vendor directory.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [viewTab]);

  const handleInputBlur = async (field, value) => {
    if (!value || !value.trim()) return;

    try {
      const payload = { [field]: value.trim() };
      if (editingId) {
        payload.excludeId = editingId;
      }

      const res = await api.post('/api/vendor-masters/check-duplicate', payload);
      if (res.data && res.data.exists) {
        setFormErrors(prev => ({
          ...prev,
          [field]: res.data.message
        }));
        showToast(res.data.message, 'error');
      } else {
        setFormErrors(prev => {
          const next = { ...prev };
          delete next[field];
          return next;
        });
      }
    } catch (err) {
      console.error('Focus-loss duplicate validation check failed:', err);
    }
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    
    // Check if any errors are already flagged by onBlur
    if (Object.keys(formErrors).length > 0) {
      const firstErr = Object.values(formErrors)[0];
      showToast(firstErr, 'error');
      return;
    }

    setSubmitLoading(true);
    try {
      if (editingId) {
        const res = await api.put(`/api/vendor-masters/${editingId}`, formData);
        if (res.data && res.data.success) {
          showToast(`Vendor ${formData.Company_Name} updated successfully.`, 'success');
          setIsFormOpen(false);
          fetchData();
        }
      } else {
        const res = await api.post('/api/vendor-masters', formData);
        if (res.data && res.data.success) {
          showToast(`Vendor ${formData.Company_Name} registered successfully.`, 'success');
          setIsFormOpen(false);
          fetchData();
        }
      }
    } catch (err) {
      console.error(err);
      const errorMsg = err.response?.data?.error || 'Database operation failed.';
      showToast(errorMsg, 'error');
      setFormErrors({ form: errorMsg });
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleOpenAddModal = () => {
    setEditingId(null);
    setFormData({
      Vendor_ID: '',
      Company_Name: '',
      Tax_ID: '',
      Contact_Email: '',
      Status: 'Active'
    });
    setFormErrors({});
    setIsFormOpen(true);
  };

  const handleOpenEditModal = (rec) => {
    setEditingId(rec._id);
    setFormData({
      Vendor_ID: rec.Vendor_ID,
      Company_Name: rec.Company_Name,
      Tax_ID: rec.Tax_ID,
      Contact_Email: rec.Contact_Email,
      Status: rec.Status
    });
    setFormErrors({});
    setIsFormOpen(true);
  };

  const handleSoftDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to archive/soft-delete vendor "${name}"?`)) return;

    try {
      await api.delete(`/api/vendor-masters/${id}`);
      showToast(`Vendor "${name}" moved to Archived repository.`, 'success');
      fetchData();
    } catch (err) {
      console.error(err);
      showToast('Failed to archive vendor.', 'error');
    }
  };

  const handleRestore = async (id, name) => {
    try {
      await api.patch(`/api/vendor-masters/${id}/restore`);
      showToast(`Vendor "${name}" restored back to active database.`, 'success');
      fetchData();
    } catch (err) {
      console.error(err);
      showToast('Failed to restore vendor.', 'error');
    }
  };

  // Drag and Drop files handlers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (file) => {
    const isExcel = file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || file.name.endsWith('.xlsx');
    const isCsv = file.type === 'text/csv' || file.name.endsWith('.csv');

    if (!isExcel && !isCsv) {
      showToast('Invalid file format. Please upload .xlsx or .csv files.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        if (jsonData.length === 0) {
          showToast('Uploaded spreadsheet contains no data rows.', 'error');
          return;
        }

        // Standardize headers
        const normalizedRows = jsonData.map(row => ({
          Vendor_ID: row['Vendor_ID'] || row['Vendor ID'] || row['VendorCode'] || row['vendor_id'] || '',
          Company_Name: row['Company_Name'] || row['Company Name'] || row['Company'] || row['company_name'] || '',
          Tax_ID: row['Tax_ID'] || row['Tax ID'] || row['GSTIN'] || row['tax_id'] || '',
          Contact_Email: row['Contact_Email'] || row['Contact Email'] || row['Email'] || row['contact_email'] || '',
          Status: row['Status'] || row['status'] || 'Active'
        }));

        setBulkLoading(true);
        setBulkErrors([]);

        try {
          const res = await api.post('/api/vendor-masters/bulk', { rows: normalizedRows });
          if (res.data && res.data.success) {
            showToast(`Upload complete: Ingested ${res.data.count} vendors successfully.`, 'success');
            setIsUploadOpen(false);
            fetchData();
          }
        } catch (err) {
          console.error(err);
          const itemized = err.response?.data?.itemizedErrors || [];
          if (itemized.length > 0) {
            setBulkErrors(itemized);
            showToast('Upload blocked due to database duplicate intersections.', 'error');
          } else {
            showToast(err.response?.data?.error || 'Validation check failed.', 'error');
          }
        } finally {
          setBulkLoading(false);
        }
      } catch (err) {
        console.error(err);
        showToast('Error parsing file content.', 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const downloadSampleTemplate = () => {
    const sampleData = [
      {
        'Vendor_ID': 'VND-2026-001',
        'Company_Name': 'Relational Materials Corp',
        'Tax_ID': '27ABCDE1234F1Z5',
        'Contact_Email': 'sourcing@relationalcorp.com',
        'Status': 'Active'
      },
      {
        'Vendor_ID': 'VND-2026-002',
        'Company_Name': 'Apex Logistic Solutions',
        'Tax_ID': '27FGHIJ5678K2Z9',
        'Contact_Email': 'ops@apexlogistics.com',
        'Status': 'Active'
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Vendor Master');
    XLSX.writeFile(workbook, 'vendor_master_template.xlsx');
    showToast('Download complete: vendor_master_template.xlsx', 'success');
  };

  // Search & filter computations
  const filteredRecords = records.filter(rec => {
    const matchSearch = 
      (rec.Vendor_ID || '').toLowerCase().includes(search.toLowerCase()) ||
      (rec.Company_Name || '').toLowerCase().includes(search.toLowerCase()) ||
      (rec.Tax_ID || '').toLowerCase().includes(search.toLowerCase()) ||
      (rec.Contact_Email || '').toLowerCase().includes(search.toLowerCase());
    
    const matchStatus = statusFilter === '' || rec.Status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-6">
      {/* Toast Alert Popups */}
      <div className="fixed top-5 right-5 z-50 flex flex-col space-y-2 pointer-events-none max-w-sm w-full">
        {toasts.map(toast => (
          <div 
            key={toast.id} 
            className={`p-3.5 rounded-lg border shadow-lg flex items-start space-x-2.5 transition-all duration-300 animate-slide-in pointer-events-auto ${
              toast.type === 'error' 
                ? 'bg-rose-50 border-rose-200 text-rose-800' 
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}
          >
            <ShieldAlert className={`h-4.5 w-4.5 shrink-0 mt-0.5 ${toast.type === 'error' ? 'text-rose-500' : 'text-emerald-500'}`} />
            <div className="flex-1 text-xs font-semibold leading-relaxed">
              {toast.message}
            </div>
            <button 
              onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
              className="text-slate-400 hover:text-slate-600 transition-colors shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Main Top Header Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 text-white rounded-2xl p-5 flex flex-col justify-between shadow-md relative overflow-hidden group">
          <div className="absolute right-0 bottom-0 translate-x-3 translate-y-3 opacity-10 group-hover:scale-110 transition-transform duration-300 text-white">
            <Database className="h-28 w-28" />
          </div>
          <span className="text-[10px] text-blue-400 font-extrabold uppercase tracking-wider block">Registry View</span>
          <div className="mt-2.5 flex items-baseline space-x-1.5">
            <span className="text-3xl font-extrabold">{viewTab === 'active' ? 'Active List' : 'Archive List'}</span>
          </div>
          <span className="text-[10px] text-slate-400 font-medium block mt-1">Dual-check engine validation enabled</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between shadow-xs relative overflow-hidden group">
          <div className="absolute right-0 bottom-0 translate-x-3 translate-y-3 opacity-5 group-hover:scale-110 transition-transform duration-300 text-slate-900">
            <UserCheck className="h-28 w-28" />
          </div>
          <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Database Records</span>
          <div className="mt-2.5 flex items-baseline space-x-1.5">
            <span className="text-3xl font-extrabold text-slate-800">{filteredRecords.length}</span>
            <span className="text-xs font-bold text-slate-500">vendors</span>
          </div>
          <span className="text-[10px] text-slate-400 font-medium block mt-1">Found matching current filter states</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between shadow-xs relative overflow-hidden group">
          <div className="absolute right-0 bottom-0 translate-x-3 translate-y-3 opacity-5 group-hover:scale-110 transition-transform duration-300 text-slate-900">
            <Sparkles className="h-28 w-28" />
          </div>
          <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Core Engine Status</span>
          <div className="mt-2.5 flex items-center space-x-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-sm font-extrabold text-slate-800">DUAL-CHECK ACTIVE</span>
          </div>
          <span className="text-[10px] text-slate-400 font-medium block mt-1">Scanning active and soft-deleted states</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between shadow-xs relative overflow-hidden group">
          <div className="absolute right-0 bottom-0 translate-x-3 translate-y-3 opacity-5 group-hover:scale-110 transition-transform duration-300 text-slate-900">
            <FileCheck className="h-28 w-28" />
          </div>
          <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Relational Schema</span>
          <div className="mt-2.5 flex items-baseline space-x-1.5">
            <span className="text-sm font-extrabold text-blue-600 uppercase">vendor_master</span>
          </div>
          <span className="text-[10px] text-slate-400 font-medium block mt-1">Soft-delete (is_deleted 0/1) logic enabled</span>
        </div>
      </div>

      {/* Toolbar & Filter Options */}
      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-1 border border-slate-200 rounded-xl p-1 bg-slate-50/50">
            <button
              onClick={() => setViewTab('active')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewTab === 'active' 
                  ? 'bg-white text-slate-800 shadow-sm border border-slate-200' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Vendor Directory
            </button>
            <button
              onClick={() => setViewTab('archived')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewTab === 'archived' 
                  ? 'bg-white text-slate-800 shadow-sm border border-slate-200' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Archived / Deleted
            </button>
          </div>

          <div className="flex-1 max-w-sm relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by ID, company, email, tax..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              <option value="">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Draft">Draft</option>
            </select>

            <Button onClick={() => setIsUploadOpen(true)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center space-x-1 rounded-xl">
              <Upload className="h-3.5 w-3.5" />
              <span>Bulk Upload</span>
            </Button>

            <Button onClick={handleOpenAddModal} className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center space-x-1 rounded-xl">
              <Plus className="h-4 w-4" />
              <span>Add Vendor</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Main Vendor directory list table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center p-20 space-y-3">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
              <p className="text-xs text-slate-400 font-medium">Scanning relational records...</p>
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="p-20 text-center text-slate-400 text-xs font-semibold italic">
              No vendor records matching the filters found.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor ID</TableHead>
                  <TableHead>Company Name</TableHead>
                  <TableHead>Tax ID (GSTIN)</TableHead>
                  <TableHead>Contact Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecords.map((rec) => (
                  <TableRow key={rec._id}>
                    <TableCell className="font-mono text-xs font-bold text-blue-600 uppercase">
                      {rec.Vendor_ID}
                    </TableCell>
                    <TableCell className="font-extrabold text-slate-700">
                      {rec.Company_Name}
                    </TableCell>
                    <TableCell className="font-mono text-xs font-bold text-slate-500 uppercase">
                      {rec.Tax_ID}
                    </TableCell>
                    <TableCell className="text-slate-600 text-xs font-semibold">
                      {rec.Contact_Email}
                    </TableCell>
                    <TableCell>
                      <Badge className={
                        rec.Status === 'Active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        rec.Status === 'Inactive' ? 'bg-slate-50 text-slate-600 border-slate-200' :
                        'bg-blue-50 text-blue-700 border-blue-200'
                      }>
                        {rec.Status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {viewTab === 'active' ? (
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => handleOpenEditModal(rec)}
                            className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            title="Edit details"
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleSoftDelete(rec._id, rec.Company_Name)}
                            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="Archive / Soft-Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end">
                          <button
                            onClick={() => handleRestore(rec._id, rec.Company_Name)}
                            className="bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 font-extrabold px-3 py-1 rounded-lg text-[10px] flex items-center space-x-1 transition-all"
                            title="Restore to Active Database"
                          >
                            <RefreshCw className="h-3 w-3" />
                            <span>Restore</span>
                          </button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog Form for Manual Registry */}
      <Dialog
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingId ? 'Edit Relational Vendor Record' : 'Register New Relational Vendor'}
      >
        <form onSubmit={handleFormSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col space-y-1.5">
              <label className="text-[11px] font-bold text-slate-600 uppercase flex items-center space-x-1">
                <Fingerprint className="h-3 w-3 text-slate-400" />
                <span>Vendor ID *</span>
              </label>
              <input
                type="text"
                value={formData.Vendor_ID}
                onChange={(e) => setFormData({ ...formData, Vendor_ID: e.target.value.toUpperCase() })}
                onBlur={(e) => handleInputBlur('Vendor_ID', e.target.value)}
                className={`px-3 py-2 bg-white border rounded-xl text-xs font-semibold focus:outline-none transition-all ${
                  formErrors.Vendor_ID ? 'border-rose-300 focus:ring-1 focus:ring-rose-500' : 'border-slate-200 focus:ring-1 focus:ring-blue-500'
                }`}
                placeholder="e.g. VND-2026-001"
                required
              />
              {formErrors.Vendor_ID && (
                <span className="text-[10px] font-bold text-rose-600 mt-1 block">{formErrors.Vendor_ID}</span>
              )}
            </div>

            <div className="flex flex-col space-y-1.5">
              <label className="text-[11px] font-bold text-slate-600 uppercase flex items-center space-x-1">
                <Building2 className="h-3 w-3 text-slate-400" />
                <span>Company Name *</span>
              </label>
              <input
                type="text"
                value={formData.Company_Name}
                onChange={(e) => setFormData({ ...formData, Company_Name: e.target.value })}
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="e.g. Relational Corp"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col space-y-1.5">
              <label className="text-[11px] font-bold text-slate-600 uppercase flex items-center space-x-1">
                <Lock className="h-3 w-3 text-slate-400" />
                <span>Tax ID (GSTIN) *</span>
              </label>
              <input
                type="text"
                value={formData.Tax_ID}
                onChange={(e) => setFormData({ ...formData, Tax_ID: e.target.value.toUpperCase() })}
                onBlur={(e) => handleInputBlur('Tax_ID', e.target.value)}
                className={`px-3 py-2 bg-white border rounded-xl text-xs font-semibold focus:outline-none transition-all ${
                  formErrors.Tax_ID ? 'border-rose-300 focus:ring-1 focus:ring-rose-500' : 'border-slate-200 focus:ring-1 focus:ring-blue-500'
                }`}
                placeholder="e.g. 27ABCDE1234F1Z5"
                required
              />
              {formErrors.Tax_ID && (
                <span className="text-[10px] font-bold text-rose-600 mt-1 block">{formErrors.Tax_ID}</span>
              )}
            </div>

            <div className="flex flex-col space-y-1.5">
              <label className="text-[11px] font-bold text-slate-600 uppercase flex items-center space-x-1">
                <Mail className="h-3 w-3 text-slate-400" />
                <span>Contact Email *</span>
              </label>
              <input
                type="email"
                value={formData.Contact_Email}
                onChange={(e) => setFormData({ ...formData, Contact_Email: e.target.value.toLowerCase() })}
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                placeholder="e.g. contact@company.com"
                required
              />
            </div>
          </div>

          <div className="flex flex-col space-y-1.5">
            <label className="text-[11px] font-bold text-slate-600 uppercase">Registry Status</label>
            <select
              value={formData.Status}
              onChange={(e) => setFormData({ ...formData, Status: e.target.value })}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 font-semibold focus:outline-none h-9 cursor-pointer"
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Draft">Draft</option>
            </select>
          </div>

          <div className="pt-2 flex items-center justify-end space-x-2 border-t border-slate-100 mt-5">
            <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={submitLoading} className="bg-blue-600 text-white font-bold rounded-xl px-4 py-2">
              {editingId ? 'Apply Changes' : 'Register Vendor'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Dialog for Bulk Spreadsheet Upload */}
      <Dialog
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        title="Ingest Bulk Spreadsheet Data"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b pb-2 mb-2">
            <span className="text-[10px] text-slate-400 font-bold block uppercase">Drag & Drop Upload Zone</span>
            <button
              onClick={downloadSampleTemplate}
              className="text-[10px] text-blue-600 hover:text-blue-800 font-bold underline"
            >
              Download Sample template
            </button>
          </div>

          {/* Itemized error logs panel */}
          {bulkErrors.length > 0 && (
            <div className="border border-rose-200 bg-rose-50/50 rounded-xl p-3.5 space-y-2.5 max-h-[30vh] overflow-y-auto">
              <div className="flex items-center space-x-1.5 text-rose-800 font-extrabold text-xs">
                <FileX className="h-4.5 w-4.5 text-rose-600" />
                <span>Bulk Upload Intercepted: Ingestion Blocked</span>
              </div>
              <p className="text-[10px] text-slate-500 font-semibold leading-relaxed">
                The duplication validation engine caught conflicting entries in the uploaded file against the active grid and soft-deleted history. The entire batch has been blocked.
              </p>
              <div className="border rounded-lg overflow-hidden bg-white">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-rose-50/20">
                      <TableHead className="!py-1.5 !text-[9px] font-bold text-rose-900">Row #</TableHead>
                      <TableHead className="!py-1.5 !text-[9px] font-bold text-rose-900">Vendor ID</TableHead>
                      <TableHead className="!py-1.5 !text-[9px] font-bold text-rose-900">Tax ID</TableHead>
                      <TableHead className="!py-1.5 !text-[9px] font-bold text-rose-900">Conflict Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bulkErrors.map((err, i) => (
                      <TableRow key={i}>
                        <TableCell className="!py-1 text-[10px] font-mono font-bold">{err.row}</TableCell>
                        <TableCell className="!py-1 text-[10px] font-mono font-semibold">{err.Vendor_ID}</TableCell>
                        <TableCell className="!py-1 text-[10px] font-mono font-semibold">{err.Tax_ID}</TableCell>
                        <TableCell className="!py-1 text-[10px] font-bold text-rose-600">{err.error}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Drag & Drop Area */}
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-10 text-center flex flex-col items-center justify-center space-y-3.5 transition-all cursor-pointer ${
              isDragActive 
                ? 'border-blue-500 bg-blue-50/40' 
                : 'border-slate-200 hover:border-slate-400 bg-slate-50/50 hover:bg-slate-50'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".xlsx,.csv"
              className="hidden"
            />
            <div className="p-3.5 rounded-full bg-slate-100 text-slate-500">
              <Upload className="h-7 w-7" />
            </div>
            <div>
              <p className="text-xs font-extrabold text-slate-800">
                Drag and drop your spreadsheet here, or click to browse
              </p>
              <p className="text-[10px] text-slate-400 font-medium mt-1">
                Supports Excel (.xlsx) or CSV files
              </p>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end space-x-2 border-t border-slate-100 mt-5">
            <Button type="button" variant="outline" onClick={() => setIsUploadOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Dialog>

    </div>
  );
};

export default Vendors;
