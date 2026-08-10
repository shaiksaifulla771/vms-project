import React, { useState, useEffect } from 'react';
import api from '../services/api';
import planningService from '../services/planningService';
import productionPlanService from '../services/productionPlanService';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Dialog } from '../components/ui/Dialog';
import { Cpu, Calculator, AlertTriangle, CheckCircle, Package, ArrowRight, RefreshCw, FilePlus } from 'lucide-react';

const Planning = () => {
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [boms, setBoms] = useState([]);

  // Form inputs
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedBomId, setSelectedBomId] = useState('');
  const [targetQty, setTargetQty] = useState(100);
  const [requiredDate, setRequiredDate] = useState(new Date().toISOString().split('T')[0]);

  // Loading & Result States
  const [calculating, setCalculating] = useState(false);
  const [mrpResult, setMrpResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Modal State for Create Production Plan
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [plannedQty, setPlannedQty] = useState(100);
  const [planNotes, setPlanNotes] = useState('MRP Production Requirement Commitment');
  const [submittingPlan, setSubmittingPlan] = useState(false);

  // Load dropdown master data on mount
  useEffect(() => {
    const loadMasterData = async () => {
      try {
        const [whRes, matRes, bomRes] = await Promise.all([
          api.get('/api/warehouses'),
          api.get('/api/materials'),
          api.get('/api/boms')
        ]);

        const whList = whRes.data.data || whRes.data.warehouses || [];
        setWarehouses(whList);
        if (whList.length > 0) setSelectedWarehouseId(whList[0]._id);

        const matList = matRes.data.data || matRes.data.materials || [];
        setProducts(matList);
        if (matList.length > 0) setSelectedProductId(matList[0]._id);

        const bomList = bomRes.data.data || bomRes.data.boms || [];
        setBoms(bomList);
        if (bomList.length > 0) setSelectedBomId(bomList[0]._id);
      } catch (err) {
        console.error('Failed to load planning master data:', err);
      }
    };
    loadMasterData();
  }, []);

  // Update selected BOM automatically when Product changes
  useEffect(() => {
    if (selectedProductId && boms.length > 0) {
      const matched = boms.find(b => (b.productId?._id || b.productId) === selectedProductId);
      if (matched) setSelectedBomId(matched._id);
    }
  }, [selectedProductId, boms]);

  // Handle Calculate MRP
  const handleCalculateMRP = async (e) => {
    if (e) e.preventDefault();
    if (!selectedProductId || !selectedWarehouseId || !targetQty) {
      setErrorMsg('Please select a Product, Warehouse, and enter Target Quantity.');
      return;
    }

    setCalculating(true);
    setErrorMsg('');
    setSuccessMsg('');
    setMrpResult(null);

    try {
      const res = await planningService.calculateMRP({
        productId: selectedProductId,
        bomId: selectedBomId,
        warehouseId: selectedWarehouseId,
        targetQty: parseFloat(targetQty),
        requiredDate
      });

      setMrpResult(res);
      setPlannedQty(targetQty);
    } catch (err) {
      console.error('MRP Calculation Error:', err);
      setErrorMsg(err.response?.data?.error || 'Failed to calculate MRP requirements.');
    } finally {
      setCalculating(false);
    }
  };

  // Handle Create Production Plan Submission
  const handleConfirmCreatePlan = async () => {
    if (!plannedQty || plannedQty <= 0) return;
    setSubmittingPlan(true);
    setErrorMsg('');

    try {
      const res = await productionPlanService.createProductionPlan({
        productId: selectedProductId,
        bomId: selectedBomId,
        warehouseId: selectedWarehouseId,
        quantity: parseFloat(plannedQty),
        requiredDate,
        status: 'Unscheduled', // Pending commitment in planning stage
        notes: planNotes
      });

      if (res.success || res.data) {
        const createdPlan = res.data;
        setSuccessMsg(`✓ Production Plan ${createdPlan.planNumber || 'PLAN-001'} created successfully in PENDING status!`);
        setIsCreateModalOpen(false);
      }
    } catch (err) {
      console.error('Create Plan Error:', err);
      setErrorMsg(err.response?.data?.error || 'Failed to create Production Plan.');
    } finally {
      setSubmittingPlan(false);
    }
  };

  const selectedProductObj = products.find(p => p._id === selectedProductId);
  const selectedWarehouseObj = warehouses.find(w => w._id === selectedWarehouseId);
  const selectedBomObj = boms.find(b => b._id === selectedBomId);

  return (
    <div className="space-y-6">
      {/* Default Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-3.5">
          <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-blue-600">
            <Cpu className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">MRP Planning & Material Requirements</h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Calculate net material shortages and generate manual Production Commitments
            </p>
          </div>
        </div>

        {successMsg && (
          <div className="px-4 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-bold flex items-center space-x-2">
            <CheckCircle className="h-4 w-4 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}
      </div>

      {/* MRP Input Parameters Form */}
      <Card className="bg-white border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 pb-4">
          <CardTitle className="text-xs font-bold text-slate-900 flex items-center space-x-2 uppercase tracking-wider">
            <Calculator className="h-4 w-4 text-blue-600" />
            <span>MRP CALCULATION PARAMETERS</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleCalculateMRP} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Site / Warehouse Dropdown */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5 uppercase tracking-wider">Site / Warehouse *</label>
              <select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 h-10"
                required
              >
                {warehouses.map(w => (
                  <option key={w._id} value={w._id}>{w.name} ({w.code || 'WH-01'})</option>
                ))}
              </select>
            </div>

            {/* Finished Product Dropdown */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5 uppercase tracking-wider">Finished Product *</label>
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 h-10"
                required
              >
                {products.map(p => (
                  <option key={p._id} value={p._id}>{p.name} [{p.code}]</option>
                ))}
              </select>
            </div>

            {/* Required Quantity Input */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5 uppercase tracking-wider">Required Quantity *</label>
              <input
                type="number"
                min="1"
                value={targetQty}
                onChange={(e) => setTargetQty(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 h-10"
                placeholder="100"
                required
              />
            </div>

            {/* Required Date Input */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5 uppercase tracking-wider">Required Date *</label>
              <input
                type="date"
                value={requiredDate}
                onChange={(e) => setRequiredDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 h-10"
                required
              />
            </div>

            <div className="md:col-span-4 flex justify-end pt-2">
              <Button
                type="submit"
                isLoading={calculating}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-6 py-2.5 rounded-xl shadow-md flex items-center space-x-2"
              >
                <Calculator className="h-4 w-4" />
                <span>Calculate MRP</span>
              </Button>
            </div>
          </form>

          {errorMsg && (
            <div className="mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold flex items-center space-x-2">
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* MRP Calculation Results */}
      {mrpResult && (
        <div className="space-y-6">
          {/* Summary Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">MRP RESULT SUMMARY</span>
              <h3 className="text-base font-black text-slate-900 mt-0.5">
                Product: <span className="text-blue-600">{selectedProductObj?.name || 'Product A'}</span>
              </h3>
            </div>
            <div className="flex items-center space-x-6 text-xs">
              <div>
                <span className="text-slate-500 block font-medium">Required Qty:</span>
                <span className="text-slate-900 font-black font-mono text-sm">{mrpResult.mrpRun?.targetQty || targetQty} {selectedProductObj?.unit || 'Pcs'}</span>
              </div>
              <div>
                <span className="text-slate-500 block font-medium">Target Warehouse:</span>
                <span className="text-slate-900 font-bold">{selectedWarehouseObj?.name || 'WH-01'}</span>
              </div>
              <div>
                <span className="text-slate-500 block font-medium">BOM Reference:</span>
                <span className="text-indigo-600 font-bold">{selectedBomObj?.bomNumber || 'BOM-001'}</span>
              </div>
            </div>
          </div>

          {/* Component Material Shortage Table */}
          <Card className="bg-white border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 pb-4">
              <CardTitle className="text-xs font-bold text-slate-900 flex items-center justify-between uppercase tracking-wider">
                <span>MATERIAL REQUIREMENTS & SHORTAGES</span>
                <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50 text-[10px]">
                  {(mrpResult.requirements || []).length} Components Evaluated
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="p-4">Material Name</th>
                      <th className="p-4">Required Qty</th>
                      <th className="p-4">Available Stock</th>
                      <th className="p-4">Shortage Qty</th>
                      <th className="p-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {(mrpResult.requirements || []).map((req, idx) => {
                      const shortage = req.shortageQty || Math.max(0, (req.requiredQty || 0) - (req.availableQty || 0));
                      const isShort = shortage > 0;
                      return (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="p-4 font-bold text-slate-900">
                            {req.materialName || req.materialId?.name || 'Raw Material'}
                          </td>
                          <td className="p-4 font-mono font-bold text-slate-900">
                            {req.requiredQty} {req.unit || 'KG'}
                          </td>
                          <td className="p-4 font-mono font-bold text-emerald-600">
                            {req.availableQty} {req.unit || 'KG'}
                          </td>
                          <td className="p-4 font-mono font-bold">
                            <span className={isShort ? "text-rose-600" : "text-slate-400"}>
                              {shortage} {req.unit || 'KG'}
                            </span>
                          </td>
                          <td className="p-4 text-center">
                            {isShort ? (
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                Shortage ({shortage})
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Fully Stocked
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Production Requirement Commitment Card */}
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-6 rounded-xl text-white shadow-md flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest block">STEP 2: CREATE PRODUCTION COMMITMENT</span>
              <h3 className="text-base font-bold text-white mt-0.5">
                Ready to commit {targetQty} {selectedProductObj?.unit || 'Pcs'} of {selectedProductObj?.name}?
              </h3>
              <p className="text-xs text-slate-300 mt-1">
                Creates a <strong>Manual Production Plan (Status: Pending)</strong>. Physical inventory remains unchanged until Scheduled.
              </p>
            </div>
            <Button
              onClick={() => setIsCreateModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-6 py-3 rounded-xl shadow-md flex items-center space-x-2 shrink-0"
            >
              <FilePlus className="h-4.5 w-4.5" />
              <span>Create Production Plan</span>
            </Button>
          </div>
        </div>
      )}

      {/* Modal: CREATE PRODUCTION PLAN */}
      <Dialog
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="CREATE PRODUCTION PLAN"
        className="!max-w-lg bg-white border border-slate-200 text-slate-900 rounded-xl p-6 shadow-xl"
      >
        <div className="space-y-4">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 font-mono text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Product:</span>
              <span className="text-slate-900 font-bold">{selectedProductObj?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">BOM Reference:</span>
              <span className="text-indigo-600 font-bold">{selectedBomObj?.bomNumber || 'BOM-001'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Target Warehouse:</span>
              <span className="text-slate-900 font-bold">{selectedWarehouseObj?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">MRP Requirement:</span>
              <span className="text-blue-600 font-bold">{targetQty}</span>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1 uppercase tracking-wider">Planned Quantity *</label>
            <input
              type="number"
              min="1"
              value={plannedQty}
              onChange={(e) => setPlannedQty(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 h-10 font-mono"
              required
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1 uppercase tracking-wider">Reason / Planning Notes</label>
            <textarea
              rows={2}
              value={planNotes}
              onChange={(e) => setPlanNotes(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Production requirement commitment notes..."
            />
          </div>

          <div className="p-3 bg-blue-50 border border-blue-200 text-blue-800 rounded-xl text-[11px] font-medium leading-relaxed">
            💡 <strong>Planning Commitment Rule</strong>: Creating a plan saves the intention as <strong>PENDING</strong>. Physical inventory remains unchanged until Scheduled.
          </div>

          <div className="pt-4 flex items-center justify-end space-x-3 border-t border-slate-100">
            <Button variant="outline" size="sm" onClick={() => setIsCreateModalOpen(false)} className="text-slate-700 border-slate-300">
              Cancel
            </Button>
            <Button
              onClick={handleConfirmCreatePlan}
              isLoading={submittingPlan}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-5 py-2 rounded-xl shadow-md"
            >
              Create Plan
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};

export default Planning;
