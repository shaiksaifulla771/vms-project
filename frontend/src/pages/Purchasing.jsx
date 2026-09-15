import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSiteContext } from '../context/SiteContext';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Dialog } from '../components/ui/Dialog';
import {
  Plus, Check, X, ShieldCheck, ShoppingBag, Trash2, PackageCheck,
  RefreshCw, Layers, Calendar, Warehouse as WarehouseIcon, FileText,
  AlertCircle, CheckCircle2, ArrowRight, Zap
} from 'lucide-react';

const Purchasing = () => {
  const { user } = useAuth();
  const { activeSiteId, activeWarehouseId } = useSiteContext();

  // Active view tab: 'orders' | 'requirements'
  const [activeTab, setActiveTab] = useState('orders');

  // Purchase Orders State
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');

  // Purchase Requirements State
  const [requirements, setRequirements] = useState([]);
  const [loadingReqs, setLoadingReqs] = useState(false);
  const [selectedReqIds, setSelectedReqIds] = useState([]);
  const [convertingPR, setConvertingPR] = useState(false);

  // Filters State
  const [selectedStatus, setSelectedStatus] = useState('');
  const [reqStatusFilter, setReqStatusFilter] = useState('');

  // Draft PO Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [destinationWarehouseId, setDestinationWarehouseId] = useState('');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [poItemsList, setPoItemsList] = useState([
    { materialId: '', quantity: 10, unitPrice: 1.5 }
  ]);
  const [formErrors, setFormErrors] = useState({});
  const [submitLoading, setSubmitLoading] = useState(false);

  // Goods Receipt Note (GRN) Modal State
  const [isGrnModalOpen, setIsGrnModalOpen] = useState(false);
  const [activeGrnPO, setActiveGrnPO] = useState(null);
  const [grnWarehouseId, setGrnWarehouseId] = useState('');
  const [grnItems, setGrnItems] = useState([]);
  const [grnNotes, setGrnNotes] = useState('');
  const [grnSubmitting, setGrnSubmitting] = useState(false);

  // Reorder Check State
  const [evaluatingReorders, setEvaluatingReorders] = useState(false);

  const fetchPurchasingData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        ...(selectedStatus && { status: selectedStatus }),
        ...(activeSiteId && { siteId: activeSiteId }),
        ...(activeWarehouseId && activeWarehouseId !== 'all' && { warehouseId: activeWarehouseId })
      };

      const [resPos, resVendors, resMaterials, resWhs] = await Promise.all([
        api.get('/api/purchases', { params }),
        api.get('/api/vendors?limit=100'),
        api.get('/api/materials?limit=200'),
        api.get('/api/warehouses?limit=100'),
      ]);

      if (resPos.data.success) setPurchaseOrders(resPos.data.data);
      if (resVendors.data.success) {
        setVendors(resVendors.data.data.filter(v => v.status === 'Active'));
      }
      if (resMaterials.data.success) {
        setRawMaterials(resMaterials.data.data);
      }
      if (resWhs.data.success) {
        setWarehouses(resWhs.data.data || []);
      }
    } catch (err) {
      console.error(err);
      setError('Operational error: Failed to fetch purchasing parameters.');
    } finally {
      setLoading(false);
    }
  };

  const fetchRequirements = async () => {
    setLoadingReqs(true);
    try {
      const params = {
        ...(reqStatusFilter && { status: reqStatusFilter }),
        ...(activeSiteId && { siteId: activeSiteId }),
        ...(activeWarehouseId && activeWarehouseId !== 'all' && { warehouseId: activeWarehouseId }),
      };
      const res = await api.get('/api/procurement/requirements', { params });
      if (res.data.success) {
        setRequirements(res.data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch purchase requirements:', err);
    } finally {
      setLoadingReqs(false);
    }
  };

  useEffect(() => {
    fetchPurchasingData();
    fetchRequirements();
  }, [selectedStatus, reqStatusFilter, activeSiteId, activeWarehouseId]);

  const handleOpenModal = () => {
    setSelectedVendorId('');
    setDestinationWarehouseId(activeWarehouseId && activeWarehouseId !== 'all' ? activeWarehouseId : (warehouses[0]?._id || ''));
    setExpectedDeliveryDate(new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]);
    setPoItemsList([{ materialId: '', quantity: 10, unitPrice: 1.5 }]);
    setFormErrors({});
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setFormErrors({});
  };

  const handleAddItemRow = () => {
    setPoItemsList([...poItemsList, { materialId: '', quantity: 10, unitPrice: 1.5 }]);
  };

  const handleRemoveItemRow = (index) => {
    if (poItemsList.length === 1) return;
    setPoItemsList(poItemsList.filter((_, i) => i !== index));
  };

  const handleRowChange = (index, field, value) => {
    const updated = [...poItemsList];
    updated[index][field] = value;
    if (field === 'materialId' && value) {
      const selectedMat = rawMaterials.find(m => m._id === value);
      if (selectedMat && typeof selectedMat.basePrice === 'number' && selectedMat.basePrice > 0) {
        updated[index].unitPrice = selectedMat.basePrice;
      }
    }
    setPoItemsList(updated);
  };

  const validateForm = () => {
    const errors = {};
    if (!selectedVendorId) errors.vendorId = 'Please select a vendor';
    if (poItemsList.length === 0) errors.materials = 'PO must contain at least one item';

    const seenIds = new Set();
    poItemsList.forEach((item) => {
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
        destinationWarehouseId: destinationWarehouseId || undefined,
        warehouseId: destinationWarehouseId || undefined,
        siteId: activeSiteId || undefined,
        expectedDeliveryDate,
        materials: poItemsList.map(item => ({
          materialId: item.materialId,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice)
        }))
      };

      await api.post('/api/purchases', payload);
      setSuccessMsg('Purchase Order drafted successfully!');
      fetchPurchasingData();
      handleCloseModal();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setFormErrors({ form: err.response?.data?.error || 'Failed to submit Purchase Order request.' });
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleApproveReject = async (id, decision) => {
    try {
      await api.patch(`/api/purchases/${id}/approve`, {
        status: decision === 'approve' ? 'Approved' : 'Rejected'
      });
      setSuccessMsg(`PO #${id.slice(-6).toUpperCase()} ${decision === 'approve' ? 'Approved' : 'Rejected'} successfully.`);
      fetchPurchasingData();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update Purchase Order authorization.');
    }
  };

  const handleOpenGrnModal = (po) => {
    setActiveGrnPO(po);
    setGrnWarehouseId(po.destinationWarehouseId?._id || po.destinationWarehouseId || activeWarehouseId || warehouses[0]?._id || '');
    setGrnNotes('');

    const items = po.materials.map(m => {
      const remaining = Math.max(0, m.quantity - (m.receivedQuantity || 0));
      return {
        materialId: m.materialId?._id || m.materialId,
        materialName: m.materialId?.name || 'Item',
        materialCode: m.materialId?.code || '',
        unit: m.materialId?.unit || 'pcs',
        orderedQty: m.quantity,
        receivedQty: m.receivedQuantity || 0,
        remainingQty: remaining,
        receiveNow: remaining,
        lotNumber: '',
        batchNumber: '',
        locationBin: '',
      };
    });

    setGrnItems(items);
    setIsGrnModalOpen(true);
  };

  const handleGrnItemChange = (index, field, value) => {
    const updated = [...grnItems];
    updated[index][field] = value;
    setGrnItems(updated);
  };

  const handleSubmitGRN = async (e) => {
    e.preventDefault();
    if (!grnWarehouseId) {
      alert('Please select a destination warehouse for stock-in.');
      return;
    }

    const payloadItems = grnItems
      .filter(item => Number(item.receiveNow) > 0)
      .map(item => ({
        materialId: item.materialId,
        receivedQuantity: Number(item.receiveNow),
        rejectedQuantity: 0,
        lotNumber: item.lotNumber,
        batchNumber: item.batchNumber,
        locationBin: item.locationBin,
      }));

    if (payloadItems.length === 0) {
      alert('Please specify a positive quantity to receive for at least one item.');
      return;
    }

    setGrnSubmitting(true);
    try {
      const res = await api.patch(`/api/purchases/${activeGrnPO._id}/receive`, {
        warehouseId: grnWarehouseId,
        siteId: activeSiteId || undefined,
        items: payloadItems,
        notes: grnNotes,
      });

      setSuccessMsg(res.data.message || 'Goods Receipt recorded successfully! Inventory updated.');
      setIsGrnModalOpen(false);
      fetchPurchasingData();
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to process Goods Receipt Note.');
    } finally {
      setGrnSubmitting(false);
    }
  };

  const handleBulkConvert = async () => {
    if (selectedReqIds.length === 0) return;

    setConvertingPR(true);
    try {
      const res = await api.post('/api/procurement/requirements/bulk-convert', {
        requirementIds: selectedReqIds,
        destinationWarehouseId: activeWarehouseId && activeWarehouseId !== 'all' ? activeWarehouseId : undefined,
        siteId: activeSiteId || undefined,
      });

      setSuccessMsg(res.data.message || 'Purchase Requirements converted to Purchase Orders!');
      setSelectedReqIds([]);
      fetchRequirements();
      fetchPurchasingData();
      setActiveTab('orders');
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to convert Purchase Requirements to PO.');
    } finally {
      setConvertingPR(false);
    }
  };

  const handleTriggerReorderCheck = async () => {
    setEvaluatingReorders(true);
    try {
      const res = await api.post('/api/procurement/reorder-check', {
        siteId: activeSiteId || undefined,
        warehouseId: activeWarehouseId && activeWarehouseId !== 'all' ? activeWarehouseId : undefined,
      });
      setSuccessMsg(res.data.message || 'Reorder points evaluated successfully.');
      fetchRequirements();
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to evaluate reorder points.');
    } finally {
      setEvaluatingReorders(false);
    }
  };

  const toggleSelectReq = (id) => {
    if (selectedReqIds.includes(id)) {
      setSelectedReqIds(selectedReqIds.filter(x => x !== id));
    } else {
      setSelectedReqIds([...selectedReqIds, id]);
    }
  };

  const selectAllOpenReqs = () => {
    const openReqs = requirements.filter(r => r.status === 'OPEN' || r.status === 'APPROVED');
    if (selectedReqIds.length === openReqs.length) {
      setSelectedReqIds([]);
    } else {
      setSelectedReqIds(openReqs.map(r => r._id));
    }
  };

  return (
    <div className="space-y-4">
      {/* Header and Action Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center space-x-2">
            <ShoppingBag className="h-6 w-6 text-blue-600" />
            <span>Procurement & Supplier Logistics</span>
          </h1>
          <p className="text-xs text-slate-500 font-normal">
            Automated Purchase Requirements, Multi-Line PO Authorizations, 3-Way Matching, and Line-Level Goods Receipts (GRN).
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            onClick={handleTriggerReorderCheck}
            isLoading={evaluatingReorders}
            className="flex items-center space-x-1.5 text-xs font-semibold"
          >
            <Zap className="h-4 w-4 text-amber-500" />
            <span>Scan Reorder Points</span>
          </Button>

          <Button
            onClick={handleOpenModal}
            className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg"
          >
            <Plus className="h-4 w-4" />
            <span>Draft PO</span>
          </Button>
        </div>
      </div>

      {/* Success Notification Alert */}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-bold text-emerald-800 flex items-center space-x-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('orders')}
          className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'orders'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
        >
          <ShoppingBag className="h-4 w-4" />
          <span>Purchase Orders ({purchaseOrders.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('requirements')}
          className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'requirements'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
        >
          <Layers className="h-4 w-4" />
          <span>Purchase Requirements / PRs ({requirements.filter(r => r.status === 'OPEN' || r.status === 'APPROVED').length} Open)</span>
        </button>
      </div>

      {/* TAB 1: PURCHASE ORDERS */}
      {activeTab === 'orders' && (
        <div className="space-y-3">
          <Card className="bg-white border-slate-200 shadow-2xs">
            <CardContent className="p-3 flex items-center justify-between">
              <div className="flex items-center space-x-3 text-xs">
                <span className="text-xs font-bold text-slate-500 uppercase">Filter Status:</span>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="">All Orders</option>
                  <option value="Pending">Pending Approval</option>
                  <option value="Approved">Approved / Ready to Receive</option>
                  <option value="Partially Received">Partially Received</option>
                  <option value="Received">Received (GRN Fulfilled)</option>
                  <option value="Rejected">Rejected</option>
                </select>
              </div>
            </CardContent>
          </Card>

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
                      <TableHead>Supplier Vendor</TableHead>
                      <TableHead>Destination Warehouse</TableHead>
                      <TableHead>Ordered Components</TableHead>
                      <TableHead>Expected Delivery</TableHead>
                      <TableHead>Total Cost</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchaseOrders.map((po) => (
                      <TableRow key={po._id}>
                        <TableCell>
                          <div className="font-bold text-slate-800">{po.poNumber || `PO-${po._id.slice(-6).toUpperCase()}`}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">Created: {new Date(po.createdAt).toLocaleDateString()}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-semibold text-slate-700">{po.vendorId?.company || 'Apex'}</div>
                          <div className="text-[10px] text-slate-400">{po.vendorId?.name}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-slate-700 text-xs flex items-center space-x-1">
                            <WarehouseIcon className="h-3.5 w-3.5 text-slate-400" />
                            <span>{po.destinationWarehouseId?.name || po.warehouseId?.name || 'Primary WH'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col space-y-1">
                            {po.materials.map((m, i) => {
                              const rcvd = m.receivedQuantity || 0;
                              const isComplete = rcvd >= m.quantity;
                              return (
                                <div key={i} className="text-xs text-slate-600 flex items-center space-x-1.5">
                                  <span>{m.materialId?.name || 'Item'}:</span>
                                  <span className="font-bold text-slate-800">{m.quantity} {m.materialId?.unit || 'pcs'}</span>
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isComplete ? 'bg-emerald-100 text-emerald-800' : rcvd > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                                    }`}>
                                    {rcvd} / {m.quantity} rcvd
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs font-semibold text-slate-700 flex items-center space-x-1">
                            <Calendar className="h-3.5 w-3.5 text-slate-400" />
                            <span>{po.expectedDeliveryDate ? new Date(po.expectedDeliveryDate).toLocaleDateString() : 'Immediate'}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-bold text-slate-800 text-xs">₹{(po.totalAmount || 0).toLocaleString('en-IN')}</TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <Badge className={
                              po.status === 'Received' ? 'bg-emerald-100 text-emerald-800' :
                                po.status === 'Partially Received' ? 'bg-amber-100 text-amber-800' :
                                  po.status === 'Approved' ? 'bg-teal-100 text-teal-800' :
                                    po.status === 'Rejected' ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-700'
                            }>
                              {po.status}
                            </Badge>
                            {po.approvedBy && (
                              <div className="text-[9px] text-slate-400 leading-none">
                                By: <span className="font-semibold">{po.approvedBy.username}</span>
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {po.status === 'Pending' || po.status === 'Draft' ? (
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
                          ) : (po.status === 'Approved' || po.status === 'Partially Received') ? (
                            <div className="flex items-center justify-end">
                              <button
                                onClick={() => handleOpenGrnModal(po)}
                                className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 rounded-lg font-bold transition-all shadow-xs flex items-center space-x-1"
                              >
                                <PackageCheck className="h-3.5 w-3.5" />
                                <span>Receive Goods</span>
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end text-xs text-slate-400 font-bold space-x-1">
                              <ShieldCheck className="h-4 w-4 text-slate-300" />
                              <span>Fulfilled</span>
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
        </div>
      )}

      {/* TAB 2: PURCHASE REQUIREMENTS (PRs) */}
      {activeTab === 'requirements' && (
        <div className="space-y-3">
          <Card className="bg-white border-slate-200 shadow-2xs">
            <CardContent className="p-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center space-x-3 text-xs">
                <span className="text-xs font-bold text-slate-500 uppercase">Filter Status:</span>
                <select
                  value={reqStatusFilter}
                  onChange={(e) => setReqStatusFilter(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
                >
                  <option value="">All Requirements</option>
                  <option value="OPEN">Open (Unfulfilled)</option>
                  <option value="CONVERTED_TO_PO">Converted to PO</option>
                  <option value="APPROVED">Approved</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>

              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  onClick={selectAllOpenReqs}
                  className="text-xs font-semibold"
                >
                  {selectedReqIds.length > 0 ? 'Deselect All' : 'Select Open PRs'}
                </Button>

                <Button
                  disabled={selectedReqIds.length === 0}
                  onClick={handleBulkConvert}
                  isLoading={convertingPR}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center space-x-1.5"
                >
                  <ShoppingBag className="h-3.5 w-3.5" />
                  <span>Bulk Convert ({selectedReqIds.length}) to PO</span>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              {loadingReqs ? (
                <div className="flex flex-col items-center justify-center p-20 space-y-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
                  <p className="text-xs text-slate-400 font-semibold">Loading purchase requirements...</p>
                </div>
              ) : requirements.length === 0 ? (
                <div className="p-20 text-center text-slate-400 font-medium flex flex-col items-center justify-center space-y-2">
                  <Layers className="h-10 w-10 text-slate-300" />
                  <p>No purchase requirements found. Run MRP or scan reorder points to generate requirements.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">Select</TableHead>
                      <TableHead>PR Number</TableHead>
                      <TableHead>Material / Component</TableHead>
                      <TableHead>Required Qty</TableHead>
                      <TableHead>Required Date</TableHead>
                      <TableHead>Suggested Supplier</TableHead>
                      <TableHead>Estimated Cost</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requirements.map((pr) => {
                      const isOpen = pr.status === 'OPEN' || pr.status === 'APPROVED';
                      return (
                        <TableRow key={pr._id} className={selectedReqIds.includes(pr._id) ? 'bg-blue-50/50' : ''}>
                          <TableCell>
                            <input
                              type="checkbox"
                              disabled={!isOpen}
                              checked={selectedReqIds.includes(pr._id)}
                              onChange={() => toggleSelectReq(pr._id)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                          </TableCell>
                          <TableCell>
                            <div className="font-bold text-slate-800">{pr.requirementNumber}</div>
                            <div className="text-[10px] text-slate-400">Created: {new Date(pr.createdAt).toLocaleDateString()}</div>
                          </TableCell>
                          <TableCell>
                            <div className="font-semibold text-slate-800">{pr.materialName || pr.materialId?.name}</div>
                            <div className="text-[10px] text-slate-400">{pr.materialCode || pr.materialId?.code}</div>
                          </TableCell>
                          <TableCell className="font-bold text-slate-800 text-xs">
                            {pr.quantity} {pr.unit || 'pcs'}
                          </TableCell>
                          <TableCell className="text-xs text-slate-700 font-medium">
                            {new Date(pr.requiredDate).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-slate-700 text-xs">
                              {pr.suggestedVendor?.company || pr.suggestedVendorName || 'Default Vendor'}
                            </div>
                          </TableCell>
                          <TableCell className="font-bold text-slate-800 text-xs">
                            ₹{(pr.estimatedTotalCost || 0).toLocaleString('en-IN')}
                          </TableCell>
                          <TableCell>
                            <Badge className={
                              pr.status === 'CONVERTED_TO_PO' ? 'bg-purple-100 text-purple-800' :
                                pr.status === 'OPEN' ? 'bg-amber-100 text-amber-800' :
                                  pr.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                            }>
                              {pr.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* DRAFT PO MODAL */}
      <Dialog isOpen={isModalOpen} onClose={handleCloseModal} title="Draft Multi-Line Purchase Order (PO)">
        <form onSubmit={handleFormSubmit} className="space-y-4">
          {formErrors.form && (
            <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-xs text-red-600 font-semibold">
              {formErrors.form}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="flex flex-col space-y-1">
              <label className="text-xs font-semibold text-slate-600">Procurement Supplier Vendor *</label>
              <select
                value={selectedVendorId}
                onChange={(e) => setSelectedVendorId(e.target.value)}
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none cursor-pointer"
                required
              >
                <option value="" disabled>Select Vendor</option>
                {vendors.map(v => (
                  <option key={v._id} value={v._id}>{v.company} ({v.name})</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col space-y-1">
              <label className="text-xs font-semibold text-slate-600">Destination Warehouse *</label>
              <select
                value={destinationWarehouseId}
                onChange={(e) => setDestinationWarehouseId(e.target.value)}
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none cursor-pointer"
                required
              >
                {warehouses.map(w => (
                  <option key={w._id} value={w._id}>{w.name} ({w.code})</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col space-y-1">
              <label className="text-xs font-semibold text-slate-600">Expected Delivery Date *</label>
              <input
                type="date"
                value={expectedDeliveryDate}
                onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none"
                required
              />
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
              <span className="text-xs font-bold text-slate-600">Ordered Components</span>
              <button
                type="button"
                onClick={handleAddItemRow}
                className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center space-x-1"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Component</span>
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

                  <div className="w-24">
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

                  <div className="w-28">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Price (₹)"
                      value={item.unitPrice}
                      onChange={(e) => handleRowChange(index, 'unitPrice', e.target.value)}
                      className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-md text-xs text-slate-700 focus:outline-none"
                      required
                    />
                  </div>

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

      {/* GOODS RECEIPT NOTE (GRN) MODAL */}
      <Dialog
        isOpen={isGrnModalOpen}
        onClose={() => setIsGrnModalOpen(false)}
        title={`Goods Receipt Note (GRN) — PO #${activeGrnPO?.poNumber || ''}`}
      >
        <form onSubmit={handleSubmitGRN} className="space-y-4">
          <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-lg text-xs text-slate-700">
            <p className="font-semibold">Receiving into Physical Inventory:</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Specify quantities received, lot numbers, and warehouse destination. Partial receipts will automatically keep the remaining balance open on this Purchase Order.
            </p>
          </div>

          <div className="flex flex-col space-y-1">
            <label className="text-xs font-semibold text-slate-700">Destination Warehouse *</label>
            <select
              value={grnWarehouseId}
              onChange={(e) => setGrnWarehouseId(e.target.value)}
              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none cursor-pointer"
              required
            >
              {warehouses.map(w => (
                <option key={w._id} value={w._id}>{w.name} ({w.code})</option>
              ))}
            </select>
          </div>

          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
            {grnItems.map((item, idx) => (
              <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800">{item.materialName} ({item.materialCode})</span>
                  <span className="text-[11px] text-slate-500">
                    Ordered: {item.orderedQty} | Prev Received: {item.receivedQty} | <span className="font-bold text-amber-700">Remaining: {item.remainingQty}</span>
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500">Receive Now ({item.unit})</label>
                    <input
                      type="number"
                      min="0"
                      max={item.remainingQty}
                      value={item.receiveNow}
                      onChange={(e) => handleGrnItemChange(idx, 'receiveNow', e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs text-slate-800 font-bold focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold text-slate-500">Lot Number</label>
                    <input
                      type="text"
                      placeholder="e.g. LOT-2026-A"
                      value={item.lotNumber}
                      onChange={(e) => handleGrnItemChange(idx, 'lotNumber', e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs text-slate-800 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold text-slate-500">Batch Number</label>
                    <input
                      type="text"
                      placeholder="e.g. BAT-001"
                      value={item.batchNumber}
                      onChange={(e) => handleGrnItemChange(idx, 'batchNumber', e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs text-slate-800 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold text-slate-500">Bin Location</label>
                    <input
                      type="text"
                      placeholder="e.g. BIN-A1"
                      value={item.locationBin}
                      onChange={(e) => handleGrnItemChange(idx, 'locationBin', e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs text-slate-800 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col space-y-1">
            <label className="text-xs font-semibold text-slate-700">Receipt Notes / Inspection Remarks</label>
            <input
              type="text"
              placeholder="e.g. Verified seals and physical count against vendor delivery challan"
              value={grnNotes}
              onChange={(e) => setGrnNotes(e.target.value)}
              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none"
            />
          </div>

          <div className="pt-2 flex items-center justify-end space-x-2 border-t border-slate-100 mt-4">
            <Button variant="outline" type="button" onClick={() => setIsGrnModalOpen(false)}>Cancel</Button>
            <Button type="submit" isLoading={grnSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              Confirm & Post GRN
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};

export default Purchasing;
