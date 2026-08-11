import React, { useState, useEffect } from 'react';
import api from '../services/api';
import planningService from '../services/planningService';
import productionPlanService from '../services/productionPlanService';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Dialog } from '../components/ui/Dialog';
import {
  Cpu, Calculator, AlertTriangle, CheckCircle, Package, ArrowRight, RefreshCw,
  FilePlus, CalendarClock, Play, Undo2, Factory, Clock, ShieldCheck, Copy, Trash2, Zap,
  Layers, CheckCircle2, XCircle, Settings, ArrowLeftRight
} from 'lucide-react';

const Planning = () => {
  const [activeTab, setActiveTab] = useState('plans'); // 'mrp' or 'plans'
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [boms, setBoms] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(false);

  // Form inputs for MRP Calculation
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

  // Modal State for Manual Production Plan Creation
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [manualProductId, setManualProductId] = useState('');
  const [manualBomId, setManualBomId] = useState('');
  const [manualWarehouseId, setManualWarehouseId] = useState('');
  const [manualPriority, setManualPriority] = useState('Medium');
  const [plannedQty, setPlannedQty] = useState(100);
  const [manualRequiredDate, setManualRequiredDate] = useState(new Date().toISOString().split('T')[0]);
  const [planNotes, setPlanNotes] = useState('Manual Production Plan Commitment');
  const [submittingPlan, setSubmittingPlan] = useState(false);

  // Modal State for Enterprise Schedule Plan (Dynamics 365 Architecture)
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [targetPlanToSchedule, setTargetPlanToSchedule] = useState(null);
  const [scheduleQty, setScheduleQty] = useState(100);
  const [schedulingDirection, setSchedulingDirection] = useState('Forward'); // 'Forward' or 'Backward'
  const [schedulingDate, setSchedulingDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('09:00');
  const [durationHours, setDurationHours] = useState(6);
  const [resourceGroup, setResourceGroup] = useState('Assembly & Production');
  const [selectedResource, setSelectedResource] = useState('Main Assembly Line 1');
  const [capacityRequired, setCapacityRequired] = useState(6);
  const [capacityAvailable, setCapacityAvailable] = useState(8);
  const [materialReadinessList, setMaterialReadinessList] = useState([]);
  const [checkingReadiness, setCheckingReadiness] = useState(false);

  const [submittingSchedule, setSubmittingSchedule] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Load dropdown master data and production plans on mount
  const fetchPlans = async () => {
    setLoadingPlans(true);
    try {
      const res = await productionPlanService.getProductionPlans();
      setPlans(res.data || res.plans || []);
    } catch (err) {
      console.error('Failed to load production plans:', err);
    } finally {
      setLoadingPlans(false);
    }
  };

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
        if (whList.length > 0) {
          setSelectedWarehouseId(whList[0]._id);
          setManualWarehouseId(whList[0]._id);
        }

        const matList = matRes.data.data || matRes.data.materials || [];
        setProducts(matList);
        if (matList.length > 0) {
          setSelectedProductId(matList[0]._id);
          setManualProductId(matList[0]._id);
        }

        const bomList = bomRes.data.data || bomRes.data.boms || [];
        setBoms(bomList);
        if (bomList.length > 0) {
          setSelectedBomId(bomList[0]._id);
          setManualBomId(bomList[0]._id);
        }
      } catch (err) {
        console.error('Failed to load planning master data:', err);
      }
    };
    loadMasterData();
    fetchPlans();
  }, []);

  // Sync manual BOM when product changes
  useEffect(() => {
    if (manualProductId && boms.length > 0) {
      const matched = boms.find(b => (b.productId?._id || b.productId) === manualProductId);
      if (matched) setManualBomId(matched._id);
    }
  }, [manualProductId, boms]);

  // Update selected BOM automatically when Product changes in MRP form
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

  // Handle Create Production Plan Submission (Manual Plan Options)
  const handleConfirmCreatePlan = async () => {
    if (!plannedQty || plannedQty <= 0) return;
    setSubmittingPlan(true);
    setErrorMsg('');

    try {
      const res = await productionPlanService.createProductionPlan({
        productId: manualProductId || selectedProductId,
        bomId: manualBomId || selectedBomId,
        warehouseId: manualWarehouseId || selectedWarehouseId,
        quantity: parseFloat(plannedQty),
        priority: manualPriority,
        requiredDate: manualRequiredDate || requiredDate,
        status: 'Unscheduled',
        notes: planNotes
      });

      if (res.success || res.data) {
        const createdPlan = res.data;
        setSuccessMsg(`✓ Production Plan ${createdPlan.planNumber || 'PLAN-001'} created successfully in UNSCHEDULED state!`);
        setIsCreateModalOpen(false);
        await fetchPlans();
        setActiveTab('plans');
      }
    } catch (err) {
      console.error('Create Plan Error:', err);
      setErrorMsg(err.response?.data?.error || 'Failed to create Production Plan.');
    } finally {
      setSubmittingPlan(false);
    }
  };

  // Open Schedule Modal for a selected plan & evaluate material readiness
  const handleOpenScheduleModal = async (plan) => {
    setTargetPlanToSchedule(plan);
    const initialQty = plan.remainingQuantity !== undefined ? plan.remainingQuantity : plan.quantity;
    setScheduleQty(initialQty);
    setSelectedResource(plan.workCenter || 'Main Assembly Line 1');
    setIsScheduleModalOpen(true);

    // Fetch real-time material readiness for this plan
    setCheckingReadiness(true);
    try {
      const productId = plan.productId?._id || plan.productId;
      const bomId = plan.bomId?._id || plan.bomId;
      const warehouseId = plan.warehouseId?._id || plan.warehouseId;

      if (productId && warehouseId) {
        const res = await planningService.calculateMRP({
          productId,
          bomId,
          warehouseId,
          targetQty: parseFloat(initialQty),
          requiredDate: plan.requiredDate ? new Date(plan.requiredDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
        });
        setMaterialReadinessList(res.requirements || []);
      }
    } catch (err) {
      console.warn('Readiness check warning:', err.message);
    } finally {
      setCheckingReadiness(false);
    }
  };

  // Confirm Schedule Plan (Validates inventory, soft-reserves stock, creates ProductionOrder)
  const handleConfirmSchedulePlan = async () => {
    if (!targetPlanToSchedule) return;
    setSubmittingSchedule(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const hasShortage = materialReadinessList.some(m => (m.shortageQty || 0) > 0);
      const res = await productionPlanService.schedulePlan(targetPlanToSchedule._id, {
        quantity: parseFloat(scheduleQty),
        direction: schedulingDirection,
        schedulingDate,
        startTime,
        durationHours,
        resourceGroup,
        workCenter: selectedResource,
        capacityRequired,
        capacityAvailable,
        materialCheckStatus: hasShortage ? 'Shortage' : 'Ready',
        capacityCheckStatus: capacityRequired <= capacityAvailable ? 'Sufficient' : 'Overcapacity',
        startDate: schedulingDate,
        endDate: new Date(new Date(schedulingDate).getTime() + (durationHours * 3600000)).toISOString().split('T')[0]
      });

      if (res.success || res.data) {
        setSuccessMsg(`✓ Plan ${targetPlanToSchedule.planNumber} scheduled! Production Order created and materials soft-reserved.`);
        setIsScheduleModalOpen(false);
        await fetchPlans();
      }
    } catch (err) {
      console.error('Schedule Plan Error:', err);
      setErrorMsg(err.response?.data?.error || 'Failed to schedule Production Plan.');
    } finally {
      setSubmittingSchedule(false);
    }
  };

  // Handle Unschedule Plan (Releases soft-reservation, cancels order, returns to Unscheduled)
  const handleUnschedulePlan = async (plan) => {
    setActionLoadingId(plan._id);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await productionPlanService.unschedulePlan(plan._id);
      if (res.success || res.data) {
        setSuccessMsg(`✓ Plan ${plan.planNumber} unscheduled safely. Reservation released and stock returned to Available.`);
        await fetchPlans();
      }
    } catch (err) {
      console.error('Unschedule Plan Error:', err);
      setErrorMsg(err.response?.data?.error || 'Failed to unschedule Production Plan.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // 1-Click Copy Plan
  const handleCopyPlan = async (plan) => {
    setActionLoadingId(plan._id);
    try {
      const res = await productionPlanService.copyPlan(plan._id);
      if (res.success || res.data) {
        setSuccessMsg(`✓ Duplicate Plan ${res.data?.planNumber || 'PLAN-COPY'} created!`);
        await fetchPlans();
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Failed to copy Production Plan.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const selectedProductObj = products.find(p => p._id === selectedProductId);
  const selectedWarehouseObj = warehouses.find(w => w._id === selectedWarehouseId);
  const selectedBomObj = boms.find(b => b._id === selectedBomId);

  // Computed End Date/Time string
  const calculatedEndTimeStr = () => {
    try {
      const [h, m] = startTime.split(':').map(Number);
      const startMs = new Date(schedulingDate).setHours(h, m, 0, 0);
      const endMs = startMs + (durationHours * 3600000);
      return new Date(endMs).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    } catch (e) {
      return `${schedulingDate} ${startTime}`;
    }
  };

  const hasMaterialShortage = materialReadinessList.some(m => (m.shortageQty || 0) > 0);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-3.5">
          <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-blue-600">
            <Cpu className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">MRP Planning & Production Scheduling Workbench</h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Decision layer connecting MRP proposals to Production Orders with finite material availability and resource capacity checks
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

      {/* Navigation Tabs: 1. Production Plans Workbench | 2. MRP Engine */}
      <div className="flex border-b border-slate-200 bg-white rounded-t-xl px-2 pt-1">
        <button
          onClick={() => setActiveTab('plans')}
          className={`flex items-center space-x-2 px-5 py-3 text-xs font-bold transition-all border-b-2 -mb-px ${
            activeTab === 'plans'
              ? 'border-blue-600 text-blue-700 bg-blue-50/50'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <CalendarClock className="h-4 w-4" />
          <span>1. Schedule Plans Workbench ({plans.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('mrp')}
          className={`flex items-center space-x-2 px-5 py-3 text-xs font-bold transition-all border-b-2 -mb-px ${
            activeTab === 'mrp'
              ? 'border-blue-600 text-blue-700 bg-blue-50/50'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Calculator className="h-4 w-4" />
          <span>2. MRP Calculation & Netting Engine</span>
        </button>
      </div>

      {/* TAB 1: PRODUCTION PLANS & SCHEDULING WORKBENCH */}
      {activeTab === 'plans' && (
        <div className="space-y-6">
          {/* Action Bar */}
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center space-x-2 text-xs font-bold text-slate-700">
              <Package className="h-4 w-4 text-blue-600" />
              <span>Production Plans Lifecycle (DRAFT ➔ UNSCHEDULED ➔ SCHEDULED ➔ RELEASED)</span>
            </div>
            <div className="flex items-center space-x-3">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchPlans}
                isLoading={loadingPlans}
                className="text-xs font-bold text-slate-700 border-slate-300 flex items-center space-x-1"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Refresh Plans</span>
              </Button>
              <Button
                onClick={() => {
                  setPlannedQty(100);
                  setIsCreateModalOpen(true);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-sm flex items-center space-x-1.5"
              >
                <FilePlus className="h-4 w-4" />
                <span>+ Create Manual Production Plan</span>
              </Button>
            </div>
          </div>

          {/* Production Plans Table */}
          <Card className="bg-white border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 pb-4">
              <CardTitle className="text-xs font-bold text-slate-900 flex items-center justify-between uppercase tracking-wider">
                <span>SCHEDULE PLANS WORKBENCH (DECISION LAYER)</span>
                <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50 text-[10px]">
                  {plans.length} Total Proposals
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="p-4">Plan ID</th>
                      <th className="p-4">Product Name</th>
                      <th className="p-4">Priority</th>
                      <th className="p-4">Target Warehouse</th>
                      <th className="p-4">Target Qty</th>
                      <th className="p-4">Scheduled Qty</th>
                      <th className="p-4">Remaining Qty</th>
                      <th className="p-4 text-center">Status</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {plans.length === 0 ? (
                      <tr>
                        <td colSpan="9" className="p-8 text-center text-slate-400 text-xs">
                          No production plans generated yet. Click <strong>+ Create Manual Production Plan</strong> or run MRP in Tab 2.
                        </td>
                      </tr>
                    ) : (
                      plans.map((plan) => {
                        const isScheduled = plan.status === 'Scheduled' || plan.status === 'Partially Scheduled';
                        const canUnschedule = isScheduled;

                        return (
                          <tr key={plan._id} className="hover:bg-slate-50 transition-colors">
                            <td className="p-4 font-mono font-bold text-indigo-600">
                              {plan.planNumber}
                            </td>
                            <td className="p-4 font-bold text-slate-900">
                              {plan.productId?.name || 'Finished Goods'}
                            </td>
                            <td className="p-4">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                plan.priority === 'High' || plan.priority === 'Critical'
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                  : 'bg-slate-100 text-slate-700'
                              }`}>
                                {plan.priority || 'Medium'}
                              </span>
                            </td>
                            <td className="p-4 text-slate-700">
                              {plan.warehouseId?.name || 'Main Warehouse'}
                            </td>
                            <td className="p-4 font-mono font-bold text-slate-900">
                              {plan.originalQuantity || plan.quantity}
                            </td>
                            <td className="p-4 font-mono font-bold text-blue-600">
                              {plan.scheduledQuantity || 0}
                            </td>
                            <td className="p-4 font-mono font-bold text-amber-600">
                              {plan.remainingQuantity !== undefined ? plan.remainingQuantity : (plan.quantity - (plan.scheduledQuantity || 0))}
                            </td>
                            <td className="p-4 text-center">
                              <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                                isScheduled
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : 'bg-amber-50 text-amber-700 border-amber-200'
                              }`}>
                                {plan.status}
                              </span>
                            </td>
                            <td className="p-4 text-right space-x-2">
                              <Button
                                size="sm"
                                variant="outline"
                                title="Copy Plan"
                                onClick={() => handleCopyPlan(plan)}
                                className="text-slate-600 border-slate-200 hover:bg-slate-100 p-1.5 rounded-lg"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </Button>

                              {canUnschedule ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  isLoading={actionLoadingId === plan._id}
                                  onClick={() => handleUnschedulePlan(plan)}
                                  className="text-rose-600 border-rose-200 hover:bg-rose-50 font-bold text-[11px] px-3 py-1.5 rounded-lg"
                                >
                                  <Undo2 className="h-3.5 w-3.5 mr-1" />
                                  Unschedule
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  onClick={() => handleOpenScheduleModal(plan)}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] px-3.5 py-1.5 rounded-lg shadow-xs"
                                >
                                  <CalendarClock className="h-3.5 w-3.5 mr-1" />
                                  Schedule
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 2: MRP ENGINE & MATERIAL NETTING */}
      {activeTab === 'mrp' && (
        <div className="space-y-6">
          <Card className="bg-white border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 pb-4">
              <CardTitle className="text-xs font-bold text-slate-900 flex items-center space-x-2 uppercase tracking-wider">
                <Calculator className="h-4 w-4 text-blue-600" />
                <span>MRP CALCULATION PARAMETERS</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <form onSubmit={handleCalculateMRP} className="grid grid-cols-1 md:grid-cols-4 gap-4">
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

          {mrpResult && (
            <div className="space-y-6">
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

              <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-6 rounded-xl text-white shadow-md flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                  <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest block">STEP 2: CREATE PRODUCTION COMMITMENT</span>
                  <h3 className="text-base font-bold text-white mt-0.5">
                    Ready to commit {targetQty} {selectedProductObj?.unit || 'Pcs'} of {selectedProductObj?.name}?
                  </h3>
                  <p className="text-xs text-slate-300 mt-1">
                    Creates a <strong>Production Plan (Status: Unscheduled)</strong>. Physical inventory remains unchanged until Scheduled.
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
        </div>
      )}

      {/* Modal: CREATE MANUAL PRODUCTION PLAN */}
      <Dialog
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="CREATE MANUAL PRODUCTION PLAN"
        className="!max-w-xl bg-white border border-slate-200 text-slate-900 rounded-xl p-6 shadow-xl"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1 uppercase tracking-wider">Product *</label>
              <select
                value={manualProductId}
                onChange={(e) => setManualProductId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 h-10"
              >
                {products.map(p => (
                  <option key={p._id} value={p._id}>{p.name} [{p.code}]</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1 uppercase tracking-wider">BOM Recipe *</label>
              <select
                value={manualBomId}
                onChange={(e) => setManualBomId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 h-10"
              >
                {boms.map(b => (
                  <option key={b._id} value={b._id}>{b.name || b.bomNumber || 'BOM-001'}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1 uppercase tracking-wider">Target Warehouse *</label>
              <select
                value={manualWarehouseId}
                onChange={(e) => setManualWarehouseId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 h-10"
              >
                {warehouses.map(w => (
                  <option key={w._id} value={w._id}>{w.name} ({w.code})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1 uppercase tracking-wider">Priority *</label>
              <select
                value={manualPriority}
                onChange={(e) => setManualPriority(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 h-10"
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
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
              <label className="text-xs font-bold text-slate-700 block mb-1 uppercase tracking-wider">Required Date *</label>
              <input
                type="date"
                value={manualRequiredDate}
                onChange={(e) => setManualRequiredDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 h-10"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1 uppercase tracking-wider">Planning Notes / Reason</label>
            <textarea
              rows={2}
              value={planNotes}
              onChange={(e) => setPlanNotes(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Manual production commitment rationale..."
            />
          </div>

          <div className="p-3 bg-blue-50 border border-blue-200 text-blue-800 rounded-xl text-[11px] font-medium leading-relaxed">
            💡 <strong>Commitment Rule</strong>: Creating a plan saves the proposal as <strong>UNSCHEDULED</strong>. Physical inventory remains unchanged until Scheduled.
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
              Create Manual Plan
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Modal: ENTERPRISE SCHEDULE PLAN DECISION WORKBENCH (Dynamics 365 Architecture) */}
      <Dialog
        isOpen={isScheduleModalOpen}
        onClose={() => setIsScheduleModalOpen(false)}
        title={`SCHEDULE PLAN: ${targetPlanToSchedule?.planNumber || 'PLAN-001'}`}
        className="!max-w-3xl bg-white border border-slate-200 text-slate-900 rounded-xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="space-y-6">

          {/* SECTION 1: READ-ONLY PLAN INFORMATION */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="font-bold text-slate-500 uppercase text-[10px] tracking-wider">SECTION 1 — PLAN INFORMATION</span>
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-mono font-bold">
                {targetPlanToSchedule?.planNumber}
              </Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-slate-700">
              <div>
                <span className="text-slate-400 block font-medium">Product:</span>
                <strong className="text-slate-900">{targetPlanToSchedule?.productId?.name || 'Product'}</strong>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">BOM Reference:</span>
                <strong className="text-indigo-600 font-mono">{targetPlanToSchedule?.bomId?.bomNumber || 'BOM-001'}</strong>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Warehouse:</span>
                <strong className="text-slate-900">{targetPlanToSchedule?.warehouseId?.name || 'Main Warehouse'}</strong>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Priority:</span>
                <span className="font-bold text-rose-600">{targetPlanToSchedule?.priority || 'Medium'}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Demand Quantity:</span>
                <strong className="text-slate-900 font-mono">{targetPlanToSchedule?.originalQuantity || targetPlanToSchedule?.quantity} Pcs</strong>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Remaining to Schedule:</span>
                <strong className="text-amber-700 font-mono font-bold">{targetPlanToSchedule?.remainingQuantity !== undefined ? targetPlanToSchedule?.remainingQuantity : targetPlanToSchedule?.quantity} Pcs</strong>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Required Date:</span>
                <strong className="text-slate-900">{targetPlanToSchedule?.requiredDate ? new Date(targetPlanToSchedule.requiredDate).toLocaleDateString() : '-'}</strong>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Plan Source:</span>
                <strong className="text-slate-900">{targetPlanToSchedule?.planSource || 'Manual'}</strong>
              </div>
            </div>
          </div>

          {/* SECTION 2: SCHEDULING INPUTS (DIRECTION & TIMING) */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center space-x-1.5">
              <CalendarClock className="h-4 w-4 text-blue-600" />
              <span>SECTION 2 — SCHEDULING INPUTS & DIRECTION</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1 uppercase tracking-wider">Scheduling Quantity *</label>
                <input
                  type="number"
                  min="1"
                  max={targetPlanToSchedule?.remainingQuantity || targetPlanToSchedule?.quantity}
                  value={scheduleQty}
                  onChange={(e) => setScheduleQty(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 h-10 font-mono"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1 uppercase tracking-wider">Scheduling Direction *</label>
                <div className="flex items-center space-x-2 bg-slate-100 p-1 rounded-xl border border-slate-200 h-10">
                  <button
                    type="button"
                    onClick={() => setSchedulingDirection('Forward')}
                    className={`flex-1 py-1 text-xs font-bold rounded-lg transition-all ${
                      schedulingDirection === 'Forward'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Forward ➔
                  </button>
                  <button
                    type="button"
                    onClick={() => setSchedulingDirection('Backward')}
                    className={`flex-1 py-1 text-xs font-bold rounded-lg transition-all ${
                      schedulingDirection === 'Backward'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    ← Backward
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1 uppercase tracking-wider">Scheduling Date *</label>
                <input
                  type="date"
                  value={schedulingDate}
                  onChange={(e) => setSchedulingDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 h-10"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1 uppercase tracking-wider">Start Time *</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 h-10"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1 uppercase tracking-wider">Calculated Duration (Hrs)</label>
                <input
                  type="number"
                  min="1"
                  value={durationHours}
                  onChange={(e) => setDurationHours(parseFloat(e.target.value) || 1)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 h-10 font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1 uppercase tracking-wider">Calculated Completion Time</label>
                <div className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 h-10 flex items-center">
                  {calculatedEndTimeStr()}
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 3: RESOURCE GROUP & CAPACITY */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center space-x-1.5">
              <Factory className="h-4 w-4 text-blue-600" />
              <span>SECTION 3 — RESOURCE GROUP & WORK CENTER CAPACITY</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1 uppercase tracking-wider">Resource Group *</label>
                <select
                  value={resourceGroup}
                  onChange={(e) => setResourceGroup(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 h-10"
                >
                  <option value="Assembly & Production">Assembly & Production</option>
                  <option value="Mixing & Blending">Mixing & Blending</option>
                  <option value="Cooking & Processing">Cooking & Processing</option>
                  <option value="Packaging & QC">Packaging & QC</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1 uppercase tracking-wider">Selected Resource Line *</label>
                <select
                  value={selectedResource}
                  onChange={(e) => setSelectedResource(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 h-10"
                >
                  <option value="Main Assembly Line 1">Main Assembly Line 1</option>
                  <option value="Line 2 - High Speed">Line 2 - High Speed</option>
                  <option value="Mixer-01 Heavy Duty">Mixer-01 Heavy Duty</option>
                  <option value="Cooker Bay A">Cooker Bay A</option>
                  <option value="Pack Station 01">Pack Station 01</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1 uppercase tracking-wider">Capacity Status</label>
                <div className="w-full px-3 py-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold h-10 flex items-center justify-between">
                  <span>Req: {durationHours}h / Avail: {capacityAvailable}h</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-600 text-white uppercase font-black">
                    {durationHours <= capacityAvailable ? '✅ SUFFICIENT' : '⚠ OVERCAPACITY'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 4: COMPONENT MATERIAL READINESS CHECK TABLE */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center space-x-1.5">
                <ShieldCheck className="h-4 w-4 text-blue-600" />
                <span>SECTION 4 — COMPONENT MATERIAL READINESS CHECK</span>
              </h4>

              {hasMaterialShortage ? (
                <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 text-[10px] font-bold">
                  ❌ MATERIAL SHORTAGE DETECTED
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold">
                  ✅ ALL MATERIALS READY FOR RESERVATION
                </Badge>
              )}
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
              <table className="w-full text-left">
                <thead className="bg-slate-100 text-slate-500 font-bold uppercase text-[10px] border-b border-slate-200">
                  <tr>
                    <th className="p-3">Component Material</th>
                    <th className="p-3">Required</th>
                    <th className="p-3">Available Stock</th>
                    <th className="p-3">Reserved</th>
                    <th className="p-3">Shortage</th>
                    <th className="p-3 text-center">Readiness Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {checkingReadiness ? (
                    <tr><td colSpan="6" className="p-4 text-center text-slate-400">Evaluating warehouse inventory...</td></tr>
                  ) : materialReadinessList.length === 0 ? (
                    <tr><td colSpan="6" className="p-4 text-center text-slate-400">No BOM components required or BOM is empty.</td></tr>
                  ) : (
                    materialReadinessList.map((m, idx) => {
                      const isShort = (m.shortageQty || 0) > 0;
                      return (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-3 font-bold text-slate-900">{m.materialName}</td>
                          <td className="p-3 font-mono text-slate-900">{m.requiredQty} {m.unit}</td>
                          <td className="p-3 font-mono text-emerald-600 font-bold">{m.availableQty} {m.unit}</td>
                          <td className="p-3 font-mono text-slate-500">{m.reservedQty || 0} {m.unit}</td>
                          <td className="p-3 font-mono font-bold text-rose-600">{m.shortageQty || 0} {m.unit}</td>
                          <td className="p-3 text-center">
                            {isShort ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                ❌ Shortage
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                ✅ Ready
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* SECTION 5: OPERATION ROUTE SCHEDULE */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center space-x-1.5">
              <Layers className="h-4 w-4 text-blue-600" />
              <span>SECTION 5 — MANUFACTURING OPERATION ROUTE SCHEDULE</span>
            </h4>

            <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
              <table className="w-full text-left">
                <thead className="bg-slate-100 text-slate-500 font-bold uppercase text-[10px] border-b border-slate-200">
                  <tr>
                    <th className="p-3">Seq</th>
                    <th className="p-3">Operation Name</th>
                    <th className="p-3">Work Resource</th>
                    <th className="p-3">Setup</th>
                    <th className="p-3">Run Time</th>
                    <th className="p-3">Scheduled Start - End</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  <tr className="hover:bg-slate-50">
                    <td className="p-3 font-mono font-bold text-blue-600">10</td>
                    <td className="p-3 font-bold text-slate-900">Component Preparation & Mixing</td>
                    <td className="p-3 text-slate-600">Mixer-01 Heavy Duty</td>
                    <td className="p-3 font-mono">30 mins</td>
                    <td className="p-3 font-mono">2.0 hrs</td>
                    <td className="p-3 font-mono text-slate-900 font-bold">09:00 AM - 11:30 AM</td>
                  </tr>
                  <tr className="hover:bg-slate-50">
                    <td className="p-3 font-mono font-bold text-blue-600">20</td>
                    <td className="p-3 font-bold text-slate-900">Main Assembly & Cooking</td>
                    <td className="p-3 text-slate-600">Cooker Bay A / Line 1</td>
                    <td className="p-3 font-mono">20 mins</td>
                    <td className="p-3 font-mono">3.0 hrs</td>
                    <td className="p-3 font-mono text-slate-900 font-bold">11:30 AM - 02:50 PM</td>
                  </tr>
                  <tr className="hover:bg-slate-50">
                    <td className="p-3 font-mono font-bold text-blue-600">30</td>
                    <td className="p-3 font-bold text-slate-900">Packaging & Quality Inspection</td>
                    <td className="p-3 text-slate-600">Pack Station 01</td>
                    <td className="p-3 font-mono">15 mins</td>
                    <td className="p-3 font-mono">1.0 hr</td>
                    <td className="p-3 font-mono text-slate-900 font-bold">02:50 PM - 04:05 PM</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* SECTION 6: SCHEDULING CONFIRMATION SUMMARY */}
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-5 rounded-xl text-white shadow-xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-700 pb-2">
              <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">SCHEDULE CONFIRMATION SUMMARY</span>
              <span className="text-xs font-mono font-bold text-emerald-400">ORDER PREVIEW: PRD-GENERATED</span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">Product:</span>
                <strong className="text-white font-bold">{targetPlanToSchedule?.productId?.name || 'Product'}</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Schedule Qty:</span>
                <strong className="text-emerald-400 font-mono font-black text-sm">{scheduleQty} Pcs</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Resource Line:</span>
                <strong className="text-blue-300">{selectedResource}</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Material Status:</span>
                <strong className={hasMaterialShortage ? "text-rose-400" : "text-emerald-400"}>
                  {hasMaterialShortage ? '⚠ SHORTAGE DETECTED' : '✅ ALL READY'}
                </strong>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-700/80 flex items-center justify-end space-x-3">
              <Button variant="outline" size="sm" onClick={() => setIsScheduleModalOpen(false)} className="text-slate-300 border-slate-600 hover:bg-slate-800">
                Cancel
              </Button>
              <Button
                onClick={handleConfirmSchedulePlan}
                isLoading={submittingSchedule}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-6 py-2.5 rounded-xl shadow-lg flex items-center space-x-2"
              >
                <CalendarClock className="h-4 w-4" />
                <span>Confirm & Schedule Plan</span>
              </Button>
            </div>
          </div>

        </div>
      </Dialog>
    </div>
  );
};

export default Planning;
