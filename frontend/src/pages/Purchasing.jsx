import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Dialog } from '../components/ui/Dialog';
import { Plus, Check, X, ShieldCheck, ShoppingBag, Trash2 } from 'lucide-react';

const Purchasing = () => {
  const { user } = useAuth();

  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Filters State
  const [selectedStatus, setSelectedStatus] = useState('');

  // Form Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [poItemsList, setPoItemsList] = useState([
    { materialId: '', quantity: 10, unitPrice: 1.5 }
  ]);
  const [formErrors, setFormErrors] = useState({});
  const [submitLoading, setSubmitLoading] = useState(false);

  const fetchPurchasingData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        ...(selectedStatus && { status: selectedStatus })
      };
      
      const [resPos, resVendors, resMaterials] = await Promise.all([
        api.get('/api/purchases', { params }),
        api.get('/api/vendors?limit=100'),
        api.get('/api/materials?type=Raw') // Only purchase raw components
      ]);

      if (resPos.data.success) setPurchaseOrders(resPos.data.data);
      if (resVendors.data.success) {
        // Only allow Active vendors
        setVendors(resVendors.data.data.filter(v => v.status === 'Active'));
      }
      if (resMaterials.data.success) {
        setRawMaterials(resMaterials.data.data);
      }
    } catch (err) {
      console.error(err);
      setError('Operational error: Failed to fetch purchasing parameters.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPurchasingData();
  }, [selectedStatus]);

  const handleOpenModal = () => {
    setSelectedVendorId('');
    setPoItemsList([{ materialId: '', quantity: 10, unitPrice: 1.5 }]);
    setFormErrors({});
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setFormErrors({});
  };

  // Add Item Form Row
  const handleAddItemRow = () => {
    setPoItemsList([...poItemsList, { materialId: '', quantity: 10, unitPrice: 1.5 }]);
  };

  // Remove Item Form Row
  const handleRemoveItemRow = (index) => {
    if (poItemsList.length === 1) return;
    setPoItemsList(poItemsList.filter((_, i) => i !== index));
  };

  // Update dynamic row value
  const handleRowChange = (index, field, value) => {
    const updated = [...poItemsList];
    updated[index][field] = value;
    setPoItemsList(updated);
  };

  const validateForm = () => {
    const errors = {};
    if (!selectedVendorId) errors.vendorId = 'Please select a vendor';
    if (poItemsList.length === 0) errors.materials = 'PO must contain at least one item';

    const seenIds = new Set();
    poItemsList.forEach((item, idx) => {
      if (!item.materialId) {
        errors.materials = 'Please specify material references for all purchase rows';
      }
      if (Number(item.quantity) <= 0 || isNaN(item.quantity)) {
        errors.materials = 'Purchase quantities must be valid positive numbers';
      }
      if (Number(item.unitPrice) < 0 || isNaN(item.unitPrice)) {
        errors.materials = 'Unit prices cannot be negative values';
      }
      if (seenIds.has(item.materialId)) {
        errors.materials = 'Duplicate materials are not allowed in the same PO request';
      }
      seenIds.add(item.materialId);
    });

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSubmitLoading(true);
    try {
      const payload = {
        vendorId: selectedVendorId,
        materials: poItemsList.map(item => ({
          materialId: item.materialId,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice)
        }))
      };

      await api.post('/api/purchases', payload);
      fetchPurchasingData();
      handleCloseModal();
    } catch (err) {
      console.error(err);
      const msg = err.response?.data?.error || 'Failed to submit purchase order.';
      setFormErrors({ form: msg });
    } finally {
      setSubmitLoading(false);
    }
  };

  // State Machine Action: Approve or Reject
  const handleApproveReject = async (id, statusAction) => {
    const capitalizedStatus = statusAction === 'approve' ? 'Approved' : 'Rejected';
    if (!window.confirm(`Transition this Purchase Order to: ${capitalizedStatus}? This action cannot be reversed.`)) return;

    try {
      await api.patch(`/api/purchases/${id}/approve`, { status: capitalizedStatus });
      fetchPurchasingData();
    } catch (err) {
      console.error(err);
      const msg = err.response?.data?.error || 'Authorization error: status action blocked.';
      alert(msg);
    }
  };

  // State Machine Action: Receive Goods (GRN)
  const handleReceiveGoods = async (id) => {
    if (!window.confirm('Receive goods for this PO? Raw materials will immediately stock-in to the warehouse ledger.')) return;

    try {
      await api.patch(`/api/purchases/${id}/receive`);
      fetchPurchasingData();
    } catch (err) {
      console.error(err);
      const msg = err.response?.data?.error || 'Failed to execute stock-in receipt.';
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
              <option value="">All Orders</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
              <option value="Received">Received (GRN)</option>
            </select>
          </div>

          <Button onClick={handleOpenModal} className="flex items-center space-x-1">
            <Plus className="h-4 w-4" />
            <span>Draft PO</span>
          </Button>
        </CardContent>
      </Card>

      {/* Main PO tickets ledger */}
      <Card>
        <CardContent className="p-0">
          {error && <div className="p-5 text-center text-sm font-semibold text-red-500 bg-red-50">{error}</div>}

          {loading ? (
            <div className="flex flex-col items-center justify-center p-20 space-y-3">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
              <p className="text-xs text-slate-400 font-semibold">Loading purchase tickets...</p>
            </div>
          ) : purchaseOrders.length === 0 ? (
            <div className="p-20 text-center text-slate-400 font-medium flex flex-col items-center justify-center space-y-2">
              <ShoppingBag className="h-10 w-10 text-slate-300" />
              <p>No purchase orders registered under current filters.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO Reference</TableHead>
                  <TableHead>Vendor Affiliate</TableHead>
                  <TableHead>Items Ordered</TableHead>
                  <TableHead>Total Cost</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchaseOrders.map((po) => (
                  <TableRow key={po._id}>
                    <TableCell>
                      <div className="font-bold text-slate-800">PO #{po._id.slice(-6).toUpperCase()}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Created: {new Date(po.createdAt).toLocaleDateString()}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold text-slate-700">{po.vendorId?.company || 'Apex'}</div>
                      <div className="text-[10px] text-slate-400">{po.vendorId?.name}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col space-y-0.5">
                        {po.materials.map((m, i) => (
                          <div key={i} className="text-xs text-slate-600">
                            • {m.materialId?.name}: <span className="font-bold text-slate-700">{m.quantity} {m.materialId?.unit}</span> @ ${m.unitPrice}
                          </div>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="font-bold text-slate-800 text-xs">${po.totalAmount.toLocaleString()}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Badge>{po.status}</Badge>
                        {po.approvedBy && (
                          <div className="text-[9px] text-slate-400 leading-none">
                            Approved by: <span className="font-semibold">{po.approvedBy.username}</span>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {/* Actions workflow */}
                      {po.status === 'Pending' ? (
                        <div className="flex items-center justify-end space-x-1.5">
                          <button
                            onClick={() => handleApproveReject(po._id, 'approve')}
                            title="Approve PO"
                            className="p-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleApproveReject(po._id, 'reject')}
                            title="Reject PO"
                            className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : po.status === 'Approved' ? (
                        <div className="flex items-center justify-end">
                          <button
                            onClick={() => handleReceiveGoods(po._id)}
                            className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 rounded-lg font-bold transition-all hover:scale-102"
                          >
                            Receive Goods
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

      {/* CRUD Form Modal */}
      <Dialog
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title="Draft Purchase Order (PO)"
      >
        <form onSubmit={handleFormSubmit} className="space-y-4">
          {formErrors.form && (
            <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-xs text-red-600 font-semibold">
              {formErrors.form}
            </div>
          )}

          {/* Supplier Selector */}
          <div className="flex flex-col space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">Procurement Supplier Vendor</label>
            <select
              value={selectedVendorId}
              onChange={(e) => setSelectedVendorId(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none cursor-pointer"
              required
            >
              <option value="" disabled>Select Vendor</option>
              {vendors.map(v => (
                <option key={v._id} value={v._id}>{v.company} ({v.name})</option>
              ))}
            </select>
            {formErrors.vendorId && <span className="text-xs text-red-500 font-medium">{formErrors.vendorId}</span>}
          </div>

          {/* Materials rows */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
              <span className="text-xs font-bold text-slate-600">Materials Order List</span>
              <button
                type="button"
                onClick={handleAddItemRow}
                className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center space-x-1"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Item</span>
              </button>
            </div>

            {formErrors.materials && (
              <div className="text-xs text-red-500 font-medium bg-red-50 py-1 px-2.5 rounded-md border border-red-100">
                {formErrors.materials}
              </div>
            )}

            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {poItemsList.map((item, index) => (
                <div key={index} className="flex items-center space-x-2 bg-slate-50/50 p-2.5 rounded-lg border border-slate-100">
                  {/* Raw Material selector */}
                  <div className="flex-1">
                    <select
                      value={item.materialId}
                      onChange={(e) => handleRowChange(index, 'materialId', e.target.value)}
                      className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-md text-xs text-slate-700 focus:outline-none"
                      required
                    >
                      <option value="" disabled>Select Material</option>
                      {rawMaterials.map(m => (
                        <option key={m._id} value={m._id}>{m.name} ({m.code})</option>
                      ))}
                    </select>
                  </div>

                  {/* Quantity input */}
                  <div className="w-20">
                    <input
                      type="number"
                      min="1"
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(e) => handleRowChange(index, 'quantity', e.target.value)}
                      className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-md text-xs text-slate-700 focus:outline-none"
                      required
                    />
                  </div>

                  {/* Price input */}
                  <div className="w-24">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Price ($)"
                      value={item.unitPrice}
                      onChange={(e) => handleRowChange(index, 'unitPrice', e.target.value)}
                      className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-md text-xs text-slate-700 focus:outline-none"
                      required
                    />
                  </div>

                  {/* Delete Row button */}
                  <button
                    type="button"
                    disabled={poItemsList.length === 1}
                    onClick={() => handleRemoveItemRow(index)}
                    className="p-1 rounded text-red-500 hover:bg-red-50 disabled:opacity-30 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end space-x-2 border-t border-slate-100 mt-5">
            <Button variant="outline" onClick={handleCloseModal}>Cancel</Button>
            <Button type="submit" isLoading={submitLoading}>Draft Order</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};

export default Purchasing;
