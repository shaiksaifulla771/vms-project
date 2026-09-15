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
  Fingerprint,
  CheckCircle,
  Briefcase
} from 'lucide-react';
import * as XLSX from 'xlsx';

// Department & Role dictionary mapping rules
const DEPARTMENT_ROLE_MAP = {
  Procurement: ['Buyer', 'Procurement Manager', 'Sourcing Specialist'],
  Finance: ['Billing Clerk', 'Accounts Payable Analyst', 'Financial Controller'],
  IT: ['System Administrator', 'Security Engineer', 'IT Support'],
  Logistics: ['Supply Chain Coordinator', 'Warehouse Manager', 'Dispatcher'],
  Legal: ['Compliance Officer', 'Legal Counsel', 'Contract Administrator']
};

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
    Department: '',
    Role: '',
    Status: 'Active',
    contacts: []
  });
  const [formErrors, setFormErrors] = useState({});
  const [submitLoading, setSubmitLoading] = useState(false);

  // Bulk Upload Dialog & States
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  
  // Bulk Preview & Filter States
  const [previewRows, setPreviewRows] = useState([]);
  const [bulkSearch, setBulkSearch] = useState('');
  const [showErrorsOnly, setShowErrorsOnly] = useState(false);
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
        
        // Show prominent red / orange toast notifications matching rules
        if (res.data.state === 'active') {
          showToast(res.data.message, 'error'); // Red error toast
        } else {
          showToast(res.data.message, 'warning'); // Orange warning toast
        }
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

    // Capture the primary contact (or first contact) details to sync with root fields
    const primaryContact = (formData.contacts || []).find(c => c.role && c.role.toLowerCase().includes('manager')) || (formData.contacts || [])[0];
    
    const rootEmail = primaryContact ? (primaryContact.email || '').trim().toLowerCase() : formData.Contact_Email.trim().toLowerCase();
    const rootDept = primaryContact ? (primaryContact.department || '') : formData.Department;
    const rootRole = primaryContact ? (primaryContact.role || '') : formData.Role;

    const payload = {
      ...formData,
      Contact_Email: rootEmail,
      Department: rootDept,
      Role: rootRole
    };

    setSubmitLoading(true);
    try {
      if (editingId) {
        const res = await api.put(`/api/vendor-masters/${editingId}`, payload);
        if (res.data && res.data.success) {
          showToast(`Vendor ${formData.Company_Name} updated successfully.`, 'success');
          setIsFormOpen(false);
          fetchData();
        }
      } else {
        const res = await api.post('/api/vendor-masters', payload);
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
      Department: '',
      Role: '',
      Status: 'Active',
      contacts: []
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
      Department: rec.Department || '',
      Role: rec.Role || '',
      Status: rec.Status,
      contacts: (rec.contacts || []).map(c => ({
        role: c.role || '',
        department: c.department || '',
        name: c.name || '',
        phone: c.phone || '',
        email: c.email || ''
      }))
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

  // Contacts Directory Form Helpers
  const handleAddContact = () => {
    setFormData(prev => ({
      ...prev,
      contacts: [...prev.contacts, { role: '', department: '', name: '', phone: '', email: '' }]
    }));
  };

  const handleRemoveContact = (idx) => {
    setFormData(prev => {
      const updated = [...prev.contacts];
      updated.splice(idx, 1);
      return { ...prev, contacts: updated };
    });
  };

  const handleContactChange = (idx, field, value) => {
    setFormData(prev => {
      const updated = [...prev.contacts];
      const contact = { ...updated[idx], [field]: value };
      
      // If department changed, reset role since roles are cascading dependent
      if (field === 'department') {
        contact.role = '';
      }
      
      updated[idx] = contact;
      return { ...prev, contacts: updated };
    });
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
          Department: row['Department'] || row['department'] || '',
          Role: row['Role'] || row['role'] || '',
          Status: row['Status'] || row['status'] || 'Active'
        }));

        setBulkLoading(true);
        try {
          const res = await api.post('/api/vendor-masters/validate-batch', { rows: normalizedRows });
          if (res.data && res.data.success) {
            setPreviewRows(res.data.validatedRows);
            showToast('Spreadsheet parsed. Please review conflicts.', 'success');
          }
        } catch (err) {
          console.error(err);
          showToast('Error validating spreadsheet records.', 'error');
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

  const handleCommitBulkUpdate = async () => {
    // Verification check: disable ingestion if any invalid rows remain
    const hasConflicts = previewRows.some(row => row.state !== 'valid');
    if (hasConflicts) {
      showToast('Validation Block: Resolve all duplicate rows in the preview before committing.', 'error');
      return;
    }

    setBulkLoading(true);
    try {
      const res = await api.post('/api/vendor-masters/bulk', { rows: previewRows });
      if (res.data && res.data.success) {
        showToast(`Ingested ${res.data.count} records successfully!`, 'success');
        setIsUploadOpen(false);
        setPreviewRows([]);
        setBulkSearch('');
        setShowErrorsOnly(false);
        fetchData();
      }
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.error || 'Ingestion engine failure.', 'error');
    } finally {
      setBulkLoading(false);
    }
  };

  const downloadSampleTemplate = () => {
    const sampleData = [
      {
        'Vendor_ID': 'VND-2026-901',
        'Company_Name': 'Sourcing Master Co',
        'Tax_ID': '27ABCDE1234F1Z5',
        'Contact_Email': 'ops@sourcingmaster.com',
        'Department': 'Procurement',
        'Role': 'Sourcing Specialist',
        'Status': 'Active'
      },
      {
        'Vendor_ID': 'VND-2026-902',
        'Company_Name': 'Apex Legal Advisory',
        'Tax_ID': '27FGHIJ5678K2Z9',
        'Contact_Email': 'compliance@apexlegal.com',
        'Department': 'Legal',
        'Role': 'Compliance Officer',
        'Status': 'Active'
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Vendor Master');
    XLSX.writeFile(workbook, 'vendor_master_relational_template.xlsx');
    showToast('Download complete: vendor_master_relational_template.xlsx', 'success');
  };

  // Profile PDF Generation (Completely expunges Key Department Contacts)
  const handlePrintPdf = (rec) => {
    const displayVal = (val) => {
      if (val === undefined || val === null || (typeof val === 'string' && val.trim() === '') || val === false) {
        return '<span style="color: #94a3b8; font-style: italic; font-weight: normal;">[Not Filled]</span>';
      }
      if (val === true) {
        return '<span style="color: #10b981; font-weight: bold;">Yes</span>';
      }
      return val;
    };

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>Vendor Profile - ${rec.Company_Name || rec.Vendor_ID}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #1e293b; margin: 0; }
            .header { border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
            .title { font-size: 18px; font-weight: bold; color: #0f172a; }
            .subtitle { font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; font-weight: bold; }
            .section-title { font-size: 11px; font-weight: bold; color: #1e3a8a; text-transform: uppercase; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin-top: 20px; margin-bottom: 12px; }
            .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }
            .field { display: flex; flex-direction: column; gap: 3px; }
            .label { font-size: 9px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.02em; }
            .value { font-size: 11px; color: #0f172a; font-weight: bold; padding: 6px 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; }
            .footer { border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 8px; color: #94a3b8; text-align: center; margin-top: 40px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="subtitle">Enterprise Resource Planning Portal</div>
              <div class="title">Vendor Sourcing Record</div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 12px; font-weight: bold; color: #2563eb;">VENDOR ID: ${rec.Vendor_ID}</div>
              <div style="font-size: 9px; color: #94a3b8; margin-top: 2px;">Date Generated: ${new Date().toLocaleDateString()}</div>
            </div>
          </div>

          <!-- Section 1: Basic Information -->
          <div class="section-title">1. Basic Information</div>
          <div class="grid">
            <div class="field">
              <div class="label">Company Name</div>
              <div class="value">${displayVal(rec.Company_Name)}</div>
            </div>
            <div class="field">
              <div class="label">Tax ID (GSTIN)</div>
              <div class="value">${displayVal(rec.Tax_ID)}</div>
            </div>
            <div class="field">
              <div class="label">Contact Email</div>
              <div class="value" style="font-family: monospace;">${displayVal(rec.Contact_Email)}</div>
            </div>
            <div class="field">
              <div class="label">Primary Department</div>
              <div class="value">${displayVal(rec.Department)}</div>
            </div>
            <div class="field">
              <div class="label">Primary Role</div>
              <div class="value">${displayVal(rec.Role)}</div>
            </div>
            <div class="field">
              <div class="label">Status</div>
              <div class="value">${displayVal(rec.Status)}</div>
            </div>
          </div>

          <!-- Section 2: Contacts Directory -->
          <div class="section-title">2. Contacts Directory</div>
          ${rec.contacts && rec.contacts.length > 0 ? `
            <table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px;">
              <thead>
                <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0; text-align: left;">
                  <th style="padding: 8px; font-weight: 700; text-transform: uppercase; color: #64748b;">Name</th>
                  <th style="padding: 8px; font-weight: 700; text-transform: uppercase; color: #64748b;">Phone</th>
                  <th style="padding: 8px; font-weight: 700; text-transform: uppercase; color: #64748b;">Email</th>
                  <th style="padding: 8px; font-weight: 700; text-transform: uppercase; color: #64748b;">Department</th>
                  <th style="padding: 8px; font-weight: 700; text-transform: uppercase; color: #64748b;">Role</th>
                </tr>
              </thead>
              <tbody>
                ${rec.contacts.map(c => `
                  <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 8px; font-weight: bold; color: #0f172a;">${c.name || '-'}</td>
                    <td style="padding: 8px; font-family: monospace;">${c.phone || '-'}</td>
                    <td style="padding: 8px; font-family: monospace;">${c.email || '-'}</td>
                    <td style="padding: 8px; font-weight: 600; color: #475569;">${c.department || '-'}</td>
                    <td style="padding: 8px; font-weight: 600; color: #475569;">${c.role || '-'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : `
            <div style="font-size: 11px; color: #94a3b8; font-style: italic; padding: 10px 0;">No additional contact representatives registered in the directory.</div>
          `}

          <!-- System-wide Removal: 'Key Department Contacts' block is completely expunged from PDF layout -->

          <div class="footer">
            ERP Portal Vendor Profile Document. Confidential & Internal Use Only.
          </div>

          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Search & filter computations for main directory view
  const filteredRecords = records.filter(rec => {
    const matchSearch = 
      (rec.Vendor_ID || '').toLowerCase().includes(search.toLowerCase()) ||
      (rec.Company_Name || '').toLowerCase().includes(search.toLowerCase()) ||
      (rec.Tax_ID || '').toLowerCase().includes(search.toLowerCase()) ||
      (rec.Contact_Email || '').toLowerCase().includes(search.toLowerCase());
    
    const matchStatus = statusFilter === '' || rec.Status === statusFilter;
    return matchSearch && matchStatus;
  });

  // Bulk Upload Preview Live Filtering Computations
  const filteredPreviewRows = previewRows.filter(row => {
    const matchSearch = 
      (row.Vendor_ID || '').toLowerCase().includes(bulkSearch.toLowerCase()) ||
      (row.Company_Name || '').toLowerCase().includes(bulkSearch.toLowerCase()) ||
      (row.Tax_ID || '').toLowerCase().includes(bulkSearch.toLowerCase());

    const matchErrorOnly = !showErrorsOnly || row.state !== 'valid';
    return matchSearch && matchErrorOnly;
  });

  const previewHasErrors = previewRows.some(row => row.state !== 'valid');

  return (
    <div className="space-y-6">
      {/* Toast Alert Popups (Red for active conflict, orange for archived warning, green success) */}
      <div className="fixed top-5 right-5 z-50 flex flex-col space-y-2 pointer-events-none max-w-sm w-full">
        {toasts.map(toast => (
          <div 
            key={toast.id} 
            className={`p-3.5 rounded-lg border shadow-lg flex items-start space-x-2.5 transition-all duration-300 animate-slide-in pointer-events-auto ${
              toast.type === 'error' 
                ? 'bg-rose-50 border-rose-200 text-rose-800' 
                : toast.type === 'warning'
                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}
          >
            <ShieldAlert className={`h-4.5 w-4.5 shrink-0 mt-0.5 ${
              toast.type === 'error' ? 'text-rose-500' : toast.type === 'warning' ? 'text-amber-500' : 'text-emerald-500'
            }`} />
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
              <span>Bulk Update</span>
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
              <TableHeader className="sticky top-0 z-10 bg-white shadow-sm">
                <TableRow>
                  <TableHead>Vendor ID</TableHead>
                  <TableHead>Company Name</TableHead>
                  <TableHead>Tax ID (GSTIN)</TableHead>
                  <TableHead>Primary Department</TableHead>
                  <TableHead>Primary Role</TableHead>
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
                      {rec.Department || <span className="text-slate-300 italic">None</span>}
                    </TableCell>
                    <TableCell className="text-slate-600 text-xs font-semibold">
                      {rec.Role || <span className="text-slate-300 italic">None</span>}
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
                            onClick={() => handlePrintPdf(rec)}
                            className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                            title="Print PDF Profile"
                          >
                            <FileCheck className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleOpenEditModal(rec)}
                            className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            title="Edit details"
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleSoftDelete(rec._id, rec.Company_Name)}
                            className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Soft Delete Vendor"
                          >
                            <Trash2 className="h-4 w-4" />
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
                required={formData.contacts.length === 0}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
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

            <div className="flex flex-col space-y-1.5">
              <label className="text-[11px] font-bold text-slate-600 uppercase">Primary Contact Department</label>
              <select
                value={formData.Department}
                onChange={(e) => setFormData({ ...formData, Department: e.target.value, Role: '' })}
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 font-semibold focus:outline-none h-9 cursor-pointer"
              >
                <option value="">Choose Department</option>
                <option value="Procurement">Procurement</option>
                <option value="Finance">Finance</option>
                <option value="IT">IT</option>
                <option value="Logistics">Logistics</option>
                <option value="Legal">Legal</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col space-y-1.5">
            <label className="text-[11px] font-bold text-slate-600 uppercase">Primary Contact Role</label>
            <select
              value={formData.Role}
              onChange={(e) => setFormData({ ...formData, Role: e.target.value })}
              disabled={!formData.Department}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 font-semibold focus:outline-none h-9 cursor-pointer disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
            >
              <option value="">Choose Role</option>
              {formData.Department && DEPARTMENT_ROLE_MAP[formData.Department]?.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          {/* Section 2: Contacts Directory Card Lists with Cascading drop downs */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs mt-4">
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex items-center justify-between">
              <h4 className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Contacts Directory</h4>
              <button
                type="button"
                onClick={handleAddContact}
                className="text-[10px] text-blue-600 hover:text-blue-800 font-extrabold"
              >
                + Add Contact Representative
              </button>
            </div>
            <div className="p-4 bg-white space-y-4 max-h-[30vh] overflow-y-auto">
              {formData.contacts.length === 0 && (
                <p className="text-xs text-slate-400 italic text-center py-4">No contact representatives added yet.</p>
              )}
              {formData.contacts.map((contact, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200 items-end">
                  <div className="col-span-2 flex flex-col space-y-1">
                    <label className="text-[9px] font-bold text-slate-500 uppercase">Department</label>
                    <select
                      value={contact.department}
                      onChange={(e) => handleContactChange(idx, 'department', e.target.value)}
                      className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] text-slate-800 focus:outline-none cursor-pointer h-8"
                    >
                      <option value="">Select</option>
                      <option value="Procurement">Procurement</option>
                      <option value="Finance">Finance</option>
                      <option value="IT">IT</option>
                      <option value="Logistics">Logistics</option>
                      <option value="Legal">Legal</option>
                    </select>
                  </div>

                  <div className="col-span-2 flex flex-col space-y-1">
                    <label className="text-[9px] font-bold text-slate-500 uppercase">Role</label>
                    <select
                      value={contact.role}
                      onChange={(e) => handleContactChange(idx, 'role', e.target.value)}
                      disabled={!contact.department}
                      className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] text-slate-800 focus:outline-none cursor-pointer disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed h-8"
                    >
                      <option value="">Select</option>
                      {contact.department && DEPARTMENT_ROLE_MAP[contact.department]?.map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>

                  <div className="col-span-3 flex flex-col space-y-1">
                    <label className="text-[9px] font-bold text-slate-500 uppercase">Name</label>
                    <input
                      type="text"
                      value={contact.name}
                      onChange={(e) => handleContactChange(idx, 'name', e.target.value)}
                      placeholder="Name"
                      className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px] text-slate-800 focus:outline-none h-8"
                    />
                  </div>

                  <div className="col-span-2 flex flex-col space-y-1">
                    <label className="text-[9px] font-bold text-slate-500 uppercase">Phone</label>
                    <input
                      type="text"
                      value={contact.phone}
                      onChange={(e) => handleContactChange(idx, 'phone', e.target.value)}
                      placeholder="Phone"
                      className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px] text-slate-800 focus:outline-none h-8 font-mono"
                    />
                  </div>

                  <div className="col-span-2 flex flex-col space-y-1">
                    <label className="text-[9px] font-bold text-slate-500 uppercase">Email</label>
                    <input
                      type="email"
                      value={contact.email}
                      onChange={(e) => handleContactChange(idx, 'email', e.target.value)}
                      placeholder="Email"
                      className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px] text-slate-800 focus:outline-none h-8 font-mono"
                    />
                  </div>

                  <div className="col-span-1 flex justify-center pb-1">
                    <button
                      type="button"
                      onClick={() => handleRemoveContact(idx)}
                      className="text-rose-500 hover:text-rose-700 text-xs font-bold"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
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

      {/* Dialog for Bulk Spreadsheet Upload with Real-time Search & Filter Preview Table */}
      <Dialog
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        title="Ingest Bulk Spreadsheet Data"
      >
        <div className="space-y-4 max-w-4xl">
          <div className="flex items-center justify-between border-b pb-2 mb-2">
            <span className="text-[10px] text-slate-400 font-bold block uppercase">Drag & Drop Upload Zone</span>
            <button
              onClick={downloadSampleTemplate}
              className="text-[10px] text-blue-600 hover:text-blue-800 font-bold underline"
            >
              Download Sample Template
            </button>
          </div>

          {/* Drag & Drop Area (Only visible when no preview is loaded) */}
          {previewRows.length === 0 && (
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
          )}

          {/* Integrated Real-Time Preview Table & Filtering Tools */}
          {previewRows.length > 0 && (
            <div className="space-y-3">
              {/* Responsive Search Bar & Count Badge */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search preview by Vendor ID, Company Name, or Tax ID..."
                    value={bulkSearch}
                    onChange={(e) => setBulkSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-slate-200 bg-white rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                
                <div className="flex items-center space-x-3 shrink-0">
                  {/* Validation errors check */}
                  <label className="flex items-center space-x-2 text-xs font-bold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showErrorsOnly}
                      onChange={(e) => setShowErrorsOnly(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 cursor-pointer"
                    />
                    <span>Show Validation Errors Only</span>
                  </label>

                  {/* Real-time row count badge */}
                  <Badge className="bg-slate-200 text-slate-800 font-mono text-[10px] font-bold py-1 px-2.5 rounded-lg border border-slate-300">
                    Showing {filteredPreviewRows.length} of {previewRows.length} rows
                  </Badge>
                </div>
              </div>

              {/* Data Preview Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white max-h-[35vh] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="!py-2 !text-[10px] font-bold">Row</TableHead>
                      <TableHead className="!py-2 !text-[10px] font-bold">Vendor ID</TableHead>
                      <TableHead className="!py-2 !text-[10px] font-bold">Company Name</TableHead>
                      <TableHead className="!py-2 !text-[10px] font-bold">Tax ID</TableHead>
                      <TableHead className="!py-2 !text-[10px] font-bold">Department</TableHead>
                      <TableHead className="!py-2 !text-[10px] font-bold">Role</TableHead>
                      <TableHead className="!py-2 !text-[10px] font-bold">Validation Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPreviewRows.map((row, i) => (
                      <TableRow key={i} className={row.state !== 'valid' ? 'bg-rose-50/20' : ''}>
                        <TableCell className="font-mono text-[10px] !py-1.5">{row.row}</TableCell>
                        <TableCell className="font-mono text-[10px] font-bold !py-1.5 text-blue-600 uppercase">{row.Vendor_ID}</TableCell>
                        <TableCell className="font-extrabold text-slate-700 text-[10px] !py-1.5">{row.Company_Name}</TableCell>
                        <TableCell className="font-mono text-[10px] !py-1.5">{row.Tax_ID}</TableCell>
                        <TableCell className="text-[10px] !py-1.5">{row.Department || '-'}</TableCell>
                        <TableCell className="text-[10px] !py-1.5">{row.Role || '-'}</TableCell>
                        <TableCell className="!py-1.5">
                          {row.state === 'valid' ? (
                            <div className="flex items-center space-x-1 text-emerald-600">
                              <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                              <span className="text-[9px] font-extrabold uppercase">Valid</span>
                            </div>
                          ) : (
                            <div className="flex flex-col space-y-0.5">
                              <div className="flex items-center space-x-1 text-rose-600">
                                <FileX className="h-3.5 w-3.5 shrink-0" />
                                <span className="text-[9px] font-extrabold uppercase">{row.state.replace('_', ' ')}</span>
                              </div>
                              <span className="text-[9px] text-rose-500 font-bold block">{row.error}</span>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Status Warning Panel if any duplicates are found in upload set */}
              {previewHasErrors && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 flex items-start space-x-2.5">
                  <ShieldAlert className="h-4.5 w-4.5 text-rose-600 mt-0.5 shrink-0" />
                  <div>
                    <span className="text-[11px] font-extrabold text-rose-800 uppercase block tracking-wider">Duplicate Intersections Detected</span>
                    <p className="text-[10px] text-rose-700 font-semibold leading-relaxed mt-0.5">
                      The active database or deleted rows archive contains matching Vendor IDs or Tax IDs found in this spreadsheet. Submission is blocked until this file is cleaned and re-uploaded.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="pt-2 flex items-center justify-between border-t border-slate-100 mt-5">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => {
                setPreviewRows([]);
                setBulkSearch('');
                setShowErrorsOnly(false);
              }}
              disabled={previewRows.length === 0}
              className="text-xs rounded-xl"
            >
              Clear Preview
            </Button>
            
            <div className="flex items-center space-x-2">
              <Button type="button" variant="outline" onClick={() => setIsUploadOpen(false)} className="text-xs rounded-xl">
                Cancel
              </Button>
              {previewRows.length > 0 && (
                <Button
                  onClick={handleCommitBulkUpdate}
                  disabled={previewHasErrors || bulkLoading}
                  className="bg-blue-600 text-white font-extrabold text-xs px-4 py-2 rounded-xl disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                >
                  {bulkLoading ? 'Processing Ingestion...' : 'Commit Bulk Update'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </Dialog>

    </div>
  );
};

export default Vendors;
