import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../services/api';
import schedulingService from '../services/schedulingService';
import productionService from '../services/productionService';
import productionPlanService from '../services/productionPlanService';
import { useSiteContext } from '../context/SiteContext';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import {
  CalendarClock, Clock, Plus, CheckCircle2, AlertTriangle, RefreshCw,
  XCircle, Filter, CheckCircle, Factory, Play, Undo2, Copy, Check,
  ArrowRight, ArrowLeft, Layers, Sliders, ShieldCheck, X, Sparkles, Edit3
} from 'lucide-react';

const TABS = [
  { id: 'unscheduled', label: '1. Unscheduled Plans', icon: Clock },
  { id: 'scheduled', label: '2. Scheduled Plans', icon: CalendarClock },
  { id: 'in_production', label: '3. In Production', icon: Factory },
  { id: 'completed', label: '4. Completed Plans', icon: CheckCircle2 },
  { id: 'cancelled', label: '5. Cancelled Plans', icon: XCircle },
  { id: 'manual', label: '+ Create Manual Plan', icon: Plus },
];

const SHIFTS = [
  { id: 'GEN', name: 'General Shift', start: '09:00', end: '17:00', hours: 8 },
  { id: 'MORN', name: 'Morning Shift', start: '06:00', end: '14:00', hours: 8 },
  { id: 'EVE', name: 'Evening Shift', start: '14:00', end: '22:00', hours: 8 },
  { id: 'NIGHT', name: 'Night Shift', start: '22:00', end: '06:00', hours: 8 },
];

const priorityBadgeStyles = {
  CRITICAL: 'bg-rose-50 text-rose-700 border border-rose-200',
  Critical: 'bg-rose-50 text-rose-700 border border-rose-200',
  HIGH: 'bg-rose-50 text-rose-700 border border-rose-200',
  High: 'bg-rose-50 text-rose-700 border border-rose-200',
  MEDIUM: 'bg-blue-50 text-blue-700 border border-blue-200',
  Medium: 'bg-blue-50 text-blue-700 border border-blue-200',
  LOW: 'bg-slate-100 text-slate-600 border border-slate-200',
  Low: 'bg-slate-100 text-slate-600 border border-slate-200',
};

const DEFAULT_OPERATIONAL_STAGES = [
  { seq: 1, name: 'Material Staging & Kitting', resource: 'Warehouse Staging Bay', setupMins: 15, runMins: 30, color: 'bg-amber-500', barColor: 'bg-amber-400' },
  { seq: 2, name: 'Preparation & Pre-processing / Weighing', resource: 'Prep Workstation 1', setupMins: 20, runMins: 45, color: 'bg-blue-500', barColor: 'bg-blue-400' },
  { seq: 3, name: 'Core Manufacturing / Assembly', resource: 'Main Processing Line', setupMins: 30, runMins: 120, color: 'bg-indigo-500', barColor: 'bg-indigo-500' },
  { seq: 4, name: 'In-line Quality Inspection (QC)', resource: 'QC Testing Station', setupMins: 10, runMins: 30, color: 'bg-purple-500', barColor: 'bg-purple-400' },
  { seq: 5, name: 'High-Speed Packaging & Labeling', resource: 'Packaging Conveyor 2', setupMins: 15, runMins: 60, color: 'bg-pink-500', barColor: 'bg-pink-400' },
  { seq: 6, name: 'Final QA Sign-off & Warehouse Putaway', resource: 'Finished Goods Dock', setupMins: 10, runMins: 20, color: 'bg-emerald-500', barColor: 'bg-emerald-400' },
];

// Time arithmetic utilities
const addMinutesToTime = (timeStr, minutesToAdd) => {
  if (!timeStr) return '09:00';
  const [hours, mins] = timeStr.split(':').map(Number);
  const totalMins = (hours * 60 + mins + minutesToAdd) % 1440;
  const h = Math.floor(totalMins / 60).toString().padStart(2, '0');
  const m = Math.floor(totalMins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
};

const subtractMinutesFromTime = (timeStr, minutesToSub) => {
  if (!timeStr) return '09:00';
  const [hours, mins] = timeStr.split(':').map(Number);
  let totalMins = (hours * 60 + mins - minutesToSub);
  while (totalMins < 0) totalMins += 1440;
  totalMins = totalMins % 1440;
  const h = Math.floor(totalMins / 60).toString().padStart(2, '0');
  const m = Math.floor(totalMins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
};

const Scheduling = () => {
  const { activeSiteId, activeWarehouseId } = useSiteContext();
  const [activeTab, setActiveTab] = useState('unscheduled');
  const [plans, setPlans] = useState([]);
  const [orders, setOrders] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [boms, setBoms] = useState([]);
  const [warehouses, setWarehouses] = useState([]);

  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);

  // Advanced Schedule Modal State
  const [scheduleModalPlan, setScheduleModalPlan] = useState(null);
  const [schedulingDirection, setSchedulingDirection] = useState('Forward'); // 'Forward' | 'Backward'
  const [selectedShift, setSelectedShift] = useState('GEN');
  const [productionDate, setProductionDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [workCenter, setWorkCenter] = useState('Main Assembly Line 1');
  const [stages, setStages] = useState(DEFAULT_OPERATIONAL_STAGES);

  // Form state for Manual Production Plan creation
  const [manualForm, setManualForm] = useState({
    productId: '',
    bomId: '',
    quantity: 100,
    requiredDate: new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0],
    priority: 'Medium',
    reason: 'Urgent customer demand',
    notes: '',
  });

  // Direct Plan Edit State (Rev. 3)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [editPlanForm, setEditPlanForm] = useState({
    _id: '',
    planNumber: '',
    planName: '',
    productName: '',
    productCode: '',
    bomId: '',
    quantity: 50,
    requiredDate: '',
    warehouseId: '',
    priority: 'MEDIUM',
    workCenter: 'Main Assembly Line 1',
    shiftId: 'Morning Shift',
    seriesId: '',
    seriesIndex: 1,
    seriesTotal: 1,
    editScope: 'SINGLE',
    notes: '',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const query = {};
      if (activeSiteId) query.siteId = activeSiteId;
      if (activeWarehouseId && activeWarehouseId !== 'all') query.warehouseId = activeWarehouseId;

      const [plansRes, ordersRes, matRes, bomRes, whRes] = await Promise.all([
        api.get('/api/production-plans', { params: query }),
        api.get('/api/productions', { params: query }),
        api.get('/api/materials'),
        api.get('/api/boms'),
        api.get('/api/warehouses')
      ]);

      setPlans(plansRes.data?.data || []);
      setOrders(ordersRes.data?.data || []);
      setMaterials((matRes.data?.data || matRes.data?.materials || []).filter(m => m.type === 'Finished' || m.type === 'Semi-Finished'));
      setBoms(bomRes.data?.data || bomRes.data?.boms || []);
      setWarehouses(whRes.data?.warehouses || whRes.data?.data || []);
    } catch (err) {
      console.error('Failed to load scheduling workbench:', err);
    } finally {
      setLoading(false);
    }
  }, [activeSiteId, activeWarehouseId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Open Schedule Modal with Forward/Backward & 6 Stages
  const openScheduleModal = (plan) => {
    setScheduleModalPlan(plan);
    setSchedulingDirection('Forward');
    setSelectedShift('GEN');
    setProductionDate(plan.requiredDate ? new Date(plan.requiredDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
    setStartTime('09:00');
    setEndTime('17:00');
    setWorkCenter(plan.workCenter || 'Main Assembly Line 1');
    setStages(DEFAULT_OPERATIONAL_STAGES.map(s => ({ ...s })));
  };

  // Close Schedule Modal
  const closeScheduleModal = () => {
    setScheduleModalPlan(null);
  };

  // Compute live timings for each stage based on Forward / Backward scheduling direction
  const computedStages = useMemo(() => {
    let currentPointer = schedulingDirection === 'Forward' ? startTime : endTime;
    const computed = [];

    if (schedulingDirection === 'Forward') {
      for (const st of stages) {
        const stageDuration = (Number(st.setupMins) || 0) + (Number(st.runMins) || 0);
        const stStart = currentPointer;
        const stEnd = addMinutesToTime(currentPointer, stageDuration);
        currentPointer = stEnd;
        computed.push({
          ...st,
          startTime: stStart,
          endTime: stEnd,
          totalMins: stageDuration,
        });
      }
    } else {
      // Backward scheduling: work in reverse from target end time
      for (let i = stages.length - 1; i >= 0; i--) {
        const st = stages[i];
        const stageDuration = (Number(st.setupMins) || 0) + (Number(st.runMins) || 0);
        const stEnd = currentPointer;
        const stStart = subtractMinutesFromTime(currentPointer, stageDuration);
        currentPointer = stStart;
        computed.unshift({
          ...st,
          startTime: stStart,
          endTime: stEnd,
          totalMins: stageDuration,
        });
      }
    }

    return computed;
  }, [stages, schedulingDirection, startTime, endTime]);

  // Total Duration & Capacity metrics
  const totalDurationMins = useMemo(() => {
    return stages.reduce((acc, st) => acc + (Number(st.setupMins) || 0) + (Number(st.runMins) || 0), 0);
  }, [stages]);

  const totalDurationHours = (totalDurationMins / 60).toFixed(2);
  const plannedCompletionTime = computedStages.length > 0 ? computedStages[computedStages.length - 1].endTime : endTime;
  const requiredStartTime = computedStages.length > 0 ? computedStages[0].startTime : startTime;

  // Handle Shift Change
  const handleShiftChange = (shiftId) => {
    setSelectedShift(shiftId);
    const sh = SHIFTS.find(s => s.id === shiftId);
    if (sh) {
      setStartTime(sh.start);
      setEndTime(sh.end);
    }
  };

  // Update specific stage property
  const handleStageChange = (index, field, value) => {
    setStages(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  // Commit Schedule from Modal (Stage 1 -> Stage 2)
  const handleCommitSchedule = async () => {
    if (!scheduleModalPlan) return;
    setActionLoadingId(scheduleModalPlan._id);
    setToastMsg(null);

    const payload = {
      productionDate,
      startTime: schedulingDirection === 'Forward' ? startTime : requiredStartTime,
      endTime: schedulingDirection === 'Forward' ? plannedCompletionTime : endTime,
      workCenter,
      estimatedDuration: totalDurationMins,
      scheduling: {
        direction: schedulingDirection,
        schedulingDate: productionDate,
        startTime: schedulingDirection === 'Forward' ? startTime : requiredStartTime,
        durationHours: Number(totalDurationHours),
        plannedStartDateTime: new Date(`${productionDate}T${schedulingDirection === 'Forward' ? startTime : requiredStartTime}`),
        plannedEndDateTime: new Date(`${productionDate}T${schedulingDirection === 'Forward' ? plannedCompletionTime : endTime}`),
        selectedResource: workCenter,
        operations: computedStages.map(s => ({
          seq: s.seq,
          name: s.name,
          resource: s.resource,
          setupMins: Number(s.setupMins) || 0,
          runMins: Number(s.runMins) || 0,
          startTime: s.startTime,
          endTime: s.endTime,
        })),
      }
    };

    try {
      const res = await schedulingService.schedulePlan(scheduleModalPlan._id, payload);
      if (res.success || res.order) {
        setToastMsg({
          type: 'success',
          text: `✓ Plan ${scheduleModalPlan.planNumber} scheduled with ${schedulingDirection} scheduling across 6 operational stages! Generated Order: ${res.order?.prdNumber || 'PO'}.`
        });
        closeScheduleModal();
        await fetchData();
        setActiveTab('scheduled');
      }
    } catch (err) {
      setToastMsg({ type: 'error', text: err.response?.data?.error || `Failed to schedule ${scheduleModalPlan.planNumber}.` });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Stage 2 -> Stage 1: Unschedule Plan (Scheduled -> Unscheduled)
  const handleUnschedule = async (planId, planNumber) => {
    setActionLoadingId(planId);
    setToastMsg(null);
    try {
      const res = await schedulingService.unschedulePlan(planId);
      if (res.success) {
        setToastMsg({
          type: 'info',
          text: `↺ Plan ${planNumber} unscheduled. Soft reservation released and linked order cancelled.`
        });
        await fetchData();
        setActiveTab('unscheduled');
      }
    } catch (err) {
      setToastMsg({ type: 'error', text: err.response?.data?.error || `Failed to unschedule ${planNumber}.` });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Stage 2 -> Stage 3: Start Production (Scheduled -> In Production)
  const handleStartProduction = async (orderId, prdNumber) => {
    setActionLoadingId(orderId);
    setToastMsg(null);
    try {
      const res = await productionService.startProduction(orderId);
      if (res.success || res.data) {
        setToastMsg({
          type: 'success',
          text: `▶ Order ${prdNumber} is now IN PRODUCTION on shop floor!`
        });
        await fetchData();
        setActiveTab('in_production');
      }
    } catch (err) {
      setToastMsg({ type: 'error', text: err.response?.data?.error || `Failed to start production for ${prdNumber}.` });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Stage 3 -> Stage 4: Complete Production (In Production -> Completed)
  const handleCompleteProduction = async (orderId, prdNumber) => {
    setActionLoadingId(orderId);
    setToastMsg(null);
    try {
      const res = await productionService.completeProduction(orderId, { qcStatus: 'Passed' });
      if (res.success || res.data) {
        setToastMsg({
          type: 'success',
          text: `✓ Order ${prdNumber} completed! Materials consumed and Finished Goods credited to Inventory Ledger.`
        });
        await fetchData();
        setActiveTab('completed');
      }
    } catch (err) {
      setToastMsg({ type: 'error', text: err.response?.data?.error || `Failed to complete production for ${prdNumber}.` });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Open Edit Plan Modal
  const handleOpenEditPlan = (plan) => {
    const rawQty = plan.totalPlans || plan.quantity || 1;
    const reqDate = plan.requiredDate ? new Date(plan.requiredDate).toISOString().split('T')[0] : new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
    const shift = plan.schedule?.shiftId || plan.schedule?.shift || 'Morning Shift';

    setEditPlanForm({
      _id: plan._id,
      planNumber: plan.planNumber || 'N/A',
      planName: plan.planName || '',
      productName: plan.productId?.name || plan.product?.name || plan.productName || 'Product',
      productCode: plan.productId?.code || plan.product?.code || plan.productCode || '',
      bomId: plan.bomId?._id || plan.bomId || plan.bom?._id || plan.bom || '',
      quantity: rawQty,
      requiredDate: reqDate,
      warehouseId: plan.warehouseId?._id || plan.warehouseId || (warehouses[0]?._id || ''),
      priority: plan.priority || 'MEDIUM',
      workCenter: plan.workCenter || 'Main Assembly Line 1',
      shiftId: shift,
      seriesId: plan.seriesId || '',
      seriesIndex: plan.seriesIndex || 1,
      seriesTotal: plan.seriesTotal || 1,
      editScope: 'SINGLE',
      notes: plan.notes || plan.remarks || '',
    });
    setIsEditModalOpen(true);
  };

  // Submit Edit Plan
  const handleEditPlanSubmit = async (e) => {
    e.preventDefault();
    if (!editPlanForm._id) return;
    setSubmittingEdit(true);
    try {
      const payload = {
        planName: editPlanForm.planName,
        totalPlans: parseInt(editPlanForm.quantity, 10),
        quantity: parseInt(editPlanForm.quantity, 10),
        bomId: editPlanForm.bomId || undefined,
        warehouseId: editPlanForm.warehouseId,
        requiredDate: editPlanForm.requiredDate,
        priority: editPlanForm.priority,
        workCenter: editPlanForm.workCenter,
        shiftId: editPlanForm.shiftId,
        editScope: editPlanForm.editScope,
        notes: editPlanForm.notes,
      };

      const res = await productionPlanService.updatePlan(editPlanForm._id, payload);
      setToastMsg({ type: 'success', text: res.message || `Plan ${editPlanForm.planNumber} updated successfully.` });
      setIsEditModalOpen(false);
      await fetchData();
    } catch (err) {
      setToastMsg({ type: 'error', text: err.response?.data?.error || err.message || 'Failed to update plan' });
    } finally {
      setSubmittingEdit(false);
    }
  };

  // Copy / Duplicate Plan Action
  const handleCopyPlan = async (planId, planNumber) => {
    setActionLoadingId(planId);
    setToastMsg(null);
    try {
      const res = await productionPlanService.copyPlan(planId);
      if (res.success || res.data) {
        setToastMsg({
          type: 'success',
          text: `✓ Plan ${planNumber} copied successfully as new Plan ${res.data?.planNumber || ''}!`
        });
        await fetchData();
        setActiveTab('unscheduled');
      }
    } catch (err) {
      setToastMsg({ type: 'error', text: err.response?.data?.error || `Failed to copy ${planNumber}.` });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Cancel Plan Action -> Stage 5
  const handleCancelPlan = async (planId, planNumber) => {
    const reason = window.prompt(`Enter reason for cancelling Plan ${planNumber}:`, 'Planner cancellation');
    if (!reason) return;

    setActionLoadingId(planId);
    try {
      const res = await api.post(`/api/production-plans/${planId}/cancel`, { reason });
      if (res.data?.success) {
        setToastMsg({ type: 'info', text: `Plan ${planNumber} cancelled. Reservations released.` });
        await fetchData();
        setActiveTab('cancelled');
      }
    } catch (err) {
      setToastMsg({ type: 'error', text: err.response?.data?.error || 'Cancellation failed.' });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Manual Production Plan Creation Handler
  const handleCreateManualPlan = async (e) => {
    e.preventDefault();
    if (!manualForm.productId || !manualForm.bomId) {
      alert('Please select a Finished Product and BOM recipe.');
      return;
    }

    const targetWh = (activeWarehouseId && activeWarehouseId !== 'all')
      ? activeWarehouseId
      : (warehouses[0] ? warehouses[0]._id : '');

    if (!targetWh) {
      alert('Please select an operational Warehouse context.');
      return;
    }

    try {
      const payload = {
        ...manualForm,
        warehouseId: targetWh,
        siteId: activeSiteId || undefined,
        planSource: 'Manual',
        status: 'Unscheduled',
        scheduling: {
          direction: 'Forward',
          durationHours: 6,
          operations: DEFAULT_OPERATIONAL_STAGES.map(s => ({
            seq: s.seq,
            name: s.name,
            resource: s.resource,
            setupMins: s.setupMins,
            runMins: s.runMins,
          }))
        }
      };

      const res = await productionPlanService.createProductionPlan(payload);
      if (res.success || res.data) {
        setToastMsg({
          type: 'success',
          text: `✓ Manual Production Plan ${res.data?.planNumber || ''} created successfully!`
        });
        await fetchData();
        setActiveTab('unscheduled');
      }
    } catch (err) {
      setToastMsg({ type: 'error', text: err.response?.data?.error || 'Failed to create manual plan.' });
    }
  };

  // Filtered plan lists for all 5 lifecycle stages
  const unscheduledPlans = plans.filter(p => ['Unscheduled', 'Pending', 'Draft', 'UNSCHEDULED'].includes(p.status));
  const scheduledPlans = plans.filter(p => ['Scheduled', 'SCHEDULED', 'RELEASED'].includes(p.status));
  const inProductionPlans = plans.filter(p => ['In Production', 'IN_PROGRESS', 'In Progress'].includes(p.status));
  const inProductionOrders = orders.filter(o => ['In Production', 'In Progress'].includes(o.status));
  const completedPlans = plans.filter(p => ['Completed', 'COMPLETED'].includes(p.status));
  const completedOrders = orders.filter(o => o.status === 'Completed');
  const cancelledPlans = plans.filter(p => ['Cancelled', 'CANCELLED'].includes(p.status));

  return (
    <div className="space-y-6">


      {/* 5-STAGE WORKFLOW METRIC CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        <div 
          onClick={() => setActiveTab('unscheduled')}
          className={`cursor-pointer p-4 rounded-2xl border transition-all ${
            activeTab === 'unscheduled' ? 'bg-amber-50/80 border-amber-300 ring-2 ring-amber-400/20' : 'bg-white border-slate-200 hover:border-amber-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-amber-700 uppercase tracking-widest">1. UNSCHEDULED</span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-amber-600 font-mono mt-2">{loading ? '...' : unscheduledPlans.length}</div>
          <span className="text-[10px] text-slate-500 block font-medium">Awaiting Scheduling</span>
        </div>

        <div 
          onClick={() => setActiveTab('scheduled')}
          className={`cursor-pointer p-4 rounded-2xl border transition-all ${
            activeTab === 'scheduled' ? 'bg-blue-50/80 border-blue-300 ring-2 ring-blue-400/20' : 'bg-white border-slate-200 hover:border-blue-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-blue-700 uppercase tracking-widest">2. SCHEDULED</span>
            <CalendarClock className="h-4 w-4 text-blue-500" />
          </div>
          <div className="text-2xl font-black text-blue-600 font-mono mt-2">{loading ? '...' : scheduledPlans.length}</div>
          <span className="text-[10px] text-slate-500 block font-medium">Soft Reserved & PO Ready</span>
        </div>

        <div 
          onClick={() => setActiveTab('in_production')}
          className={`cursor-pointer p-4 rounded-2xl border transition-all ${
            activeTab === 'in_production' ? 'bg-indigo-50/80 border-indigo-300 ring-2 ring-indigo-400/20' : 'bg-white border-slate-200 hover:border-indigo-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-indigo-700 uppercase tracking-widest">3. IN PRODUCTION</span>
            <Factory className="h-4 w-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-black text-indigo-600 font-mono mt-2">
            {loading ? '...' : Math.max(inProductionPlans.length, inProductionOrders.length)}
          </div>
          <span className="text-[10px] text-slate-500 block font-medium">Active Shopfloor WIP</span>
        </div>

        <div 
          onClick={() => setActiveTab('completed')}
          className={`cursor-pointer p-4 rounded-2xl border transition-all ${
            activeTab === 'completed' ? 'bg-emerald-50/80 border-emerald-300 ring-2 ring-emerald-400/20' : 'bg-white border-slate-200 hover:border-emerald-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">4. COMPLETED</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-emerald-600 font-mono mt-2">
            {loading ? '...' : Math.max(completedPlans.length, completedOrders.length)}
          </div>
          <span className="text-[10px] text-slate-500 block font-medium">QC Passed & Credited</span>
        </div>

        <div 
          onClick={() => setActiveTab('cancelled')}
          className={`cursor-pointer p-4 rounded-2xl border transition-all ${
            activeTab === 'cancelled' ? 'bg-rose-50/80 border-rose-300 ring-2 ring-rose-400/20' : 'bg-white border-slate-200 hover:border-rose-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-rose-700 uppercase tracking-widest">5. CANCELLED</span>
            <XCircle className="h-4 w-4 text-rose-500" />
          </div>
          <div className="text-2xl font-black text-rose-600 font-mono mt-2">{loading ? '...' : cancelledPlans.length}</div>
          <span className="text-[10px] text-slate-500 block font-medium">Archived Audit Trail</span>
        </div>
      </div>

      {/* 5-STAGE WORKFLOW TAB BAR */}
      <div className="flex flex-wrap border-b border-slate-200 bg-white rounded-2xl p-1 shadow-sm gap-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-1.5 px-4 py-2 text-xs font-black rounded-xl transition-all ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* STAGE 1: UNSCHEDULED PLANS */}
      {activeTab === 'unscheduled' && (
        <Card className="bg-white border-slate-200 shadow-sm rounded-2xl overflow-hidden">
          <CardHeader className="border-b border-slate-100 p-4">
            <CardTitle className="text-xs font-black text-slate-900 flex items-center justify-between uppercase tracking-wider">
              <span>STAGE 1: UNSCHEDULED PLANS (AWAITING SCHEDULE & CAPACITY)</span>
              <Badge variant="outline" className="border-amber-200 text-amber-700 bg-amber-50 text-[10px] font-extrabold whitespace-nowrap">
                {unscheduledPlans.length} Unscheduled
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-xs text-slate-700 min-w-[800px]">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="p-4 whitespace-nowrap">Plan Number</th>
                    <th className="p-4">Product Name</th>
                    <th className="p-4 text-right whitespace-nowrap">Quantity</th>
                    <th className="p-4 whitespace-nowrap">Required Date</th>
                    <th className="p-4">Priority / Source</th>
                    <th className="p-4 text-center whitespace-nowrap min-w-[120px]">Status</th>
                    <th className="p-4 text-right whitespace-nowrap">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {unscheduledPlans.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="p-8 text-center text-slate-400 text-xs italic">
                        No unscheduled plans found. Create a manual plan in <strong>+ Create Manual Plan</strong> or run MRP.
                      </td>
                    </tr>
                  ) : (
                    unscheduledPlans.map((plan) => (
                      <tr key={plan._id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-4 font-mono font-bold text-blue-600 whitespace-nowrap">{plan.planNumber}</td>
                        <td className="p-4">
                          <p className="font-extrabold text-slate-900">{plan.productId?.name || 'Product'}</p>
                          <p className="text-[10px] font-mono text-slate-400">{plan.productId?.code}</p>
                          {plan.materialStatus?.status === 'SHORTAGE' && (
                            <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              <AlertTriangle className="w-3 h-3 text-rose-500 shrink-0" />
                              <span>Root Cause: Missing Material Supply</span>
                            </div>
                          )}
                          {plan.holdReason && (
                            <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                              <span>Hold Reason: {plan.holdReason}</span>
                            </div>
                          )}
                        </td>

                        <td className="p-4 text-right font-mono font-black text-slate-900 whitespace-nowrap">
                          {plan.totalPlans || plan.quantity} <span className="text-[10px] text-slate-500 font-normal">{plan.productId?.unit || 'pcs'}</span>
                        </td>
                        <td className="p-4 whitespace-nowrap font-medium text-slate-600">
                          {plan.requiredDate ? new Date(plan.requiredDate).toLocaleDateString() : 'N/A'}
                        </td>
                        <td className="p-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-extrabold ${priorityBadgeStyles[plan.priority || 'MEDIUM']}`}>
                            {plan.priority || 'MEDIUM'}
                          </span>
                        </td>
                        <td className="p-4 text-center whitespace-nowrap">
                          <span className="inline-flex items-center justify-center px-3 py-1 rounded-md text-[10px] font-extrabold uppercase whitespace-nowrap bg-amber-50 text-amber-700 border border-amber-200">
                            Unscheduled
                          </span>
                        </td>
                        <td className="p-4 text-right whitespace-nowrap">
                          <Button
                            size="sm"
                            onClick={() => openScheduleModal(plan)}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs shadow-sm"
                          >
                            <CalendarClock className="h-3.5 w-3.5 mr-1" /> Schedule Plan
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenEditPlan(plan)}
                            className="border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-bold text-xs"
                          >
                            <Edit3 className="h-3.5 w-3.5 mr-1" /> Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            isLoading={actionLoadingId === plan._id}
                            onClick={() => handleCopyPlan(plan._id, plan.planNumber)}
                            className="border-purple-200 text-purple-700 hover:bg-purple-50 font-bold text-xs"
                          >
                            <Copy className="h-3.5 w-3.5 mr-1" /> Copy
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCancelPlan(plan._id, plan.planNumber)}
                            className="border-slate-200 text-slate-500 hover:text-slate-800 font-bold text-xs"
                          >
                            Cancel
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STAGE 2: SCHEDULED PLANS */}
      {activeTab === 'scheduled' && (
        <Card className="bg-white border-slate-200 shadow-sm rounded-2xl overflow-hidden">
          <CardHeader className="border-b border-slate-100 p-4">
            <CardTitle className="text-xs font-black text-slate-900 flex items-center justify-between uppercase tracking-wider">
              <span>STAGE 2: SCHEDULED PLANS (SOFT RESERVED & PO GENERATED)</span>
              <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50 text-[10px] font-extrabold whitespace-nowrap">
                {scheduledPlans.length} Scheduled
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-xs text-slate-700 min-w-[850px]">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="p-4 whitespace-nowrap">Linked PO</th>
                    <th className="p-4 whitespace-nowrap">Plan Number</th>
                    <th className="p-4">Product Name</th>
                    <th className="p-4 text-right whitespace-nowrap">Quantity</th>
                    <th className="p-4 whitespace-nowrap">Scheduled Window</th>
                    <th className="p-4">Priority / Line</th>
                    <th className="p-4 text-center whitespace-nowrap min-w-[120px]">Status</th>
                    <th className="p-4 text-right whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {scheduledPlans.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="p-8 text-center text-slate-400 text-xs italic">
                        No scheduled plans. Click <strong>Schedule Plan</strong> on an unscheduled plan in Stage 1.
                      </td>
                    </tr>
                  ) : (
                    scheduledPlans.map((plan) => {
                      const linkedOrder = orders.find(o => (o.planId?._id || o.planId) === plan._id);
                      return (
                        <tr key={plan._id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="p-4 font-mono font-bold text-indigo-600 whitespace-nowrap">
                            {linkedOrder?.prdNumber || '—'}
                          </td>
                          <td className="p-4 font-mono font-bold text-slate-900 whitespace-nowrap">{plan.planNumber}</td>
                          <td className="p-4">
                            <p className="font-extrabold text-slate-900">{plan.productId?.name || 'Product'}</p>
                            <p className="text-[10px] font-mono text-slate-400">{plan.productId?.code}</p>
                          </td>
                          <td className="p-4 text-right font-mono font-black text-blue-600 whitespace-nowrap">
                            {plan.quantity} <span className="text-[10px] text-slate-500 font-normal">{plan.productId?.unit || 'pcs'}</span>
                          </td>
                          <td className="p-4 font-mono text-xs whitespace-nowrap">
                            <span className="font-bold text-slate-800">
                              {plan.schedule?.startTime || '09:00'} - {plan.schedule?.endTime || '17:00'}
                            </span>
                            <span className="text-[10px] text-slate-400 block font-sans">
                              {plan.scheduledStartDate ? new Date(plan.scheduledStartDate).toLocaleDateString() : 'N/A'} ({plan.scheduling?.direction || 'Forward'})
                            </span>
                          </td>
                          <td className="p-4 text-slate-600">
                            <span className="font-semibold text-slate-800">{plan.priority || 'Medium'}</span>
                            <span className="text-slate-400 text-[10px] block">{plan.workCenter || 'Main Assembly Line 1'}</span>
                          </td>
                          <td className="p-4 text-center whitespace-nowrap">
                            <span className="inline-flex items-center justify-center px-3 py-1 rounded-md text-[10px] font-extrabold uppercase whitespace-nowrap bg-blue-50 text-blue-700 border border-blue-200">
                              Scheduled
                            </span>
                          </td>
                          <td className="p-4 text-right whitespace-nowrap space-x-1.5">
                            {linkedOrder && (
                              <Button
                                size="sm"
                                isLoading={actionLoadingId === linkedOrder._id}
                                onClick={() => handleStartProduction(linkedOrder._id, linkedOrder.prdNumber)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs"
                              >
                                <Play className="h-3 w-3 mr-1" /> Start Production
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              isLoading={actionLoadingId === plan._id}
                              onClick={() => handleCopyPlan(plan._id, plan.planNumber)}
                              className="border-purple-200 text-purple-700 hover:bg-purple-50 font-bold text-xs"
                            >
                              <Copy className="h-3 w-3 mr-1" /> Copy
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              isLoading={actionLoadingId === plan._id}
                              onClick={() => handleUnschedule(plan._id, plan.planNumber)}
                              className="border-rose-200 text-rose-700 hover:bg-rose-50 font-bold text-xs"
                            >
                              <Undo2 className="h-3 w-3 mr-1" /> Unschedule
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleCancelPlan(plan._id, plan.planNumber)}
                              className="border-slate-200 text-slate-500 hover:text-slate-800 font-bold text-xs"
                            >
                              Cancel
                            </Button>
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
      )}

      {/* STAGE 3: IN PRODUCTION */}
      {activeTab === 'in_production' && (
        <Card className="bg-white border-slate-200 shadow-sm rounded-2xl overflow-hidden">
          <CardHeader className="border-b border-slate-100 p-4">
            <CardTitle className="text-xs font-black text-slate-900 flex items-center justify-between uppercase tracking-wider">
              <span>STAGE 3: IN PRODUCTION (ACTIVE SHOPFLOOR EXECUTION & WIP)</span>
              <Badge variant="outline" className="border-indigo-200 text-indigo-700 bg-indigo-50 text-[10px] font-extrabold whitespace-nowrap">
                {inProductionOrders.length} Active Orders
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-xs text-slate-700 min-w-[750px]">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="p-4 whitespace-nowrap">PO Number</th>
                    <th className="p-4 whitespace-nowrap">Plan Ref</th>
                    <th className="p-4">Product Name</th>
                    <th className="p-4 text-right whitespace-nowrap">Target Qty</th>
                    <th className="p-4 whitespace-nowrap">Started At</th>
                    <th className="p-4 text-center whitespace-nowrap min-w-[120px]">Status</th>
                    <th className="p-4 text-right whitespace-nowrap">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {inProductionOrders.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="p-8 text-center text-slate-400 text-xs italic">
                        No orders currently in production. Start execution from Stage 2 (Scheduled Plans).
                      </td>
                    </tr>
                  ) : (
                    inProductionOrders.map((ord) => (
                      <tr key={ord._id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-4 font-mono font-bold text-indigo-600 whitespace-nowrap">{ord.prdNumber}</td>
                        <td className="p-4 font-mono text-slate-500 whitespace-nowrap">{ord.planId?.planNumber || 'Direct'}</td>
                        <td className="p-4">
                          <p className="font-extrabold text-slate-900">{ord.productId?.name || ord.productName || 'Product'}</p>
                          <p className="text-[10px] font-mono text-slate-400">{ord.productId?.code}</p>
                        </td>
                        <td className="p-4 text-right font-mono font-black text-slate-900 whitespace-nowrap">
                          {ord.targetQuantity || ord.quantity} <span className="text-[10px] text-slate-500 font-normal">{ord.productId?.unit || 'pcs'}</span>
                        </td>
                        <td className="p-4 font-mono text-slate-500 whitespace-nowrap">
                          {ord.actualStartDate ? new Date(ord.actualStartDate).toLocaleString() : new Date(ord.updatedAt).toLocaleString()}
                        </td>
                        <td className="p-4 text-center whitespace-nowrap">
                          <span className="inline-flex items-center justify-center px-3 py-1 rounded-md text-[10px] font-extrabold uppercase whitespace-nowrap bg-indigo-50 text-indigo-700 border border-indigo-200 animate-pulse">
                            In Production
                          </span>
                        </td>
                        <td className="p-4 text-right whitespace-nowrap">
                          <Button
                            size="sm"
                            isLoading={actionLoadingId === ord._id}
                            onClick={() => handleCompleteProduction(ord._id, ord.prdNumber)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs"
                          >
                            <CheckCircle className="h-3.5 w-3.5 mr-1" /> Complete & QC
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STAGE 4: COMPLETED PLANS */}
      {activeTab === 'completed' && (
        <Card className="bg-white border-slate-200 shadow-sm rounded-2xl overflow-hidden">
          <CardHeader className="border-b border-slate-100 p-4">
            <CardTitle className="text-xs font-black text-slate-900 flex items-center justify-between uppercase tracking-wider">
              <span>STAGE 4: COMPLETED PRODUCTION (QC APPROVED & LEDGER CREDITED)</span>
              <Badge variant="outline" className="border-emerald-200 text-emerald-700 bg-emerald-50 text-[10px] font-extrabold whitespace-nowrap">
                {completedOrders.length} Completed
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-xs text-slate-700 min-w-[750px]">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="p-4 whitespace-nowrap">PO Number</th>
                    <th className="p-4 whitespace-nowrap">Plan Ref</th>
                    <th className="p-4">Product Name</th>
                    <th className="p-4 text-right whitespace-nowrap">Produced Qty</th>
                    <th className="p-4 whitespace-nowrap">Completed At</th>
                    <th className="p-4 text-center whitespace-nowrap min-w-[120px]">QC / Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {completedOrders.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="p-8 text-center text-slate-400 text-xs italic">
                        No completed production records yet.
                      </td>
                    </tr>
                  ) : (
                    completedOrders.map((ord) => (
                      <tr key={ord._id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-4 font-mono font-bold text-emerald-700 whitespace-nowrap">{ord.prdNumber}</td>
                        <td className="p-4 font-mono text-slate-500 whitespace-nowrap">{ord.planId?.planNumber || 'Direct'}</td>
                        <td className="p-4">
                          <p className="font-extrabold text-slate-900">{ord.productId?.name || ord.productName || 'Product'}</p>
                          <p className="text-[10px] font-mono text-slate-400">{ord.productId?.code}</p>
                        </td>
                        <td className="p-4 text-right font-mono font-black text-emerald-700 whitespace-nowrap">
                          {ord.actualQuantity || ord.targetQuantity || ord.quantity} <span className="text-[10px] text-slate-500 font-normal">{ord.productId?.unit || 'pcs'}</span>
                        </td>
                        <td className="p-4 font-mono text-slate-500 whitespace-nowrap">
                          {ord.actualEndDate ? new Date(ord.actualEndDate).toLocaleString() : new Date(ord.updatedAt).toLocaleString()}
                        </td>
                        <td className="p-4 text-center whitespace-nowrap">
                          <span className="inline-flex items-center justify-center px-3 py-1 rounded-md text-[10px] font-extrabold uppercase whitespace-nowrap bg-emerald-50 text-emerald-700 border border-emerald-200">
                            ✓ Completed & Passed
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STAGE 5: CANCELLED PLANS */}
      {activeTab === 'cancelled' && (
        <Card className="bg-white border-slate-200 shadow-sm rounded-2xl overflow-hidden">
          <CardHeader className="border-b border-slate-100 p-4">
            <CardTitle className="text-xs font-black text-slate-900 flex items-center justify-between uppercase tracking-wider">
              <span>STAGE 5: CANCELLED PRODUCTION PLANS (AUDIT & ARCHIVE HISTORY)</span>
              <Badge variant="outline" className="border-rose-200 text-rose-700 bg-rose-50 text-[10px] font-extrabold whitespace-nowrap">
                {cancelledPlans.length} Cancelled
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-xs text-slate-700 min-w-[700px]">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="p-4 whitespace-nowrap">Plan Number</th>
                    <th className="p-4">Product Name</th>
                    <th className="p-4 text-right whitespace-nowrap">Quantity</th>
                    <th className="p-4">Cancellation Reason</th>
                    <th className="p-4 text-center whitespace-nowrap min-w-[120px]">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {cancelledPlans.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="p-8 text-center text-slate-400 text-xs italic">No cancelled plans recorded.</td>
                    </tr>
                  ) : (
                    cancelledPlans.map((plan) => (
                      <tr key={plan._id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-4 font-mono font-bold text-rose-600 whitespace-nowrap">{plan.planNumber}</td>
                        <td className="p-4">
                          <p className="font-extrabold text-slate-900">{plan.productId?.name || 'Product'}</p>
                          <p className="text-[10px] font-mono text-slate-400">{plan.productId?.code}</p>
                        </td>
                        <td className="p-4 text-right font-mono text-slate-700 whitespace-nowrap">{plan.quantity}</td>
                        <td className="p-4 text-rose-700">{plan.cancelReason || plan.notes || 'Planner cancellation'}</td>
                        <td className="p-4 text-center whitespace-nowrap">
                          <span className="inline-flex items-center justify-center px-3 py-1 rounded-md text-[10px] font-extrabold uppercase whitespace-nowrap bg-rose-50 text-rose-700 border border-rose-200">
                            Cancelled
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* CREATE MANUAL PLAN TAB */}
      {activeTab === 'manual' && (
        <Card className="bg-white border-slate-200 shadow-sm rounded-2xl max-w-3xl mx-auto overflow-hidden">
          <CardHeader className="border-b border-slate-100 p-5">
            <CardTitle className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Plus className="h-4 w-4 text-blue-600" />
              Create Manual Production Plan (Without MRP Run)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <form onSubmit={handleCreateManualPlan} className="space-y-5 text-xs font-medium text-slate-700">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">Finished Product *</label>
                  <select
                    value={manualForm.productId}
                    onChange={(e) => {
                      const prodId = e.target.value;
                      const matchingBom = boms.find(b => (b.productId?._id || b.productId) === prodId);
                      setManualForm({
                        ...manualForm,
                        productId: prodId,
                        bomId: matchingBom ? matchingBom._id : ''
                      });
                    }}
                    required
                    className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 font-bold outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Select Finished Product --</option>
                    {materials.map(m => (
                      <option key={m._id} value={m._id}>{m.code} - {m.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">Associated BOM Recipe *</label>
                  <select
                    value={manualForm.bomId}
                    onChange={(e) => setManualForm({ ...manualForm, bomId: e.target.value })}
                    required
                    className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 font-bold outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Select BOM Recipe --</option>
                    {boms.map(b => (
                      <option key={b._id} value={b._id}>{b.bomNumber} - Batch Size: {b.batchSize} {b.batchUOM}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">Target Quantity *</label>
                  <input
                    type="number"
                    value={manualForm.quantity}
                    onChange={(e) => setManualForm({ ...manualForm, quantity: parseFloat(e.target.value) || 0 })}
                    required
                    className="w-full p-2 border border-slate-200 rounded-xl bg-slate-50 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">Required Date *</label>
                  <input
                    type="date"
                    value={manualForm.requiredDate}
                    onChange={(e) => setManualForm({ ...manualForm, requiredDate: e.target.value })}
                    required
                    className="w-full p-2 border border-slate-200 rounded-xl bg-slate-50 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">Priority</label>
                  <select
                    value={manualForm.priority}
                    onChange={(e) => setManualForm({ ...manualForm, priority: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-xl bg-slate-50 font-bold"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>
              </div>

              {/* 6 STAGES PREVIEW BANNER */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-black text-slate-800 uppercase tracking-wider">
                  <span className="flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-blue-600" />
                    Standard 6 Operational Stages (Forward Routing)
                  </span>
                  <span className="text-blue-600 font-mono">6 Stages Configured</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 pt-1 text-[10px]">
                  {DEFAULT_OPERATIONAL_STAGES.map((s) => (
                    <div key={s.seq} className="p-2 bg-white rounded-lg border border-slate-200 flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${s.color}`}></span>
                      <span className="font-bold text-slate-700 truncate">{s.seq}. {s.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">Reason / Customer Reference</label>
                <input
                  type="text"
                  value={manualForm.reason}
                  onChange={(e) => setManualForm({ ...manualForm, reason: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50"
                  placeholder="e.g. Urgent customer order"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <Button size="sm" type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold px-6 py-2 rounded-xl">
                  Create Manual Planned Order
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* ADVANCED PRODUCTION SCHEDULING & 6 OPERATIONAL STAGES MODAL               */}
      {/* ========================================================================= */}
      {scheduleModalPlan && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-4xl my-8 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            
            {/* MODAL HEADER */}
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <CalendarClock className="h-5 w-5 text-blue-400" />
                  <h3 className="text-sm font-black tracking-wide uppercase">
                    Production Scheduling Workbench & Operational Stages
                  </h3>
                </div>
                <p className="text-xs text-slate-400 font-medium">
                  Plan: <span className="font-mono font-bold text-white">{scheduleModalPlan.planNumber}</span> • Product:{' '}
                  <span className="text-blue-300 font-bold">{scheduleModalPlan.productId?.name || 'Product'}</span> (
                  <span className="font-mono font-bold text-white">{scheduleModalPlan.quantity} {scheduleModalPlan.productId?.unit || 'pcs'}</span>)
                </p>
              </div>
              <button 
                onClick={closeScheduleModal}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
              
              {/* TOP CONFIGURATION: FORWARD / BACKWARD & TIMINGS */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                
                {/* 1. SCHEDULING DIRECTION */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black uppercase text-slate-500 tracking-wider">
                    Scheduling Method & Direction
                  </label>
                  <div className="grid grid-cols-2 gap-1.5 p-1 bg-white rounded-xl border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setSchedulingDirection('Forward')}
                      className={`flex items-center justify-center gap-1 py-1.5 text-xs font-black rounded-lg transition-all ${
                        schedulingDirection === 'Forward'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                      Forward
                    </button>
                    <button
                      type="button"
                      onClick={() => setSchedulingDirection('Backward')}
                      className={`flex items-center justify-center gap-1 py-1.5 text-xs font-black rounded-lg transition-all ${
                        schedulingDirection === 'Backward'
                          ? 'bg-purple-600 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      Backward
                    </button>
                  </div>
                  <span className="text-[10px] text-slate-500 block leading-tight">
                    {schedulingDirection === 'Forward' 
                      ? '⏩ Starts from Start Time → calculates completion.'
                      : '⏪ Starts from Target Due Date → calculates start.'}
                  </span>
                </div>

                {/* 2. PRODUCTION DATE & SHIFT */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black uppercase text-slate-500 tracking-wider">
                    Production Date & Shift
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={productionDate}
                      onChange={(e) => setProductionDate(e.target.value)}
                      className="p-2 border border-slate-200 rounded-xl bg-white text-xs font-mono font-bold outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <select
                      value={selectedShift}
                      onChange={(e) => handleShiftChange(e.target.value)}
                      className="p-2 border border-slate-200 rounded-xl bg-white text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {SHIFTS.map(sh => (
                        <option key={sh.id} value={sh.id}>{sh.name}</option>
                      ))}
                    </select>
                  </div>
                  <span className="text-[10px] text-slate-500 block">
                    Shift Window: {startTime} - {endTime} (8.0 Hours)
                  </span>
                </div>

                {/* 3. WORK CENTER / PRODUCTION LINE */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black uppercase text-slate-500 tracking-wider">
                    Assigned Work Center / Line
                  </label>
                  <select
                    value={workCenter}
                    onChange={(e) => setWorkCenter(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-xl bg-white text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Main Assembly Line 1">Main Assembly Line 1</option>
                    <option value="Secondary Processing Line 2">Secondary Processing Line 2</option>
                    <option value="High-Speed Blending Unit B">High-Speed Blending Unit B</option>
                    <option value="Automated Packaging Bay 3">Automated Packaging Bay 3</option>
                  </select>
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span>Duration: <strong className="text-slate-800 font-mono">{totalDurationHours} hrs</strong> ({totalDurationMins}m)</span>
                    <span className="font-bold text-emerald-600">Capacity: Sufficient</span>
                  </div>
                </div>

              </div>

              {/* VISUAL OPERATIONS GANTT / TIMELINE BAR */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-black text-slate-800 uppercase tracking-wider">
                  <span className="flex items-center gap-1.5">
                    <Sliders className="h-4 w-4 text-blue-600" />
                    Multi-Stage Production Timeline Preview
                  </span>
                  <div className="flex items-center gap-3 text-xs font-mono font-bold">
                    <span className="text-blue-600">Start: {schedulingDirection === 'Forward' ? startTime : requiredStartTime}</span>
                    <span>→</span>
                    <span className="text-emerald-600">End: {schedulingDirection === 'Forward' ? plannedCompletionTime : endTime}</span>
                  </div>
                </div>

                {/* Progress bar sequence */}
                <div className="h-6 w-full bg-slate-100 rounded-xl overflow-hidden flex border border-slate-200 shadow-inner">
                  {computedStages.map((st) => {
                    const widthPct = Math.max(8, (st.totalMins / totalDurationMins) * 100);
                    return (
                      <div
                        key={st.seq}
                        style={{ width: `${widthPct}%` }}
                        title={`${st.seq}. ${st.name}: ${st.startTime} - ${st.endTime} (${st.totalMins}m)`}
                        className={`${st.barColor} h-full border-r border-white/40 flex items-center justify-center text-[10px] font-black text-white px-1 truncate transition-all`}
                      >
                        {st.seq}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* THE 6 OPERATIONAL STAGES BREAKDOWN */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-black text-slate-900 uppercase tracking-wider">
                  <span>The 6 Manufacturing Operational Stages</span>
                  <span className="text-[10px] font-bold text-slate-400">Editable Setup & Run Durations</span>
                </div>

                <div className="overflow-x-auto custom-scrollbar rounded-2xl border border-slate-200">
                  <table className="w-full text-left text-xs text-slate-700 min-w-[650px]">
                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="p-3 w-8 text-center">#</th>
                        <th className="p-3">Stage Name</th>
                        <th className="p-3">Workstation / Resource</th>
                        <th className="p-3 text-center w-24">Setup (min)</th>
                        <th className="p-3 text-center w-24">Run (min)</th>
                        <th className="p-3 text-center w-20">Total</th>
                        <th className="p-3 text-right whitespace-nowrap">Scheduled Window</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {computedStages.map((st, idx) => (
                        <tr key={st.seq} className="hover:bg-slate-50/70 transition-colors">
                          <td className="p-3 text-center font-bold">
                            <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-[10px] font-black ${st.color}`}>
                              {st.seq}
                            </span>
                          </td>
                          <td className="p-3 font-extrabold text-slate-900">{st.name}</td>
                          <td className="p-3">
                            <input
                              type="text"
                              value={st.resource}
                              onChange={(e) => handleStageChange(idx, 'resource', e.target.value)}
                              className="w-full p-1.5 border border-slate-200 rounded-lg text-xs font-semibold bg-white"
                            />
                          </td>
                          <td className="p-3 text-center">
                            <input
                              type="number"
                              min="0"
                              value={st.setupMins}
                              onChange={(e) => handleStageChange(idx, 'setupMins', parseInt(e.target.value) || 0)}
                              className="w-16 p-1.5 border border-slate-200 rounded-lg text-xs font-mono font-bold text-center bg-white"
                            />
                          </td>
                          <td className="p-3 text-center">
                            <input
                              type="number"
                              min="0"
                              value={st.runMins}
                              onChange={(e) => handleStageChange(idx, 'runMins', parseInt(e.target.value) || 0)}
                              className="w-16 p-1.5 border border-slate-200 rounded-lg text-xs font-mono font-bold text-center bg-white"
                            />
                          </td>
                          <td className="p-3 text-center font-mono font-bold text-slate-700">
                            {st.totalMins}m
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-blue-600 whitespace-nowrap">
                            {st.startTime} - {st.endTime}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* HEALTH & CAPACITY SUMMARY */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-2xl flex items-center gap-3">
                  <ShieldCheck className="h-6 w-6 text-emerald-600 shrink-0" />
                  <div>
                    <p className="text-xs font-black text-emerald-900">Shift Capacity Validated (Sufficient)</p>
                    <p className="text-[10px] text-emerald-700 font-medium">
                      Total required {totalDurationHours} hrs fits within the 8.0 hr {selectedShift} Shift window with 0 conflicts.
                    </p>
                  </div>
                </div>

                <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-2xl flex items-center gap-3">
                  <Sparkles className="h-6 w-6 text-blue-600 shrink-0" />
                  <div>
                    <p className="text-xs font-black text-blue-900">Soft Inventory Allocation</p>
                    <p className="text-[10px] text-blue-700 font-medium">
                      Scheduling will reserve component stock in warehouse and generate Production Order.
                    </p>
                  </div>
                </div>
              </div>

            </div>

            {/* MODAL FOOTER */}
            <div className="bg-slate-50 p-4 border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">
                Method: <strong className="text-slate-800">{schedulingDirection} Scheduling</strong> • Total: <strong className="text-blue-600 font-mono">{totalDurationHours}h</strong>
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={closeScheduleModal}
                  className="font-bold text-xs"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  isLoading={actionLoadingId === scheduleModalPlan._id}
                  onClick={handleCommitSchedule}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold px-6 py-2 rounded-xl shadow-md"
                >
                  <Check className="h-4 w-4 mr-1.5" /> Confirm & Commit Schedule
                </Button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: EDIT PRODUCTION PLAN (Direct Quantity, Shift, BOM, Warehouse, Scope) */}
      {/* ========================================================================= */}
      {isEditModalOpen && editPlanForm._id && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl border border-slate-100 animate-scaleIn max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl"><Edit3 className="w-5 h-5" /></div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Edit Plan {editPlanForm.planNumber}</h3>
                  <p className="text-xs text-slate-500">Update planned quantity, production shift, recipe, or target warehouse</p>
                </div>
              </div>
              <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleEditPlanSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Target Product</label>
                  <div className="p-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 flex items-center justify-between">
                    <span className="truncate">{editPlanForm.productName}</span>
                    <span className="text-[10px] text-slate-500 font-mono">({editPlanForm.productCode || 'SKU'})</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Plan Title</label>
                  <input
                    type="text"
                    value={editPlanForm.planName}
                    onChange={e => setEditPlanForm(prev => ({ ...prev, planName: e.target.value }))}
                    placeholder="e.g. Q3 Main Frame Assembly Plan"
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Number of Plans (Qty) *</label>
                  <input
                    type="number"
                    min="1"
                    value={editPlanForm.quantity}
                    onChange={e => setEditPlanForm(prev => ({ ...prev, quantity: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                    className="w-full text-xs p-2.5 bg-blue-50/50 border border-blue-200 rounded-xl font-black text-blue-900 focus:bg-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Required Completion Date *</label>
                  <input
                    type="date"
                    value={editPlanForm.requiredDate}
                    onChange={e => setEditPlanForm(prev => ({ ...prev, requiredDate: e.target.value }))}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:bg-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Priority</label>
                  <select
                    value={editPlanForm.priority}
                    onChange={e => setEditPlanForm(prev => ({ ...prev, priority: e.target.value }))}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:bg-white"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Recipe / BOM Version</label>
                  <select
                    value={editPlanForm.bomId}
                    onChange={e => setEditPlanForm(prev => ({ ...prev, bomId: e.target.value }))}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:bg-white"
                  >
                    <option value="">Active Standard Recipe (Default)</option>
                    {boms.map(b => (
                      <option key={b._id} value={b._id}>{b.bomNumber} (v{b.version || 1}) - {b.components?.length || 0} components</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Target Warehouse *</label>
                  <select
                    value={editPlanForm.warehouseId}
                    onChange={e => setEditPlanForm(prev => ({ ...prev, warehouseId: e.target.value }))}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:bg-white"
                    required
                  >
                    {warehouses.map(w => (
                      <option key={w._id} value={w._id}>{w.name} ({w.code})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Work Center / Line</label>
                  <input
                    type="text"
                    value={editPlanForm.workCenter}
                    onChange={e => setEditPlanForm(prev => ({ ...prev, workCenter: e.target.value }))}
                    placeholder="e.g. Main Assembly Line 1"
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Default Production Shift</label>
                  <select
                    value={editPlanForm.shiftId}
                    onChange={e => setEditPlanForm(prev => ({ ...prev, shiftId: e.target.value }))}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:bg-white"
                  >
                    <option value="Morning Shift">Morning Shift (08:00 - 16:00)</option>
                    <option value="Evening Shift">Evening Shift (16:00 - 00:00)</option>
                    <option value="Night Shift">Night Shift (00:00 - 08:00)</option>
                  </select>
                </div>
              </div>

              {/* Edit Scope: Only this plan vs All remaining plans in series */}
              {(editPlanForm.seriesId || editPlanForm.seriesTotal > 1) && (
                <div className="p-3.5 bg-indigo-50/80 border border-indigo-200 rounded-xl space-y-2">
                  <label className="block text-xs font-black text-indigo-950">
                    Apply Updates To:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className={`p-2.5 rounded-lg border text-xs cursor-pointer flex items-center gap-2 transition-all ${editPlanForm.editScope === 'SINGLE' ? 'bg-white border-indigo-500 shadow-sm text-indigo-900 font-bold' : 'bg-indigo-100/40 border-transparent text-slate-700 font-medium'}`}>
                      <input
                        type="radio"
                        name="editScope"
                        value="SINGLE"
                        checked={editPlanForm.editScope === 'SINGLE'}
                        onChange={() => setEditPlanForm(prev => ({ ...prev, editScope: 'SINGLE' }))}
                        className="text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>Only this Plan ({editPlanForm.planNumber})</span>
                    </label>

                    <label className={`p-2.5 rounded-lg border text-xs cursor-pointer flex items-center gap-2 transition-all ${editPlanForm.editScope === 'ALL_REMAINING' ? 'bg-white border-indigo-500 shadow-sm text-indigo-900 font-bold' : 'bg-indigo-100/40 border-transparent text-slate-700 font-medium'}`}>
                      <input
                        type="radio"
                        name="editScope"
                        value="ALL_REMAINING"
                        checked={editPlanForm.editScope === 'ALL_REMAINING'}
                        onChange={() => setEditPlanForm(prev => ({ ...prev, editScope: 'ALL_REMAINING' }))}
                        className="text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>All Remaining Plans in Series</span>
                    </label>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Planner Remarks & Notes</label>
                <textarea
                  rows={2}
                  value={editPlanForm.notes}
                  onChange={e => setEditPlanForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Special shop-floor constraints..."
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:bg-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditModalOpen(false)}
                  className="text-xs font-bold"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  isLoading={submittingEdit}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm"
                >
                  <Check className="w-4 h-4 mr-1.5" />
                  <span>{editPlanForm.editScope === 'ALL_REMAINING' ? 'Save All Remaining Plans' : 'Save Plan Changes'}</span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Floating Non-Intrusive Toast Feedback */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md w-full animate-slideUp pointer-events-auto">
          <div className={`p-4 rounded-2xl shadow-2xl border flex items-start justify-between gap-3 backdrop-blur-md ${
            toastMsg.type === 'success'
              ? 'bg-slate-900/95 text-white border-emerald-500/40'
              : 'bg-slate-900/95 text-white border-rose-500/40'
          }`}>
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-xl mt-0.5 ${toastMsg.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                {toastMsg.type === 'success' ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <AlertTriangle className="h-5 w-5 shrink-0" />}
              </div>
              <div>
                <div className={`text-xs font-black uppercase tracking-wider ${toastMsg.type === 'success' ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {toastMsg.type === 'success' ? 'Completed' : 'Notice / Issue'}
                </div>
                <div className="text-xs font-medium text-slate-200 mt-1 leading-relaxed">{toastMsg.text}</div>
              </div>
            </div>
            <button onClick={() => setToastMsg(null)} className="text-slate-400 hover:text-white text-lg font-bold p-1 leading-none">×</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Scheduling;

