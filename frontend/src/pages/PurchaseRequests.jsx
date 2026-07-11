import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { Button } from '../components/ui/Button';
import { Input, Select, TextArea } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Dialog } from '../components/ui/Dialog';
import { Plus, Check, X, ShieldCheck, ShieldAlert, ShoppingBag, Search } from 'lucide-react';

const PurchaseRequests = () => {
  const { user } = useAuth();
  
  const [requests, setRequests] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    vendorId: '',
    amount: '',
    description: ''
  });
  
  const [formErrors, setFormErrors] = useState({});
  const [submitLoading, setSubmitLoading] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState('');

  // Fetch Purchase Requests
  const fetchRequests = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        ...(selectedStatus && { status: selectedStatus })
      };
      const res = await api.get('/api/requests', { params });
      if (res.data && res.data.success) {
        setRequests(res.data.data);
      }
    } catch (err) {
      console.error(err);
      setError('Connection issues: Failed to load purchase requests.');
    } finally {
      setLoading(false);
    }
  };

  // Fetch Vendors list to populate selector
  const fetchVendorsList = async () => {
    try {
      const res = await api.get('/api/vendors?limit=100');
      if (res.data && res.data.success) {
        // Enforce: only active vendors can be assigned
        const activeOnly = res.data.data.filter(v => v.status === 'Active');
        setVendors(activeOnly);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchRequests();
    fetchVendorsList();
  }, [selectedStatus]);

  const handleOpenModal = () => {
    setFormData({
      title: '',
      vendorId: '',
      amount: '',
      description: ''
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setFormErrors({});
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.title.trim()) errors.title = 'Request Title is required';
    if (!formData.vendorId) errors.vendorId = 'Please assign a supplier';
    if (formData.amount === '' || isNaN(formData.amount) || Number(formData.amount) <= 0) {
      errors.amount = 'A valid positive amount is required';
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
        amount: Number(formData.amount)
      };

      await api.post('/api/requests', payload);
      fetchRequests();
      handleCloseModal();
    } catch (err) {
      console.error(err);
      const msg = err.response?.data?.error || 'Failed to submit purchase request.';
      setFormErrors({ form: msg });
    } finally {
      setSubmitLoading(false);
    }
  };

  // State Machine Action: Approve or Reject
  const handleApproveReject = async (id, statusAction) => {
    const capitalizedStatus = statusAction === 'approve' ? 'Approved' : 'Rejected';
    if (!window.confirm(`Are you sure you want to transition this request status to: ${capitalizedStatus}? This action cannot be reversed.`)) return;

    try {
      await api.patch(`/api/requests/${id}/approve`, { status: capitalizedStatus });
      // Update local state directly to be responsive
      setRequests(prev => prev.map(req => 
        req._id === id 
          ? { 
              ...req, 
              status: capitalizedStatus, 
              approvedBy: { username: user.username, email: user.email, role: user.role } 
            } 
          : req
      ));
    } catch (err) {
      console.error(err);
      const msg = err.response?.data?.error || 'Authorization check failed. Failed to apply status action.';
      alert(msg);
    }
  };

  const handleDeleteRequest = async (id) => {
    if (!window.confirm('Delete this purchase request? Only Pending tickets can be deleted.')) return;
    
    try {
      await api.delete(`/api/requests/${id}`);
      fetchRequests();
    } catch (err) {
      console.error(err);
      const msg = err.response?.data?.error || 'Relational integrity block: finalizing operations locked this request.';
      alert(msg);
    }
  };

  return (
    <div className="space-y-6">
      {/* Filters Bar */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="text-xs font-semibold text-slate-400 uppercase">Filter Status:</span>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              <option value="">All Tickets</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>

          <Button onClick={handleOpenModal} className="flex items-center space-x-1">
            <Plus className="h-4 w-4" />
            <span>Create Request</span>
          </Button>
        </CardContent>
      </Card>

      {/* Main Request Tickets Registry */}
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
              <p className="text-xs text-slate-400 font-medium">Syncing tickets database...</p>
            </div>
          ) : requests.length === 0 ? (
            <div className="p-20 text-center text-slate-400 font-medium flex flex-col items-center justify-center space-y-2">
              <ShoppingBag className="h-10 w-10 text-slate-300" />
              <p>No purchase requests found under current parameters.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket Details</TableHead>
                  <TableHead>Assigned Vendor</TableHead>
                  <TableHead>Requested By</TableHead>
                  <TableHead>Amount Value</TableHead>
                  <TableHead>Workflow Status</TableHead>
                  <TableHead className="text-right">Approval Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((req) => (
                  <TableRow key={req._id}>
                    <TableCell>
                      <div className="font-bold text-slate-800">{req.title}</div>
                      {req.description && (
                        <div className="text-xs text-slate-400 truncate max-w-[200px] mt-0.5" title={req.description}>
                          {req.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-semibold text-slate-700">
                      {req.vendorId?.company || 'Supplier Corp'}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-slate-700">{req.requestedBy?.username || 'Employee'}</div>
                      <div className="text-[10px] text-slate-400 italic">role: {req.requestedBy?.role || 'Staff'}</div>
                    </TableCell>
                    <TableCell className="font-bold text-slate-800 text-xs">
                      ${req.amount.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Badge>{req.status}</Badge>
                        {req.approvedBy && (
                          <div className="text-[9px] text-slate-400 font-medium leading-none">
                            Signed by: <span className="font-semibold text-slate-500">{req.approvedBy.username}</span>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {req.status === 'Pending' ? (
                        <div className="flex items-center justify-end space-x-1.5">
                          <button
                            onClick={() => handleApproveReject(req._id, 'approve')}
                            title="Approve Ticket"
                            className="p-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 hover:text-green-700 transition-colors"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleApproveReject(req._id, 'reject')}
                            title="Reject Ticket"
                            className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-700 transition-colors"
                          >
                            <X className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteRequest(req._id)}
                            title="Delete Request"
                            className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
                          >
                            <X className="h-4 w-4 text-slate-400 hover:text-slate-600" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end text-xs text-slate-400 font-bold space-x-1">
                          <ShieldCheck className="h-4 w-4 text-slate-300" />
                          <span>Finalized</span>
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

      {/* Create Ticket Modal */}
      <Dialog
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title="Create Purchase Request"
      >
        <form onSubmit={handleFormSubmit} className="space-y-4">
          {formErrors.form && (
            <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-xs text-red-600 font-semibold">
              {formErrors.form}
            </div>
          )}

          <Input
            label="Request Description / Title"
            id="title"
            placeholder="e.g. Upgrade cloud hosting nodes"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            error={formErrors.title}
            required
          />

          <div className="grid grid-cols-2 gap-4">
            {/* Vendor Selector */}
            <div className="flex flex-col space-y-1.5">
              <label htmlFor="vendorId" className="text-xs font-semibold text-slate-600">
                Assigned Active Supplier
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
              label="Monetary Spend Amount ($)"
              id="amount"
              type="number"
              placeholder="e.g. 5200"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              error={formErrors.amount}
              required
            />
          </div>

          <TextArea
            label="Additional Details (Operational Context)"
            id="description"
            placeholder="Specify reason for request or allocation codes"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            error={formErrors.description}
          />

          <div className="pt-2 flex items-center justify-end space-x-2 border-t border-slate-100 mt-5">
            <Button variant="outline" onClick={handleCloseModal}>
              Cancel
            </Button>
            <Button type="submit" isLoading={submitLoading}>
              Submit Request
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};

export default PurchaseRequests;
