import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Cpu, CheckCircle2, AlertOctagon, ArrowRight, Play, Trash2, RotateCcw } from 'lucide-react';

const Planning = () => {
  const [finishedProducts, setFinishedProducts] = useState([]);
  const [boms, setBoms] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [selectedBOM, setSelectedBOM] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [targetQuantity, setTargetQuantity] = useState('');
  const [requiredDate, setRequiredDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [creatingPlan, setCreatingPlan] = useState(false);
  
  // MRP Results
  const [mrpResult, setMrpResult] = useState(null);
  const [mrpError, setMrpError] = useState(null);
  
  const fetchInitialData = async () => {
    try {
      const [bomRes, whRes] = await Promise.all([
        api.get('/api/boms'),
        api.get('/api/warehouses')
      ]);
      if (bomRes.data?.success) setBoms(bomRes.data.data);
      if (whRes.data?.success) setWarehouses(whRes.data.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  const handleRunMRP = async () => {
    if (!selectedBOM || !targetQuantity) return;

    setLoading(true);
    setMrpError(null);
    setMrpResult(null);
    
    try {
      const activeBom = boms.find(b => b._id === selectedBOM);
      const res = await api.get('/api/productions/planning/mrp', {
        params: {
          productId: activeBom.productId._id || activeBom.productId,
          quantity: targetQuantity
        }
      });
      if (res.data && res.data.success) {
        setMrpResult(res.data.data);
      }
    } catch (err) {
      console.error(err);
      const msg = err.response?.data?.error || 'MRP check failed.';
      setMrpError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePlan = async () => {
    if (!mrpResult || !selectedBOM || !selectedWarehouse || !requiredDate) {
      alert("Missing data for Production Plan creation. Please ensure a BOM, Warehouse, and Required Date are selected.");
      return;
    }
    
    setCreatingPlan(true);
    try {
      const activeBom = boms.find(b => b._id === selectedBOM);
      await api.post('/api/production-plans', {
        productId: activeBom.productId._id || activeBom.productId,
        bomId: activeBom._id,
        warehouseId: selectedWarehouse,
        quantity: targetQuantity,
        requiredDate: requiredDate
      });
      alert('Production Plan created successfully. It is now Pending in the Scheduling module.');
      setMrpResult(null); 
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to create Production Plan');
    } finally {
      setCreatingPlan(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Cpu className="h-5 w-5 text-blue-600" />
            <CardTitle>Material Requirements Planning (MRP)</CardTitle>
          </div>
          <CardDescription>Calculate requirements against warehouse inventory and create manual production plans.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Bill of Materials (BOM)</label>
              <select
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                value={selectedBOM}
                onChange={(e) => setSelectedBOM(e.target.value)}
              >
                <option value="">Select BOM</option>
                {boms.map(bom => (
                  <option key={bom._id} value={bom._id}>{bom.name} ({bom.code})</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Target Warehouse (Site)</label>
              <select
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                value={selectedWarehouse}
                onChange={(e) => setSelectedWarehouse(e.target.value)}
              >
                <option value="">Select Warehouse / Site</option>
                {warehouses.map(wh => (
                  <option key={wh._id} value={wh._id}>{wh.name} ({wh.code})</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Target Quantity (Units)</label>
              <input
                type="number"
                placeholder="e.g. 100"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                value={targetQuantity}
                onChange={(e) => setTargetQuantity(e.target.value)}
                min="1"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Required Date</label>
              <input
                type="date"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                value={requiredDate}
                onChange={(e) => setRequiredDate(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-6">
            <Button
              onClick={handleRunMRP}
              disabled={!selectedBOM || !targetQuantity || loading}
              className="w-full"
            >
              {loading ? 'Calculating...' : 'Run MRP Check'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {mrpError && (
        <Card className="bg-red-50 border-red-100 text-red-700">
          <CardContent className="p-4 flex items-center space-x-2 text-sm font-semibold">
            <AlertOctagon className="h-5 w-5 shrink-0" />
            <span>{mrpError}</span>
          </CardContent>
        </Card>
      )}

      {mrpResult && (
        <div className="space-y-6">
          <Card className={mrpResult.canProduce ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-red-50 border-red-100 text-red-800'}>
            <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start space-x-3">
                {mrpResult.canProduce ? <CheckCircle2 className="h-6 w-6 text-emerald-600" /> : <AlertOctagon className="h-6 w-6 text-red-600" />}
                <div>
                  <h4 className="font-extrabold text-sm">{mrpResult.canProduce ? 'PRODUCTION FEASIBLE' : 'MATERIAL SHORTAGE DETECTED'}</h4>
                </div>
              </div>
              <Button
                onClick={handleCreatePlan}
                isLoading={creatingPlan}
                disabled={!selectedWarehouse || !requiredDate}
                className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center space-x-1"
              >
                <Play className="h-4 w-4" />
                <span>Create Production Plan</span>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Material Checklist</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Component</TableHead>
                    <TableHead>Required</TableHead>
                    <TableHead>Available</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mrpResult.details.map((item) => (
                    <TableRow key={item.materialId}>
                      <TableCell>{item.name}</TableCell>
                      <TableCell>{item.required} {item.unit}</TableCell>
                      <TableCell>{item.available} {item.unit}</TableCell>
                      <TableCell>
                        <Badge variant={item.status === 'Deficit' ? 'danger' : 'success'}>{item.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default Planning;
