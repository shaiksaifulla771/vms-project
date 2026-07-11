import React, { useEffect, useState, useRef } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Dialog } from '../components/ui/Dialog';
import { Search, Plus, Edit2, Trash2, ArrowLeft, ArrowRight, Save, FileText, UploadCloud } from 'lucide-react';

const Contracts = () => {
  const { user } = useAuth();
  
  const [contracts, setContracts] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Filters State
  const [selectedVendor, setSelectedVendor] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  // Form Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  // Simulated File Upload
  const [uploadFileName, setUploadFileName] = useState('');
  
  // Form Field State
  const [formData, setFormData] = useState({
    title: '',
    vendorId: '',
    startDate: '',
    endDate: '',
    value: '',
    documentUrl: '',
    status: 'Pending'
  });
  
  const [formErrors, setFormErrors] = useState({});
  const [submitLoading, setSubmitLoading] = useState(false);
  const [draftMessage, setDraftMessage] = useState('');
  
  const autoSaveIntervalRef = useRef(null);

  // Fetch Contracts
  const fetchContracts = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        ...(selectedStatus && { status: selectedStatus }),
        ...(selectedVendor && { vendorId: selectedVendor })
      };
      const res = await api.get('/api/contracts', { params });
      if (res.data && res.data.success) {
        setContracts(res.data.data);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to fetch contracts. Check database availability.');
    } finally {
      setLoading(false);
    }
  };

  // Fetch Vendors for Selector Dropdown
  const fetchVendorsDropdown = async () => {
    try {
      const res = await api.get('/api/vendors?limit=100');
      if (res.data && res.data.success) {
        // Only allow Active vendors for linking new contracts
        setVendors(res.data.data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchContracts();
    fetchVendorsDropdown();
  }, [selectedStatus, selectedVendor]);

  // -------------------------------------------------------------
  // AUTO-SAVE SYSTEM (localStorage)
  // -------------------------------------------------------------
  useEffect(() => {
    if (isModalOpen) {
      // Check if draft exists in localStorage on open
      const savedDraft = localStorage.getItem('vms_contract_form_draft');
      if (savedDraft) {
        try {
          const parsed = JSON.parse(savedDraft);
          if (parsed.title || parsed.vendorId || parsed.value) {
            setFormData(parsed);
            if (parsed.documentUrl) {
              setUploadFileName(parsed.documentUrl.split('/').pop() || 'uploaded_document.pdf');
            }
            setDraftMessage(`Restored contract draft`);
          }
        } catch (e) {
          console.error(e);
        }
      }

      autoSaveIntervalRef.current = setInterval(() => {
        setFormData((currData) => {
          localStorage.setItem('vms_contract_form_draft', JSON.stringify(currData));
          const timestamp = new Date().toLocaleTimeString();
          setDraftMessage(`Draft autosaved at ${timestamp}`);
          return currData;
        });
      }, 5000);
    } else {
      clearInterval(autoSaveIntervalRef.current);
      setDraftMessage('');
    }

    return () => {
      clearInterval(autoSaveIntervalRef.current);
    };
  }, [isModalOpen]);

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setUploadFileName('');
    setFormData({
      title: '',
      vendorId: '',
      startDate: '',
      endDate: '',
      value: '',
      documentUrl: '',
      status: 'Pending'
    });
    setFormErrors({});
    localStorage.removeItem('vms_contract_form_draft');
  };

  const handleOpenAddModal = () => {
    setEditingId(null);
    setUploadFileName('');
    setFormErrors({});
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (contract) => {
    setEditingId(contract._id);
    
    // Format dates to YYYY-MM-DD for input element
    const fmtStart = contract.startDate ? new Date(contract.startDate).toISOString().split('T')[0] : '';
    const fmtEnd = contract.endDate ? new Date(contract.endDate).toISOString().split('T')[0] : '';
    
    setFormData({
      title: contract.title,
      vendorId: contract.vendorId?._id || contract.vendorId || '',
      startDate: fmtStart,
      endDate: fmtEnd,
      value: contract.value,
      documentUrl: contract.documentUrl || '',
      status: contract.status
    });
    
    if (contract.documentUrl) {
      setUploadFileName(contract.documentUrl.split('/').pop() || 'uploaded_document.pdf');
    } else {
      setUploadFileName('');
    }

    setFormErrors({});
    setIsModalOpen(true);
  };

  // Simulated document selection handler
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setUploadFileName(file.name);
      setFormData(prev => ({
        ...prev,
        documentUrl: `https://vms-portal.storage.local/contracts/${Date.now()}_${file.name}`
      }));
    }
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.title.trim()) errors.title = 'Contract Title is required';
    if (!formData.vendorId) errors.vendorId = 'Please select a vendor';
    if (!formData.startDate) errors.startDate = 'Start date is required';
    if (!formData.endDate) errors.endDate = 'End date is required';
    if (formData.value === '' || isNaN(formData.value) || Number(formData.value) < 0) {
      errors.value = 'A valid positive contract value is required';
    }

    if (formData.startDate && formData.endDate) {
      const start = new Date(formData.startDate);
      const end = new Date(formData.endDate);
      if (start >= end) {
        errors.endDate = 'Contract End Date must be after the Start Date';
      }
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSubmitLoading(true);
    try {
      const payload = {
        ...formData,
        value: Number(formData.value)
      };

      if (editingId) {
        await api.put(`/api/contracts/${editingId}`, payload);
      } else {
        await api.post('/api/contracts', payload);
      }
      fetchContracts();
      handleCloseModal();
    } catch (err) {
      console.error(err);
      const msg = err.response?.data?.error || 'Failed to submit contract details.';
      setFormErrors({ form: msg });
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDeleteContract = async (id) => {
    if (!window.confirm('Are you sure you want to delete this contract registration?')) return;
    
    try {
      await api.delete(`/api/contracts/${id}`);
      fetchContracts();
    } catch (err) {
      console.error(err);
      alert('Failed to delete contract.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Search and Filters Bar */}
      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            {/* Filter by Linked Vendor */}
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold text-slate-400 uppercase">Vendor:</span>
              <select
                value={selectedVendor}
                onChange={(e) => setSelectedVendor(e.target.value)}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
              >
                <option value="">All Vendors</option>
                {vendors.map(v => (
                  <option key={v._id} value={v._id}>{v.company} ({v.name})</option>
                ))}
              </select>
            </div>

            {/* Filter by Contract Status */}
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold text-slate-400 uppercase">Status:</span>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
              >
                <option value="">All Statuses</option>
                <option value="Active">Active</option>
                <option value="Pending">Pending</option>
                <option value="Expired">Expired</option>
              </select>
            </div>

            {(selectedVendor || selectedStatus) && (
              <button
                onClick={() => { setSelectedVendor(''); setSelectedStatus(''); }}
                className="text-xs text-slate-400 hover:text-slate-600 font-semibold"
              >
                Reset Filters
              </button>
            )}
          </div>

          <Button onClick={handleOpenAddModal} className="flex items-center space-x-1 shrink-0">
            <Plus className="h-4 w-4" />
            <span>New Contract</span>
          </Button>
        </CardContent>
      </Card>

      {/* Main Contract Grid Table */}
      <Card>
        <CardContent className="p-0">
          {error && (
            <div className="p-5 text-center text-sm font-semibold text-red-500 bg-red-50/50 border-b border-red-50">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center p-20 space-y-3">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
              <p className="text-xs text-slate-400 font-medium">Loading contracts registry...</p>
            </div>
          ) : contracts.length === 0 ? (
            <div className="p-20 text-center text-slate-400 font-medium flex flex-col items-center justify-center space-y-2">
              <FileText className="h-10 w-10 text-slate-300" />
              <p>No contract agreements registered under the filters.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contract Details</TableHead>
                  <TableHead>Vendor Affiliate</TableHead>
                  <TableHead>Execution Period</TableHead>
                  <TableHead>Budget Value</TableHead>
                  <TableHead>Attachment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contracts.map((contract) => (
                  <TableRow key={contract._id}>
                    <TableCell>
                      <div className="font-bold text-slate-800">{contract.title}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Created: {new Date(contract.createdAt).toLocaleDateString()}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold text-slate-700">{contract.vendorId?.company || 'Acme Affiliate'}</div>
                      <div className="text-[10px] text-slate-400 italic">rep: {contract.vendorId?.name || 'Jane Doe'}</div>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600 font-medium">
                      <div>{new Date(contract.startDate).toLocaleDateString()} to</div>
                      <div className="text-slate-400">{new Date(contract.endDate).toLocaleDateString()}</div>
                    </TableCell>
                    <TableCell className="font-bold text-slate-800 text-xs">
                      ${contract.value.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {contract.documentUrl ? (
                        <a
                          href="#"
                          onClick={(e) => { e.preventDefault(); alert(`Simulating access to attachment storage at:\n${contract.documentUrl}`); }}
                          className="flex items-center space-x-1 text-xs text-blue-600 hover:text-blue-800 font-semibold"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          <span className="truncate max-w-[100px]">{contract.documentUrl.split('_').slice(1).join('_') || 'doc.pdf'}</span>
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400 italic font-medium">None</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge>{contract.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end space-x-1.5">
                        <button
                          onClick={() => handleOpenEditModal(contract)}
                          title="Modify Contract dates/details"
                          className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteContract(contract._id)}
                          title="Delete Contract"
                          className="p-1.5 rounded-md hover:bg-red-50 text-red-500 hover:text-red-700 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* CRUD Form Dialog */}
      <Dialog
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingId ? 'Edit Contract Details' : 'Register Corporate Contract'}
      >
        <form onSubmit={handleFormSubmit} className="space-y-4">
          {formErrors.form && (
            <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-xs text-red-600 font-semibold">
              {formErrors.form}
            </div>
          )}

          <Input
            label="Contract Agreement Title"
            id="title"
            placeholder="e.g. FY26 Enterprise CRM SaaS Agreement"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            error={formErrors.title}
            required
          />

          <div className="grid grid-cols-2 gap-4">
            {/* Linked Vendor Selector */}
            <div className="flex flex-col space-y-1.5">
              <label htmlFor="vendorId" className="text-xs font-semibold text-slate-600">
                Linked Supplier Affiliate
              </label>
              <select
                id="vendorId"
                value={formData.vendorId}
                onChange={(e) => setFormData({ ...formData, vendorId: e.target.value })}
                className={`w-full px-3 py-2 bg-white border rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors cursor-pointer ${
                  formErrors.vendorId ? 'border-red-500' : 'border-slate-200'
                }`}
                required
              >
                <option value="" disabled>Select Vendor</option>
                {vendors.map(v => (
                  <option key={v._id} value={v._id}>{v.company} ({v.name})</option>
                ))}
              </select>
              {formErrors.vendorId && <span className="text-xs text-red-500 font-medium">{formErrors.vendorId}</span>}
            </div>

            <Input
              label="Financial Value (Budget)"
              id="value"
              type="number"
              placeholder="e.g. 75000"
              value={formData.value}
              onChange={(e) => setFormData({ ...formData, value: e.target.value })}
              error={formErrors.value}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Execution Start Date"
              id="startDate"
              type="date"
              value={formData.startDate}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              error={formErrors.startDate}
              required
            />
            
            <Input
              label="Execution End Date"
              id="endDate"
              type="date"
              value={formData.endDate}
              onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
              error={formErrors.endDate}
              required
            />
          </div>

          {/* Document Upload Simulator */}
          <div className="flex flex-col space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">Contract Agreement Document</label>
            <div className="flex items-center justify-center border border-dashed border-slate-200 rounded-lg p-5 bg-slate-50/50 hover:bg-slate-50 transition-colors relative cursor-pointer group">
              <input
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx"
                onChange={handleFileChange}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              
              <div className="text-center space-y-1 text-slate-400 group-hover:text-slate-600 transition-colors">
                <UploadCloud className="h-7 w-7 mx-auto stroke-[1.5]" />
                {uploadFileName ? (
                  <div>
                    <p className="text-xs font-bold text-slate-700">{uploadFileName}</p>
                    <p className="text-[10px] text-slate-400 font-semibold uppercase mt-0.5">Click to replace document</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs font-semibold">Upload legal agreement files</p>
                    <p className="text-[10px] text-slate-400">PDF, Word, Excel files up to 10MB</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Draft Notification Alert */}
          {draftMessage && (
            <div className="flex items-center space-x-1.5 text-[10px] text-blue-500 font-bold bg-blue-50 py-1.5 px-2.5 rounded-md border border-blue-100">
              <Save className="h-3 w-3 shrink-0" />
              <span>{draftMessage}</span>
            </div>
          )}

          <div className="pt-2 flex items-center justify-end space-x-2 border-t border-slate-100 mt-5">
            <Button variant="outline" onClick={handleCloseModal}>
              Cancel
            </Button>
            <Button type="submit" isLoading={submitLoading}>
              {editingId ? 'Save Changes' : 'Execute Contract'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};

export default Contracts;
