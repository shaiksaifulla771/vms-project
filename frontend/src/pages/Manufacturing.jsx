import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Dialog } from '../components/ui/Dialog';
import { Plus, Play, CheckCircle, Factory, ShieldAlert, Cpu } from 'lucide-react';

const Manufacturing = () => {
  const [orders, setOrders] = useState([]);
  const [boms, setBoms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedBomId, setSelectedBomId] = useState('');
  const [targetQuantity, setTargetQuantity] = useState('10');
  const [formErrors, setFormErrors] = useState({});
  const [submitLoading, setSubmitLoading] = useState(false);

  const fetchManufacturingData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [resOrders, resBoms] = await Promise.all([
        api.get('/api/productions'),
        api.get('/api/boms')
      ]);

      if (resOrders.data.success) setOrders(resOrders.data.data);
      if (resBoms.data.success) setBoms(resBoms.data.data);
    } catch (err) {
      console.error(err);
      setError('Operational error: Failed to fetch manufacturing records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchManufacturingData();
  }, []);

  const handleOpenModal = () => {
    setSelectedBomId('');
    setTargetQuantity('10');
    setFormErrors({});
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setFormErrors({});
  };

  const validateForm = () => {
    const errors = {};
    if (!selectedBomId) errors.bomId = 'Please select a Bill of Materials recipe';
    if (!targetQuantity || isNaN(targetQuantity) || Number(targetQuantity) <= 0) {
      errors.quantity = 'A valid positive quantity is required';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSubmitLoading(true);
    try {
      await api.post('/api/productions', {
        bomId: selectedBomId,
        quantity: Number(targetQuantity)
      });
      fetchManufacturingData();
      handleCloseModal();
    } catch (err) {
      console.error(err);
      const msg = err.response?.data?.error || 'Failed to schedule production order.';
      setFormErrors({ form: msg });
    } finally {
      setSubmitLoading(false);
    }
  };

  // State Machine Action: Start Production (consumes raw materials)
  const handleStartProduction = async (id) => {
    if (!window.confirm('Start production run? This checks stock and immediately consumes BOM components from inventory.')) return;

    try {
      await api.patch(`/api/productions/${id}/start`);
      fetchManufacturingData();
    } catch (err) {
      console.error(err);
      const msg = err.response?.data?.error || 'Insufficient stock to start production run. Check Planning (MRP).';
      alert(msg);
    }
  };

  // State Machine Action: Complete Production
  const handleCompleteProduction = async (id) => {
    if (!window.confirm('Mark this production run as completed? Lot will go to QC inspection.')) return;

    try {
      await api.patch(`/api/productions/${id}/complete`);
      fetchManufacturingData();
    } catch (err) {
      console.error(err);
      alert('Failed to complete production run.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner and button */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs font-semibold text-slate-400 uppercase">
            <Factory className="h-4 w-4" />
            <span>Manufacturing shop floor</span>
          </div>
          <Button onClick={handleOpenModal} className="flex items-center space-x-1">
            <Plus className="h-4 w-4" />
            <span>Schedule Run</span>
          </Button>
        </CardContent>
      </Card>

      {/* Production orders table */}
      <Card>
        <CardContent className="p-0">
          {error && <div className="p-5 text-center text-sm font-semibold text-red-500 bg-red-50">{error}</div>}

          {loading ? (
            <div className="flex flex-col items-center justify-center p-20 space-y-3">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
              <p className="text-xs text-slate-400 font-semibold">Loading production runs...</p>
            </div>
          ) : orders.length === 0 ? (
            <div className="p-20 text-center text-slate-400 font-medium">No production runs scheduled.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Run Reference</TableHead>
                  <TableHead>Finished Product</TableHead>
                  <TableHead>Target Quantity</TableHead>
                  <TableHead>Recipe Reference</TableHead>
                  <TableHead>Execution Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((ord) => (
                  <TableRow key={ord._id}>
                    <TableCell>
                      <div className="font-bold text-slate-800">RUN #{ord._id.slice(-6).toUpperCase()}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Created: {new Date(ord.createdAt).toLocaleDateString()}</div>
                    </TableCell>
                    <TableCell className="font-semibold text-slate-700">
                      {ord.bomId?.productId?.name || 'Smart Controller'}
                    </TableCell>
                    <TableCell className="font-bold text-slate-700 text-xs">{ord.quantity} pcs</TableCell>
                    <TableCell>
                      <div className="flex flex-col space-y-0.5 text-xs text-slate-500">
                        {ord.bomId?.components?.map((c, i) => (
                          <div key={i}>
                            • {c.materialId?.name}: <span className="font-bold text-slate-600">{(c.quantity * ord.quantity)} {c.materialId?.unit}</span>
                          </div>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge>{ord.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {/* State Transitions Actions */}
                      {ord.status === 'Pending' ? (
                        <div className="flex items-center justify-end">
                          <button
                            onClick={() => handleStartProduction(ord._id)}
                            className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-2.5 py-1.5 rounded-lg font-bold flex items-center space-x-1 transition-all"
                          >
                            <Play className="h-3.5 w-3.5 fill-current" />
                            <span>Start Run</span>
                          </button>
                        </div>
                      ) : ord.status === 'In Progress' ? (
                        <div className="flex items-center justify-end">
                          <button
                            onClick={() => handleCompleteProduction(ord._id)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-2.5 py-1.5 rounded-lg font-bold flex items-center space-x-1 transition-all"
                          >
                            <CheckCircle className="h-3.5 w-3.5" />
                            <span>Complete</span>
                          </button>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400 font-bold flex items-center justify-end space-x-1">
                          <ShieldAlert className="h-4 w-4 text-slate-300" />
                          <span>Finished</span>
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
        title="Schedule Production Run"
      >
        <form onSubmit={handleFormSubmit} className="space-y-4">
          {formErrors.form && (
            <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-xs text-red-600 font-semibold">
              {formErrors.form}
            </div>
          )}

          {/* BOM Selector */}
          <div className="flex flex-col space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">Product BOM Recipe</label>
            <select
              value={selectedBomId}
              onChange={(e) => setSelectedBomId(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none cursor-pointer"
              required
            >
              <option value="" disabled>Select Recipe</option>
              {boms.map(b => (
                <option key={b._id} value={b._id}>
                  {b.productId?.name} ({b.productId?.code})
                </option>
              ))}
            </select>
            {formErrors.bomId && <span className="text-xs text-red-500 font-medium">{formErrors.bomId}</span>}
          </div>

          <Input
            label="Production Run Lot Target (pcs)"
            id="qty"
            type="number"
            min="1"
            placeholder="e.g. 10"
            value={targetQuantity}
            onChange={(e) => setTargetQuantity(e.target.value)}
            error={formErrors.quantity}
            required
          />

          <div className="pt-2 flex items-center justify-end space-x-2 border-t border-slate-100 mt-5">
            <Button variant="outline" onClick={handleCloseModal}>Cancel</Button>
            <Button type="submit" isLoading={submitLoading}>Schedule Batch</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};

export default Manufacturing;
