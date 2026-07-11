import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { Button } from '../components/ui/Button';
import { TextArea, Select } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Dialog } from '../components/ui/Dialog';
import { Plus, ShieldCheck, Heart, User, CheckCircle, XCircle } from 'lucide-react';

const Quality = () => {
  const { user } = useAuth();

  const [records, setRecords] = useState([]);
  const [completedOrders, setCompletedOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    productionOrderId: '',
    status: 'Passed',
    notes: ''
  });
  const [formErrors, setFormErrors] = useState({});
  const [submitLoading, setSubmitLoading] = useState(false);

  const fetchQualityData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [resRecords, resOrders] = await Promise.all([
        api.get('/api/quality'),
        api.get('/api/productions')
      ]);

      if (resRecords.data.success) setRecords(resRecords.data.data);
      if (resOrders.data.success) {
        // Only show Completed orders that haven't been QC Checked yet
        const completedOnly = resOrders.data.data.filter(ord => ord.status === 'Completed');
        setCompletedOrders(completedOnly);
      }
    } catch (err) {
      console.error(err);
      setError('Operational error: Failed to fetch quality logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQualityData();
  }, []);

  const handleOpenModal = () => {
    setFormData({ productionOrderId: '', status: 'Passed', notes: '' });
    setFormErrors({});
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setFormErrors({});
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.productionOrderId) errors.productionOrderId = 'Please select a production lot';
    if (!formData.notes.trim()) errors.notes = 'Inspection notes are required';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSubmitLoading(true);
    try {
      await api.post('/api/quality', formData);
      fetchQualityData();
      handleCloseModal();
    } catch (err) {
      console.error(err);
      const msg = err.response?.data?.error || 'Failed to submit quality inspection report.';
      setFormErrors({ form: msg });
    } finally {
      setSubmitLoading(false);
    }
  };

  // Stats
  const totalChecked = records.length;
  const passedCount = records.filter(r => r.status === 'Passed').length;
  const failedCount = records.filter(r => r.status === 'Failed').length;
  const passRate = totalChecked > 0 ? ((passedCount / totalChecked) * 100).toFixed(1) : '100.0';

  return (
    <div className="space-y-6">
      {/* Analytics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">QC Pass Rate</p>
              <h3 className="text-3xl font-extrabold text-slate-800 tracking-tight">{passRate}%</h3>
              <p className="text-xs text-slate-500 font-medium">Goal: 98% pass rate target</p>
            </div>
            <div className="bg-emerald-50 text-emerald-600 p-3 rounded-2xl">
              <CheckCircle className="h-6 w-6 text-emerald-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Passed Batches</p>
              <h3 className="text-3xl font-extrabold text-slate-800 tracking-tight">{passedCount} Lots</h3>
              <p className="text-xs text-slate-500 font-medium">Stocked in warehouse inventory</p>
            </div>
            <div className="bg-blue-50 text-blue-600 p-3 rounded-2xl">
              <ShieldCheck className="h-6 w-6 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Rejected Batches</p>
              <h3 className="text-3xl font-extrabold text-slate-800 tracking-tight">{failedCount} Lots</h3>
              <p className="text-xs text-slate-500 font-medium">Flagged for rework and adjustments</p>
            </div>
            <div className="bg-rose-50 text-rose-600 p-3 rounded-2xl">
              <XCircle className="h-6 w-6 text-rose-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quality Audit Logs Table */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>QC Inspection Register</CardTitle>
                <CardDescription>Records of all production batches inspected by quality engineers</CardDescription>
              </div>
              <Button onClick={handleOpenModal} className="flex items-center space-x-1 shrink-0">
                <Plus className="h-4 w-4" />
                <span>Audit Lot</span>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-10 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600 mx-auto"></div>
                </div>
              ) : records.length === 0 ? (
                <div className="p-20 text-center text-slate-400 font-medium">No QC inspections completed.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Inspection ID</TableHead>
                      <TableHead>Run Reference</TableHead>
                      <TableHead>Finished Product</TableHead>
                      <TableHead>Lot Quantity</TableHead>
                      <TableHead>QC Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records.map((rec) => (
                      <TableRow key={rec._id}>
                        <TableCell>
                          <div className="font-bold text-slate-800">QC #{rec._id.slice(-6).toUpperCase()}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">{new Date(rec.createdAt).toLocaleString()}</div>
                        </TableCell>
                        <TableCell className="font-mono text-xs font-bold text-slate-500">
                          RUN #{rec.productionOrderId?._id.slice(-6).toUpperCase() || 'RUN-ID'}
                        </TableCell>
                        <TableCell className="font-semibold text-slate-700">
                          {rec.productionOrderId?.bomId?.productId?.name || 'Smart Controller'}
                        </TableCell>
                        <TableCell className="font-bold text-slate-700 text-xs">
                          {rec.productionOrderId?.quantity || 10} pcs
                        </TableCell>
                        <TableCell>
                          <Badge variant={rec.status === 'Passed' ? 'success' : 'danger'}>
                            {rec.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Recent Defect Notes feed */}
        <div className="lg:col-span-1">
          <Card className="h-full flex flex-col">
            <CardHeader>
              <CardTitle>Inspector Audit Logs</CardTitle>
              <CardDescription>Detailed comments from QC inspector signatures</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto max-h-[400px] space-y-4">
              {loading ? (
                <div className="p-10 text-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-blue-600 mx-auto"></div>
                </div>
              ) : records.length === 0 ? (
                <p className="text-xs text-slate-400 font-semibold text-center py-10">No logs available.</p>
              ) : (
                records.map((rec) => (
                  <div key={rec._id} className="border border-slate-100 rounded-lg p-3.5 bg-slate-50/40 space-y-2">
                    <div className="flex items-center justify-between">
                      <h5 className="font-bold text-xs text-slate-800">
                        Lot #{rec.productionOrderId?._id.slice(-6).toUpperCase() || 'LOT'}
                      </h5>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                        rec.status === 'Passed' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                      }`}>{rec.status}</span>
                    </div>

                    <p className="text-xs text-slate-600 italic">
                      "{rec.notes}"
                    </p>

                    <div className="flex items-center space-x-1.5 pt-1.5 border-t border-slate-100 text-[10px] text-slate-400 font-bold justify-end">
                      <User className="h-3 w-3 text-slate-300" />
                      <span>{rec.inspectedBy?.username || 'Inspector'}</span>
                      <span className="text-slate-300">|</span>
                      <span className="text-slate-400 font-medium">{rec.inspectedBy?.role || 'Staff'}</span>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* QC Form Modal */}
      <Dialog
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title="Perform Quality Control Inspection"
      >
        <form onSubmit={handleFormSubmit} className="space-y-4">
          {formErrors.form && (
            <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-xs text-red-600 font-semibold">
              {formErrors.form}
            </div>
          )}

          {/* Completed production order selector */}
          <div className="flex flex-col space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">Completed Product Run Lot</label>
            <select
              value={formData.productionOrderId}
              onChange={(e) => setFormData({ ...formData, productionOrderId: e.target.value })}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none cursor-pointer"
              required
            >
              <option value="" disabled>Select Completed Lot</option>
              {completedOrders.map(ord => (
                <option key={ord._id} value={ord._id}>
                  Lot #{ord._id.slice(-6).toUpperCase()} - {ord.bomId?.productId?.name} [{ord.quantity} pcs]
                </option>
              ))}
            </select>
            {formErrors.productionOrderId && <span className="text-xs text-red-500 font-medium">{formErrors.productionOrderId}</span>}
          </div>

          {/* Status selector */}
          <Select
            label="Quality Decision"
            id="qcStatus"
            options={[
              { value: 'Passed', label: 'Passed - Add finished goods to stock' },
              { value: 'Failed', label: 'Failed - Reject lot (Flag defect / rework)' }
            ]}
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            required
          />

          <TextArea
            label="Defect Logs & Inspector Notes"
            id="notes"
            placeholder="Describe lot inspection results, defect types, tolerances, or rework guidelines..."
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            error={formErrors.notes}
            rows={4}
            required
          />

          <div className="pt-2 flex items-center justify-end space-x-2 border-t border-slate-100 mt-5">
            <Button variant="outline" onClick={handleCloseModal}>Cancel</Button>
            <Button type="submit" isLoading={submitLoading}>Submit Quality Report</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};

export default Quality;
