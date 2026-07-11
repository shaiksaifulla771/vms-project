import React, { useEffect, useState, useRef } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { Button } from '../components/ui/Button';
import { Input, Select, TextArea } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Dialog } from '../components/ui/Dialog';
import { Search, Filter, Plus, Edit2, ToggleLeft, ToggleRight, Trash2, ArrowLeft, ArrowRight, Save } from 'lucide-react';

const Vendors = () => {
  const { user } = useAuth();
  
  // State for raw data
  const [vendors, setVendors] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1, limit: 10 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Search & Filter State
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  // Form Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  // Form Field State
  const [formData, setFormData] = useState({
    name: '',
    company: '',
    email: '',
    phone: '',
    address: '',
    category: 'Software',
    status: 'Active'
  });
  
  const [formErrors, setFormErrors] = useState({});
  const [submitLoading, setSubmitLoading] = useState(false);
  const [draftMessage, setDraftMessage] = useState('');
  
  const autoSaveIntervalRef = useRef(null);

  // Categories list
  const categoryOptions = [
    { value: 'Software', label: 'Software' },
    { value: 'Hardware', label: 'Hardware' },
    { value: 'Consulting', label: 'Consulting' },
    { value: 'Logistics', label: 'Logistics' },
    { value: 'Marketing', label: 'Marketing' },
    { value: 'Office Supplies', label: 'Office Supplies' },
    { value: 'Other', label: 'Other' }
  ];

  // Fetch Vendors
  const fetchVendors = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page,
        limit: 10,
        ...(search && { search }),
        ...(category && { category }),
        ...(status && { status })
      };
      const res = await api.get('/api/vendors', { params });
      if (res.data && res.data.success) {
        setVendors(res.data.data);
        setPagination(res.data.pagination);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to fetch vendors. Please check backend connection.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVendors();
  }, [page, category, status]);

  // Debounced search trigger
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setPage(1);
      fetchVendors();
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [search]);

  // -------------------------------------------------------------
  // AUTO-SAVE SYSTEM (localStorage)
  // -------------------------------------------------------------
  // Trigger auto-save every 5 seconds when modal is open
  useEffect(() => {
    if (isModalOpen) {
      // Check if draft exists in localStorage on open
      const savedDraft = localStorage.getItem('vms_vendor_form_draft');
      if (savedDraft) {
        try {
          const parsed = JSON.parse(savedDraft);
          // Only offer to restore if fields are not completely empty
          if (parsed.name || parsed.company || parsed.email) {
            setFormData(parsed);
            setDraftMessage(`Restored draft from local storage`);
          }
        } catch (e) {
          console.error(e);
        }
      }

      autoSaveIntervalRef.current = setInterval(() => {
        // We read state directly in the interval hook
        setFormData((currData) => {
          localStorage.setItem('vms_vendor_form_draft', JSON.stringify(currData));
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

  // Clean form and local storage
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setFormData({
      name: '',
      company: '',
      email: '',
      phone: '',
      address: '',
      category: 'Software',
      status: 'Active'
    });
    setFormErrors({});
    localStorage.removeItem('vms_vendor_form_draft');
  };

  const handleOpenAddModal = () => {
    setEditingId(null);
    setFormErrors({});
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (vendor) => {
    setEditingId(vendor._id);
    setFormData({
      name: vendor.name,
      company: vendor.company,
      email: vendor.email,
      phone: vendor.phone,
      address: vendor.address,
      category: vendor.category,
      status: vendor.status
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.name.trim()) errors.name = 'Contact Name is required';
    if (!formData.company.trim()) errors.company = 'Company name is required';
    
    if (!formData.email.trim()) {
      errors.email = 'Corporate Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      errors.email = 'Invalid email address format';
    }

    if (!formData.phone.trim()) errors.phone = 'Phone number is required';
    if (!formData.address.trim()) errors.address = 'Office Address is required';
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSubmitLoading(true);
    try {
      if (editingId) {
        // Update Vendor
        await api.put(`/api/vendors/${editingId}`, formData);
      } else {
        // Create Vendor
        await api.post('/api/vendors', formData);
      }
      fetchVendors();
      handleCloseModal();
    } catch (err) {
      console.error(err);
      const msg = err.response?.data?.error || 'Failed to submit vendor form details.';
      setFormErrors({ form: msg });
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleToggleStatus = async (vendor) => {
    try {
      await api.patch(`/api/vendors/${vendor._id}/status`);
      // Update local state directly to be fast and responsive
      setVendors(vendors.map(v => 
        v._id === vendor._id ? { ...v, status: v.status === 'Active' ? 'Inactive' : 'Active' } : v
      ));
    } catch (err) {
      console.error(err);
      alert('Failed to toggle vendor status.');
    }
  };

  const handleDeleteVendor = async (id) => {
    if (!window.confirm('Are you sure you want to delete this vendor record? This action checks database references.')) return;
    
    try {
      await api.delete(`/api/vendors/${id}`);
      fetchVendors();
    } catch (err) {
      console.error(err);
      const errorMsg = err.response?.data?.error || 'relational integrity violation: linked contracts or purchase requests prevent deleting this vendor.';
      alert(`Relational Integrity Check: ${errorMsg}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search and Filters Bar */}
      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, company, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Category Filter */}
            <div className="flex items-center space-x-2">
              <Filter className="h-4 w-4 text-slate-400" />
              <select
                value={category}
                onChange={(e) => { setCategory(e.target.value); setPage(1); }}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
              >
                <option value="">All Categories</option>
                {categoryOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              <option value="">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>

            {/* Clear filters shortcut */}
            {(category || status || search) && (
              <button
                onClick={() => { setCategory(''); setStatus(''); setSearch(''); setPage(1); }}
                className="text-xs text-slate-400 hover:text-slate-600 font-semibold"
              >
                Reset Filters
              </button>
            )}

            <Button onClick={handleOpenAddModal} className="flex items-center space-x-1">
              <Plus className="h-4 w-4" />
              <span>Add Vendor</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Main Vendor Data Table */}
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
              <p className="text-xs text-slate-400 font-medium">Querying vendor database...</p>
            </div>
          ) : vendors.length === 0 ? (
            <div className="p-20 text-center text-slate-400 font-medium">
              No vendor records matching the criteria found.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor Representative</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Email Address</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendors.map((vendor) => (
                  <TableRow key={vendor._id}>
                    <TableCell>
                      <div className="font-bold text-slate-800">{vendor.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">{vendor.phone}</div>
                    </TableCell>
                    <TableCell className="font-medium text-slate-700">{vendor.company}</TableCell>
                    <TableCell className="text-slate-600 font-mono text-xs">{vendor.email}</TableCell>
                    <TableCell>
                      <Badge variant="info">{vendor.category}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge>{vendor.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end space-x-1.5">
                        <button
                          onClick={() => handleToggleStatus(vendor)}
                          title="Toggle Status (Active/Inactive)"
                          className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
                        >
                          {vendor.status === 'Active' ? (
                            <ToggleRight className="h-4.5 w-4.5 text-blue-600" />
                          ) : (
                            <ToggleLeft className="h-4.5 w-4.5 text-slate-400" />
                          )}
                        </button>
                        <button
                          onClick={() => handleOpenEditModal(vendor)}
                          title="Edit Vendor details"
                          className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteVendor(vendor._id)}
                          title="Delete Vendor"
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

          {/* Pagination Controls */}
          {pagination.pages > 1 && (
            <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-500 bg-slate-50/20">
              <p>Showing page {pagination.page} of {pagination.pages} ({pagination.total} total vendor profiles)</p>
              
              <div className="flex items-center space-x-2">
                <button
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                  className="p-1.5 bg-white border border-slate-200 rounded-md hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <button
                  disabled={page === pagination.pages}
                  onClick={() => setPage(page + 1)}
                  className="p-1.5 bg-white border border-slate-200 rounded-md hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                >
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* CRUD Form Modal */}
      <Dialog
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingId ? 'Edit Supplier Record' : 'Register New Vendor'}
      >
        <form onSubmit={handleFormSubmit} className="space-y-4">
          {formErrors.form && (
            <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-xs text-red-600 font-semibold">
              {formErrors.form}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Contact Representative Name"
              id="name"
              placeholder="e.g. John Doe"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              error={formErrors.name}
              required
            />
            
            <Input
              label="Company Name"
              id="company"
              placeholder="e.g. Oracle Corp"
              value={formData.company}
              onChange={(e) => setFormData({ ...formData, company: e.target.value })}
              error={formErrors.company}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Corporate Email Address"
              id="email"
              type="email"
              placeholder="name@company.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              error={formErrors.email}
              required
            />

            <Input
              label="Phone Number"
              id="phone"
              placeholder="+1 (555) 000-111"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              error={formErrors.phone}
              required
            />
          </div>

          <Select
            label="Procurement Category"
            id="category"
            options={categoryOptions}
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            error={formErrors.category}
            required
          />

          <TextArea
            label="Corporate Office Address"
            id="address"
            placeholder="Specify street address, building number, zip, state"
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            error={formErrors.address}
            required
          />

          <Select
            label="Initial Registry Status"
            id="status"
            options={[
              { value: 'Active', label: 'Active' },
              { value: 'Inactive', label: 'Inactive' }
            ]}
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            required
          />

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
              {editingId ? 'Apply Changes' : 'Register Vendor'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};

export default Vendors;
