import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { Button } from '../components/ui/Button';
import { Input, Select, TextArea } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Dialog } from '../components/ui/Dialog';
import { Plus, Boxes, History, Wrench, ArrowUpRight, ArrowDownRight } from 'lucide-react';

const Inventory = () => {
  const [activeTab, setActiveTab] = useState('balances');

  return (
    <div className="space-y-6">
      {/* Sub tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('balances')}
          className={`px-5 py-2.5 font-semibold text-sm transition-all border-b-2 -mb-px ${
            activeTab === 'balances'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Stock Balances
        </button>
        <button
          onClick={() => setActiveTab('transactions')}
          className={`px-5 py-2.5 font-semibold text-sm transition-all border-b-2 -mb-px ${
            activeTab === 'transactions'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Audit Transaction Trail
        </button>
      </div>

      {activeTab === 'balances' ? <BalancesTab /> : <TransactionsTab />}
    </div>
  );
};

// -------------------------------------------------------------
// STOCK BALANCES TAB COMPONENT
// -------------------------------------------------------------
const BalancesTab = () => {
  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Correction Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    materialId: '',
    quantity: '',
    notes: ''
  });
  const [formErrors, setFormErrors] = useState({});
  const [submitLoading, setSubmitLoading] = useState(false);

  const fetchBalances = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/inventory');
      if (res.data && res.data.success) {
        setBalances(res.data.data);
      }
    } catch (err) {
      console.error(err);
      setError('Operational error: Failed to fetch inventory balance ledger.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBalances();
  }, []);

  const handleOpenModal = (materialId = '') => {
    setFormData({ materialId, quantity: '', notes: '' });
    setFormErrors({});
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setFormErrors({});
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.materialId) errors.materialId = 'Please select a material';
    if (formData.quantity === '' || isNaN(formData.quantity) || parseFloat(formData.quantity) === 0) {
      errors.quantity = 'A valid non-zero adjustment quantity is required';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSubmitLoading(true);
    try {
      await api.post('/api/inventory/adjustment', {
        materialId: formData.materialId,
        quantity: parseFloat(formData.quantity),
        notes: formData.notes
      });
      fetchBalances();
      handleCloseModal();
    } catch (err) {
      console.error(err);
      const msg = err.response?.data?.error || 'Failed to apply stock adjustment.';
      setFormErrors({ form: msg });
    } finally {
      setSubmitLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner and button */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs font-semibold text-slate-400 uppercase">
            <Boxes className="h-4 w-4" />
            <span>Warehouse Stock Cards</span>
          </div>
          <Button onClick={() => handleOpenModal()} className="flex items-center space-x-1">
            <Wrench className="h-4 w-4" />
            <span>Stock Correction</span>
          </Button>
        </CardContent>
      </Card>

      {/* Main Grid table */}
      <Card>
        <CardContent className="p-0">
          {error && <div className="p-5 text-center text-sm font-semibold text-red-500 bg-red-50">{error}</div>}

          {loading ? (
            <div className="flex flex-col items-center justify-center p-20 space-y-3">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
              <p className="text-xs text-slate-400 font-semibold">Loading stock ledger...</p>
            </div>
          ) : balances.length === 0 ? (
            <div className="p-20 text-center text-slate-400 font-medium">No stock cards found in database.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Material Name</TableHead>
                  <TableHead>Material Code</TableHead>
                  <TableHead>Category Type</TableHead>
                  <TableHead>Warehouse Stock Level</TableHead>
                  <TableHead>Last Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {balances.map((item) => (
                  <TableRow key={item._id}>
                    <TableCell className="font-bold text-slate-800">
                      {item.materialId?.name || 'Deleted Material'}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-500 font-bold">
                      {item.materialId?.code || '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={item.materialId?.type === 'Finished' ? 'info' : 'default'}>
                        {item.materialId?.type || 'Raw'}
                      </Badge>
                    </TableCell>
                    <TableCell className={`font-black text-sm ${item.balance === 0 ? 'text-red-500 font-bold' : 'text-slate-800'}`}>
                      {item.balance} {item.materialId?.unit || ''}
                      {item.balance === 0 && <span className="text-[10px] block font-bold text-red-500 uppercase mt-0.5">Deficit / Out of stock</span>}
                    </TableCell>
                    <TableCell className="text-xs text-slate-400 font-medium">
                      {new Date(item.updatedAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <button
                        onClick={() => handleOpenModal(item.materialId?._id)}
                        className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1.5 rounded-lg font-semibold transition-colors"
                      >
                        Adjust Stock
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Correction Dialog Modal */}
      <Dialog
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title="Inventory Stock Correction / Write-off"
      >
        <form onSubmit={handleFormSubmit} className="space-y-4">
          {formErrors.form && (
            <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-xs text-red-600 font-semibold">
              {formErrors.form}
            </div>
          )}

          {/* Material Selector */}
          <div className="flex flex-col space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">Adjustment Material Target</label>
            <select
              value={formData.materialId}
              onChange={(e) => setFormData({ ...formData, materialId: e.target.value })}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none"
              required
            >
              <option value="" disabled>Select Target Material</option>
              {balances.map(b => (
                <option key={b.materialId?._id} value={b.materialId?._id}>
                  {b.materialId?.name} ({b.materialId?.code}) [Current: {b.balance} {b.materialId?.unit}]
                </option>
              ))}
            </select>
            {formErrors.materialId && <span className="text-xs text-red-500 font-medium">{formErrors.materialId}</span>}
          </div>

          <Input
            label="Correction Quantity (negative value to write-off)"
            id="qty"
            type="number"
            placeholder="e.g. +50 or -15"
            value={formData.quantity}
            onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
            error={formErrors.quantity}
            required
          />

          <TextArea
            label="Adjustment Reason / Code"
            id="notes"
            placeholder="Specify reason (e.g. damages write-off, initial stock seeding, audit corrections...)"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          />

          <div className="pt-2 flex items-center justify-end space-x-2 border-t border-slate-100 mt-5">
            <Button variant="outline" onClick={handleCloseModal}>Cancel</Button>
            <Button type="submit" isLoading={submitLoading}>Apply Correction</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};

// -------------------------------------------------------------
// AUDIT TRANSACTIONS TAB COMPONENT
// -------------------------------------------------------------
const TransactionsTab = () => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchTransactions = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/inventory/transactions');
      if (res.data && res.data.success) {
        setTransactions(res.data.data);
      }
    } catch (err) {
      console.error(err);
      setError('Operational error: Failed to fetch inventory transactions audit log.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center space-x-2">
          <History className="h-5 w-5 text-blue-600" />
          <CardTitle>Warehouse Audit Ledger Logs</CardTitle>
        </div>
        <CardDescription>Immutable record of all inventory stock-in and stock-out movements</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {error && <div className="p-5 text-center text-sm font-semibold text-red-500 bg-red-50">{error}</div>}

        {loading ? (
          <div className="flex flex-col items-center justify-center p-20 space-y-3">
            <div className="animate-spin rounded-full h-7 w-7 border-t-2 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-xs text-slate-400 font-semibold">Loading transaction trail...</p>
          </div>
        ) : transactions.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-400 font-semibold">No warehouse transaction movements recorded yet.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Material Details</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Type Badge</TableHead>
                <TableHead>Movement Quantity</TableHead>
                <TableHead>Audit Reference Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((tx) => {
                const isPositive = tx.quantity > 0;
                return (
                  <TableRow key={tx._id}>
                    <TableCell className="text-xs text-slate-400 font-medium">
                      {new Date(tx.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-bold text-slate-800">
                      {tx.materialId?.name || 'Deleted Material'}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-500 font-bold">
                      {tx.materialId?.code || '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={
                        tx.type === 'purchase' ? 'success' :
                        tx.type === 'consumption' ? 'warning' :
                        tx.type === 'production' ? 'info' : 'default'
                      }>
                        {tx.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-1 font-bold text-xs">
                        {isPositive ? (
                          <>
                            <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600" />
                            <span className="text-emerald-600">+{tx.quantity} {tx.materialId?.unit || ''}</span>
                          </>
                        ) : (
                          <>
                            <ArrowDownRight className="h-3.5 w-3.5 text-rose-600" />
                            <span className="text-rose-600">{tx.quantity} {tx.materialId?.unit || ''}</span>
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500 max-w-[240px] truncate" title={tx.notes || ''}>
                      {tx.notes || '-'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};

export default Inventory;
