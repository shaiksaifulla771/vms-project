import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import api from '../services/api';
import productionPlanService from '../services/productionPlanService';
import { useSiteContext } from '../context/SiteContext';
import usePageMeta from '../hooks/usePageMeta';
import {
  Cpu, Play, RefreshCw, AlertTriangle, CheckCircle2,
  ShoppingCart, Calendar, PlusCircle, Clock, PauseCircle, FileText,
  Search, X, Scissors, BarChart3,
  CalendarClock, ArrowUpRight, History, Check, Info, Copy,
  Edit3, Eye, Layers, Calculator, Sliders, AlertCircle,
  Split, ChevronRight, Sparkles
} from 'lucide-react';


const DEFAULT_OPERATIONAL_STAGES = [
  { seq: 1, name: 'Material Staging & Kitting', color: 'bg-amber-500' },
  { seq: 2, name: 'Preparation & Weighing', color: 'bg-blue-500' },
  { seq: 3, name: 'Core Manufacturing / Assembly', color: 'bg-indigo-500' },
  { seq: 4, name: 'In-line Quality Inspection (QC)', color: 'bg-purple-500' },
  { seq: 5, name: 'High-Speed Packaging & Labeling', color: 'bg-pink-500' },
  { seq: 6, name: 'Final QA & Warehouse Putaway', color: 'bg-emerald-500' },
];

const statusBadgeStyles = {
  UNSCHEDULED: 'bg-amber-50 text-amber-800 border-amber-200/80',
  Unscheduled: 'bg-amber-50 text-amber-800 border-amber-200/80',
  DRAFT: 'bg-slate-100 text-slate-700 border-slate-200',
  Draft: 'bg-slate-100 text-slate-700 border-slate-200',
  VALIDATED: 'bg-cyan-50 text-cyan-800 border-cyan-200',
  PENDING_APPROVAL: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  APPROVED: 'bg-teal-50 text-teal-800 border-teal-200',
  REJECTED: 'bg-red-50 text-red-800 border-red-200',
  SCHEDULED: 'bg-blue-50 text-blue-800 border-blue-200/80',
  Scheduled: 'bg-blue-50 text-blue-800 border-blue-200/80',
  'Partially Scheduled': 'bg-indigo-50 text-indigo-800 border-indigo-200/80',
  RELEASED: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
  Released: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
  IN_PROGRESS: 'bg-purple-50 text-purple-800 border-purple-200/80',
  'In Production': 'bg-purple-50 text-purple-800 border-purple-200/80',
  PARTIALLY_COMPLETED: 'bg-indigo-50 text-indigo-800 border-indigo-200/80',
  COMPLETED: 'bg-slate-100 text-slate-800 border-slate-300/80',
  Completed: 'bg-slate-100 text-slate-800 border-slate-300/80',
  ON_HOLD: 'bg-orange-50 text-orange-800 border-orange-200/80',
  'On Hold': 'bg-orange-50 text-orange-800 border-orange-200/80',
  CANCELLED: 'bg-rose-50 text-rose-800 border-rose-200/80',
  Cancelled: 'bg-rose-50 text-rose-800 border-rose-200/80',
};

const priorityStyles = {
  HIGH: 'bg-rose-50 text-rose-700 border-rose-200',
  MEDIUM: 'bg-amber-50 text-amber-700 border-amber-200',
  LOW: 'bg-slate-50 text-slate-600 border-slate-200',
  CRITICAL: 'bg-red-100 text-red-800 border-red-300 font-black',
};

function useToast(duration = 5000) {
  const [msg, setMsg] = useState('');
  const timerRef = useRef(null);
  const show = useCallback((text) => {
    setMsg(text);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setMsg(''), duration);
  }, [duration]);
  const clear = useCallback(() => { setMsg(''); if (timerRef.current) clearTimeout(timerRef.current); }, []);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  return [msg, show, clear];
}

export default function MRP() {
  usePageMeta('MRP & Production Planning', 'Multi-level BOM explosion, time-phased netting, and discrete lot sizing.');
  const { activeSiteId, activeWarehouseId, activeSite, activeWarehouse } = useSiteContext();

  // Navigation Tabs: 'dashboard' | 'unscheduled' | 'scheduled' | 'on_hold' | 'templates' | 'all_plans' | 'netting' | 'exceptions' | 'runs'
  const [viewTab, setViewTab] = useState('dashboard');
  const [planFilter, setPlanFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Summary & Master Data State
  const [summaryData, setSummaryData] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [exceptions, setExceptions] = useState([]);
  const [loadingExceptions, setLoadingExceptions] = useState(false);

  const [runs, setRuns] = useState([]);
  const [totalRuns, setTotalRuns] = useState(0);
  const [runsPage, setRunsPage] = useState(1);
  const [selectedRun, setSelectedRun] = useState(null);
  const [requirements, setRequirements] = useState([]);

  const [plans, setPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [materials, setMaterials] = useState([]);
  const [boms, setBoms] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [sites, setSites] = useState([]);

  // Active Plan & Modal Control States
  const [activePlan, setActivePlan] = useState(null);
  const [isRunModalOpen, setIsRunModalOpen] = useState(false);
  const [isCreatePlanModalOpen, setIsCreatePlanModalOpen] = useState(false);
  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);
  const [isEditPlanModalOpen, setIsEditPlanModalOpen] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isRescheduleModalOpen, setIsRescheduleModalOpen] = useState(false);
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [isMatCheckModalOpen, setIsMatCheckModalOpen] = useState(false);

  // Submitting states
  const [executingMRP, setExecutingMRP] = useState(false);
  const [submittingCreatePlan, setSubmittingCreatePlan] = useState(false);
  const [submittingCopy, setSubmittingCopy] = useState(false);
  const [submittingEditPlan, setSubmittingEditPlan] = useState(false);
  const [submittingSchedule, setSubmittingSchedule] = useState(false);
  const [submittingReschedule, setSubmittingReschedule] = useState(false);
  const [submittingSplit, setSubmittingSplit] = useState(false);

  // Live Material & Staleness Check states
  const [matCheckResult, setMatCheckResult] = useState(null);
  const [matChecking, setMatChecking] = useState(false);
  const [copySourcePlan, setCopySourcePlan] = useState(null);
  const [copyStaleness, setCopyStaleness] = useState(null);
  const [checkingStaleness, setCheckingStaleness] = useState(false);

  // Plan Series Expansion
  const [expandedPlanId, setExpandedPlanId] = useState(null);
  const [planInstancesMap, setPlanInstancesMap] = useState({});
  const [loadingInstances, setLoadingInstances] = useState(false);

  // Toast notifications
  const [errorMsg, showError, clearError] = useToast(6000);
  const [successMsg, showSuccess, clearSuccess] = useToast(5000);

  // 1. Unified Plan Creation Form
  const [createPlanForm, setCreatePlanForm] = useState({
    planName: '',
    productId: '',
    bomId: '',
    quantity: 50,
    requiredDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    warehouseId: '',
    priority: 'MEDIUM',
    workCenter: 'Main Assembly Line 1',
    shiftId: 'Morning Shift',
    enableSplitting: false,
    splitMode: 'COUNT',
    splitValue: 2,
    notes: '',
  });

  // 2. Unified Batch Copy & Reuse Form
  const [copyForm, setCopyForm] = useState({
    copyCount: 10,
    quantity: 50,
    requiredDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    warehouseId: '',
    priority: 'MEDIUM',
    shiftId: 'Morning Shift',
    notes: '',
  });

  // 3. Unified Edit Plan Form
  const [editPlanForm, setEditPlanForm] = useState({
    _id: '',
    planNumber: '',
    planName: '',
    productId: '',
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

  // 4. Run MRP Form
  const [runForm, setRunForm] = useState({
    productId: '',
    siteId: '',
    warehouseId: 'all',
    warehouseScope: 'all',
    targetQty: 100,
    horizonDays: 30,
    requiredDate: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
  });

  // 5. Schedule & Reschedule Forms
  const [scheduleForm, setScheduleForm] = useState({
    productionDate: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0],
    startTime: '08:00',
    endTime: '16:00',
    shiftId: 'Morning Shift',
    lineId: 'Assembly Line Alpha',
    estimatedDuration: 480,
  });

  const [rescheduleForm, setRescheduleForm] = useState({
    productionDate: new Date(Date.now() + 4 * 86400000).toISOString().split('T')[0],
    startTime: '08:00',
    endTime: '16:00',
    shiftId: 'Morning Shift',
    lineId: 'Assembly Line Alpha',
    reason: '',
  });

  const [splitForm, setSplitForm] = useState({
    splits: [
      { quantity: 50, requiredDate: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0], lineId: 'Assembly Line Alpha' },
      { quantity: 50, requiredDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0], lineId: 'Assembly Line Alpha' }
    ]
  });

  // 6. View Calculation Modal State (Section 4 & 5 Transparent MRP Breakdown)
  const [isCalcModalOpen, setIsCalcModalOpen] = useState(false);
  const [selectedCalcItem, setSelectedCalcItem] = useState(null);

  // 7. Existing Plan Matching Engine State (Section 7 Formula)
  const [isMatchDrawerOpen, setIsMatchDrawerOpen] = useState(false);
  const [matchedPlans, setMatchedPlans] = useState([]);
  const [matchingLoading, setMatchingLoading] = useState(false);
  const [selectedMatchForInspection, setSelectedMatchForInspection] = useState(null);
  const [isMatchDetailsModalOpen, setIsMatchDetailsModalOpen] = useState(false);
  const [allocateQty, setAllocateQty] = useState(50);
  const [allocatingPlanId, setAllocatingPlanId] = useState(null);


  // Data Fetching

  const fetchSummary = useCallback(async () => {
    setLoadingSummary(true);
    try {
      const query = {};
      if (activeSiteId) query.siteId = activeSiteId;
      if (activeWarehouseId && activeWarehouseId !== 'all') query.warehouseId = activeWarehouseId;
      const res = await api.get('/mrp/summary', { params: query });
      setSummaryData(res.data.summary);
    } catch (err) {
      console.warn('[MRP Dashboard] Summary fetch error:', err.message);
    } finally {
      setLoadingSummary(false);
    }
  }, [activeSiteId, activeWarehouseId]);

  const fetchExceptions = useCallback(async () => {
    setLoadingExceptions(true);
    try {
      const query = {};
      if (activeSiteId) query.siteId = activeSiteId;
      const res = await api.get('/mrp/exceptions', { params: query });
      setExceptions(res.data.data || []);
    } catch (err) {
      console.warn('[MRP Exceptions] Fetch error:', err.message);
    } finally {
      setLoadingExceptions(false);
    }
  }, [activeSiteId]);

  const fetchData = useCallback(async () => {
    setLoadingPlans(true);
    try {
      const query = {};
      if (activeSiteId) query.siteId = activeSiteId;
      if (activeWarehouseId && activeWarehouseId !== 'all') query.warehouseId = activeWarehouseId;

      const [matsRes, whsRes, bomsRes, sitesRes, runsRes, plansRes] = await Promise.all([
        api.get('/materials'),
        api.get('/warehouses'),
        api.get('/boms').catch(() => ({ data: { boms: [] } })),
        api.get('/sites').catch(() => ({ data: { data: [], sites: [] } })),
        api.get('/mrp', { params: { ...query, page: runsPage, limit: 20 } }),
        productionPlanService.getProductionPlans(query),
      ]);

      const matList = matsRes.data.data || matsRes.data.materials || [];
      const whList = whsRes.data.data || whsRes.data.warehouses || [];
      const bomList = bomsRes.data.data || bomsRes.data.boms || [];
      const siteList = sitesRes.data.data || sitesRes.data.sites || [];
      const runList = runsRes.data.runs || [];
      const planList = plansRes.data || plansRes.plans || [];

      setMaterials(matList);
      setWarehouses(whList);
      setBoms(bomList);
      setSites(siteList);
      setRuns(runList);
      setTotalRuns(runsRes.data.total || runList.length);
      setPlans(planList);

      const makeMats = matList.filter(m => m.type === 'Finished' || m.type === 'Semi-Finished' || m.makeOrBuy === 'MAKE');
      if (makeMats.length > 0 && !runForm.productId) {
        setRunForm(prev => ({ ...prev, productId: makeMats[0]._id }));
      }
      if (whList.length > 0 && !createPlanForm.warehouseId) {
        setCreatePlanForm(prev => ({ ...prev, warehouseId: whList[0]._id }));
      }

      fetchSummary();
      fetchExceptions();
    } catch (err) {
      showError(err.response?.data?.error || err.message || 'Failed to load planning data');
    } finally {
      setLoadingPlans(false);
    }
  }, [activeSiteId, activeWarehouseId, runsPage, fetchSummary, fetchExceptions, showError]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Inspect Run
  const inspectRun = async (runId) => {
    try {
      const res = await api.get(`/mrp/runs/${runId}`);
      setSelectedRun(res.data.mrpRun || res.data);
      setRequirements(res.data.requirements || []);
      setViewTab('netting');
    } catch (err) {
      showError(err.response?.data?.error || 'Failed to inspect run');
    }
  };

  // Run MRP Netting Calculation
  const handleExecuteRun = async (e) => {
    e.preventDefault();
    if (!runForm.productId) return showError('Please select a target product.');
    setExecutingMRP(true);
    try {
      const payload = {
        productId: runForm.productId,
        siteId: activeSiteId || runForm.siteId || undefined,
        warehouseId: runForm.warehouseId === 'all' ? undefined : runForm.warehouseId,
        warehouseScope: runForm.warehouseId === 'all' ? 'all' : 'single',
        targetQty: parseFloat(runForm.targetQty),
        horizonDays: parseInt(runForm.horizonDays, 10),
        requiredDate: runForm.requiredDate,
      };
      const res = await api.post('/mrp/run', payload);
      showSuccess(`MRP calculation completed! Run ${res.data.mrpRun?.runNumber || res.data.runNumber} generated.`);
      setIsRunModalOpen(false);
      await fetchData();
      if (res.data.mrpRun?._id) {
        inspectRun(res.data.mrpRun._id);
      }
    } catch (err) {
      showError(err.response?.data?.error || err.message || 'MRP calculation failed');
    } finally {
      setExecutingMRP(false);
    }
  };

  // Create Unified Production Plan
  const handleCreatePlanSubmit = async (e) => {
    e.preventDefault();
    if (!createPlanForm.productId) return showError('Target product is required');
    if (!createPlanForm.warehouseId) return showError('Target warehouse is required');
    if (Number(createPlanForm.quantity) <= 0) return showError('Planned quantity must be greater than zero');

    setSubmittingCreatePlan(true);
    try {
      let res;
      if (createPlanForm.enableSplitting && Number(createPlanForm.splitValue) > 1) {
        res = await api.post('/production-plans/wizard', {
          ...createPlanForm,
          totalQuantity: createPlanForm.quantity,
        });
      } else {
        res = await api.post('/production-plans/manual', {
          ...createPlanForm,
          totalPlans: createPlanForm.quantity,
        });
      }

      const planData = res.data?.data || res.data;
      const matStatus = res.data?.materialStatus;

      if (matStatus?.status === 'SHORTAGE') {
        showSuccess(`Plan ${planData.planNumber || ''} created! Note: Shortages detected for ${matStatus.shortages?.length || 0} component(s).`);
      } else {
        showSuccess(res.data.message || `Production Plan ${planData.planNumber || ''} created successfully.`);
      }

      setIsCreatePlanModalOpen(false);
      await fetchData();
    } catch (err) {
      showError(err.response?.data?.error || err.message || 'Failed to create production plan');
    } finally {
      setSubmittingCreatePlan(false);
    }
  };

  // Open Batch Copy & Reuse Modal
  const handleOpenCopy = async (plan) => {
    setCopySourcePlan(plan);
    setCopyStaleness(null);
    setCheckingStaleness(true);
    setCopyForm({
      copyCount: 10,
      quantity: plan.totalPlans || plan.quantity || 50,
      requiredDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      warehouseId: plan.warehouseId?._id || plan.warehouseId || (warehouses[0]?._id || ''),
      priority: plan.priority || 'MEDIUM',
      shiftId: plan.schedule?.shiftId || plan.schedule?.shift || 'Morning Shift',
      notes: `Batch copy series from ${plan.planNumber}`,
    });
    setIsCopyModalOpen(true);

    try {
      const res = await api.get(`/production-plans/${plan._id}/reuse-staleness`);
      setCopyStaleness(res.data.data);
    } catch (err) {
      console.warn('Could not check BOM staleness:', err);
    } finally {
      setCheckingStaleness(false);
    }
  };

  // Submit Batch Copy & Reuse Plans
  const handleCopySubmit = async (e) => {
    e.preventDefault();
    if (!copySourcePlan) return;
    setSubmittingCopy(true);
    try {
      const res = await productionPlanService.copyPlan(copySourcePlan._id, {
        copyCount: parseInt(copyForm.copyCount, 10) || 1,
        quantity: parseInt(copyForm.quantity, 10),
        requiredDate: copyForm.requiredDate,
        warehouseId: copyForm.warehouseId,
        priority: copyForm.priority,
        shiftId: copyForm.shiftId,
        notes: copyForm.notes,
      });
      showSuccess(res.message || `Created ${copyForm.copyCount} copy plans in grouped series.`);
      setIsCopyModalOpen(false);
      setCopySourcePlan(null);
      await fetchData();
    } catch (err) {
      showError(err.response?.data?.error || err.message || 'Failed to copy plan series');
    } finally {
      setSubmittingCopy(false);
    }
  };

  // Open Direct Plan Edit Modal
  const handleOpenEditPlan = (plan) => {
    const rawQty = plan.totalPlans || plan.quantity || 1;
    const reqDate = plan.requiredDate ? new Date(plan.requiredDate).toISOString().split('T')[0] : new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
    const shift = plan.schedule?.shiftId || plan.schedule?.shift || 'Morning Shift';

    setEditPlanForm({
      _id: plan._id,
      planNumber: plan.planNumber || 'N/A',
      planName: plan.planName || '',
      productId: plan.productId?._id || plan.productId || plan.product?._id || plan.product || '',
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
    setIsEditPlanModalOpen(true);
  };

  // Submit Plan Edit (Single or Series scope)
  const handleEditPlanSubmit = async (e) => {
    e.preventDefault();
    if (!editPlanForm._id) return;
    if (Number(editPlanForm.quantity) <= 0) return showError('Planned quantity must be at least 1');

    setSubmittingEditPlan(true);
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
      showSuccess(res.message || `Plan ${editPlanForm.planNumber} updated successfully.`);
      setIsEditPlanModalOpen(false);
      await fetchData();
    } catch (err) {
      showError(err.response?.data?.error || err.message || 'Failed to update plan');
    } finally {
      setSubmittingEditPlan(false);
    }
  };

  // Live Material Availability Check Modal
  const handleCheckMaterials = async (plan) => {
    setActivePlan(plan);
    setMatChecking(true);
    setMatCheckResult(null);
    setIsMatCheckModalOpen(true);
    try {
      const res = await api.post(`/production-plans/${plan._id}/material-check`, {
        warehouseId: plan.warehouseId?._id || plan.warehouseId,
        siteId: plan.siteId?._id || plan.siteId,
      });
      setMatCheckResult(res.data?.materialStatus || res.data);
      await fetchData();
    } catch (err) {
      showError(err.response?.data?.error || err.message || 'Failed to check material availability');
    } finally {
      setMatChecking(false);
    }
  };

  // Direct Status Transition Handlers
  const handleSchedulePlan = async (e) => {
    e.preventDefault();
    if (!activePlan) return;
    setSubmittingSchedule(true);
    try {
      await api.post(`/production-plans/${activePlan._id}/schedule`, scheduleForm);
      showSuccess(`Plan ${activePlan.planNumber} scheduled for ${scheduleForm.productionDate} on ${scheduleForm.lineId}.`);
      setIsScheduleModalOpen(false);
      setActivePlan(null);
      fetchData();
    } catch (err) {
      showError(err.response?.data?.error || 'Scheduling failed');
    } finally {
      setSubmittingSchedule(false);
    }
  };

  const handleReschedulePlan = async (e) => {
    e.preventDefault();
    if (!activePlan) return;
    if (!rescheduleForm.reason.trim()) return showError('Please provide a reason for rescheduling.');
    setSubmittingReschedule(true);
    try {
      await api.put(`/production-plans/${activePlan._id}/reschedule`, rescheduleForm);
      showSuccess(`Plan ${activePlan.planNumber} rescheduled successfully.`);
      setIsRescheduleModalOpen(false);
      setActivePlan(null);
      fetchData();
    } catch (err) {
      showError(err.response?.data?.error || 'Rescheduling failed');
    } finally {
      setSubmittingReschedule(false);
    }
  };

  const handleSplitPlan = async (e) => {
    e.preventDefault();
    if (!activePlan) return;
    const totalOriginal = activePlan.totalPlans || activePlan.quantity;
    const sumSplit = splitForm.splits.reduce((acc, s) => acc + Number(s.quantity || 0), 0);
    if (sumSplit !== totalOriginal) {
      return showError(`Total split sum (${sumSplit}) must match original quantity (${totalOriginal}).`);
    }

    setSubmittingSplit(true);
    try {
      const res = await api.post(`/production-plans/${activePlan._id}/split`, splitForm);
      showSuccess(res.data.message || `Plan ${activePlan.planNumber} split successfully.`);
      setIsSplitModalOpen(false);
      setActivePlan(null);
      fetchData();
    } catch (err) {
      showError(err.response?.data?.error || 'Plan splitting failed');
    } finally {
      setSubmittingSplit(false);
    }
  };

  const handleDirectRelease = async (plan) => {
    try {
      const qty = plan.availablePlans !== undefined ? plan.availablePlans : (plan.quantity || 1);
      const res = await api.post(`/production-plans/${plan._id}/release`, { quantity: qty });
      showSuccess(res.data.message || `Plan ${plan.planNumber} released directly into Production Order.`);
      fetchData();
    } catch (err) {
      showError(err.response?.data?.error || 'Plan release failed');
    }
  };

  const handlePlanStatusChange = async (planId, action) => {
    try {
      await api.post(`/production-plans/${planId}/${action}`);
      showSuccess(`Plan ${action} action executed successfully.`);
      fetchData();
    } catch (err) {
      showError(err.response?.data?.error || `Action ${action} failed`);
    }
  };

  // Open Calculation Breakdown Modal (Section 4 & 5)
  const handleOpenCalculation = (item) => {
    setSelectedCalcItem(item);
    setIsCalcModalOpen(true);
  };

  // Run Deterministic Plan Matching (Section 7)
  const handleRunMatching = async (productId, requestedQty = 50, warehouseId = '') => {
    if (!productId) {
      showError('Please select a product to find matching plans.');
      return;
    }
    setMatchingLoading(true);
    setMatchedPlans([]);
    setIsMatchDrawerOpen(true);
    try {
      const res = await api.post('/production-plans/match', {
        productId,
        requestedQty: Number(requestedQty) || 50,
        warehouseId: warehouseId || activeWarehouseId,
        siteId: activeSiteId,
      });
      if (res.data?.success) {
        setMatchedPlans(res.data.matches || []);
      }
    } catch (err) {
      showError(err.response?.data?.error || err.message || 'Failed to match existing plans');
    } finally {
      setMatchingLoading(false);
    }
  };

  // Allocate from matched plan with Idempotency Key (Section 11)
  const handleUseMatchedPlan = async (planId, qty) => {
    if (!qty || qty <= 0) return showError('Enter a valid quantity to allocate.');
    setAllocatingPlanId(planId);
    try {
      const idempotencyKey = `use-plan-${planId}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      const res = await api.post(`/production-plans/${planId}/use`, {
        quantityToUse: Number(qty),
        purpose: 'Allocated via MRP Existing Plan Matcher',
      }, {
        headers: { 'Idempotency-Key': idempotencyKey }
      });
      showSuccess(res.data?.message || `Allocated ${qty} units from plan.`);
      setIsMatchDrawerOpen(false);
      await fetchData();
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message || 'Failed to allocate from plan';
      showError(errMsg);
    } finally {
      setAllocatingPlanId(null);
    }
  };


  const togglePlanInstances = async (planId) => {

    if (expandedPlanId === planId) {
      setExpandedPlanId(null);
      return;
    }
    setExpandedPlanId(planId);
    if (!planInstancesMap[planId]) {
      setLoadingInstances(true);
      try {
        const res = await api.get(`/production-plans/${planId}/instances`);
        setPlanInstancesMap(prev => ({ ...prev, [planId]: res.data.data || [] }));
      } catch (err) {
        console.error('Failed to load plan instances:', err);
      } finally {
        setLoadingInstances(false);
      }
    }
  };

  // Filtered Plans Matrix
  const filteredPlans = useMemo(() => {
    let list = plans;
    if (viewTab === 'unscheduled') {
      list = list.filter(p => {
        const s = (p.status || '').toUpperCase();
        return s === 'UNSCHEDULED' || s === 'DRAFT' || s === 'PENDING';
      });
    } else if (viewTab === 'scheduled') {
      list = list.filter(p => {
        const s = (p.status || '').toUpperCase();
        return s === 'SCHEDULED' || s === 'PARTIALLY SCHEDULED';
      });
    } else if (viewTab === 'on_hold') {
      list = list.filter(p => {
        const s = (p.status || '').toUpperCase();
        return s === 'ON_HOLD' || s === 'ON HOLD';
      });
    } else if (viewTab === 'templates') {
      list = list.filter(p => p.isTemplate || p.isReusable);
    } else if (planFilter !== 'ALL') {
      list = list.filter(p => {
        const s = (p.status || '').toUpperCase();
        if (planFilter === 'UNSCHEDULED') return s === 'UNSCHEDULED' || s === 'DRAFT';
        if (planFilter === 'SCHEDULED') return s === 'SCHEDULED';
        if (planFilter === 'RELEASED') return s === 'RELEASED';
        if (planFilter === 'IN_PROGRESS') return s === 'IN_PROGRESS' || s === 'IN PRODUCTION';
        if (planFilter === 'ON_HOLD') return s === 'ON_HOLD' || s === 'ON HOLD';
        if (planFilter === 'COMPLETED') return s === 'COMPLETED';
        if (planFilter === 'SHORTAGES') return (p.materialStatus?.status || '').toUpperCase() === 'SHORTAGE';
        return true;
      });
    }

    if (priorityFilter !== 'ALL') {
      list = list.filter(p => (p.priority || 'MEDIUM').toUpperCase() === priorityFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p =>
        (p.planNumber && p.planNumber.toLowerCase().includes(q)) ||
        (p.productName && p.productName.toLowerCase().includes(q)) ||
        (p.productCode && p.productCode.toLowerCase().includes(q)) ||
        (p.planName && p.planName.toLowerCase().includes(q))
      );
    }
    return list;
  }, [plans, viewTab, planFilter, priorityFilter, searchQuery]);

  const targetPlanQty = activePlan?.totalPlans || activePlan?.quantity || 0;
  const totalSplitSum = useMemo(() => {
    return splitForm.splits.reduce((acc, s) => acc + (Number(s.quantity) || 0), 0);
  }, [splitForm.splits]);
  const isSplitSumValid = totalSplitSum === targetPlanQty && targetPlanQty > 0;

  return (
    <div className="space-y-5 font-sans text-slate-900 bg-slate-50/60 min-h-screen p-3 md:p-6 max-w-full overflow-x-hidden">
      {/* 1. HERO TOP BAR */}
      <section className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200/90 shadow-sm space-y-3 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-slate-900 text-white rounded-md flex items-center gap-1">
                <Cpu className="h-3 w-3" /> MRP &amp; Production Engine
              </span>
              <span className="text-xs text-slate-500 font-semibold flex items-center gap-1">
                ● {activeSite?.name || 'All Sites'} {activeWarehouse?.name ? `(${activeWarehouse.name})` : ''}
              </span>
            </div>
            <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">
              Material Requirements &amp; Planning
            </h1>
            <p className="text-xs text-slate-500 max-w-2xl">
              Closed-loop MRP calculation, deterministic BOM explosion, and shop-floor production order release.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setIsRunModalOpen(true)}
              className="px-3.5 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5 active:scale-95"
            >
              <Play className="h-3.5 w-3.5" />
              <span>Run MRP</span>
            </button>

            <button
              onClick={() => {
                const defaultProd = materials.find(m => m.type === 'Finished' || m.makeOrBuy === 'MAKE')?._id || (materials[0]?._id || '');
                handleRunMatching(defaultProd, 50);
              }}
              className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5 active:scale-95"
              title="Deterministic Existing Plan Matcher"
            >
              <Sliders className="h-3.5 w-3.5" />
              <span>Match Plans</span>
            </button>

            <button
              onClick={() => {
                const defaultProd = materials.find(m => m.type === 'Finished' || m.makeOrBuy === 'MAKE')?._id || (materials[0]?._id || '');
                const matchingBom = boms.find(b => (b.productId?._id || b.productId) === defaultProd || (b.product?._id || b.product) === defaultProd);
                setCreatePlanForm(prev => ({
                  ...prev,
                  productId: defaultProd,
                  bomId: matchingBom ? matchingBom._id : '',
                  warehouseId: warehouses[0]?._id || '',
                  planName: '',
                  quantity: 50,
                }));
                setIsCreatePlanModalOpen(true);
              }}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5 active:scale-95"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              <span>Create Plan</span>
            </button>


            <button
              onClick={fetchData}
              className="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl transition-all active:scale-95"
              title="Refresh MRP Workbench"
            >
              <RefreshCw className={`h-4 w-4 ${loadingPlans ? 'animate-spin text-blue-600' : ''}`} />
            </button>
          </div>
        </div>

      </section>


      {/* 2. INTERACTIVE KPI CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        {[
          {
            id: 'all_plans',
            title: 'Total Plans',
            count: summaryData?.totalPlans ?? plans.length,
            desc: 'System requirements',
            color: 'text-slate-900',
            bg: 'bg-white hover:border-slate-400',
            accent: 'border-slate-200',
            icon: BarChart3,
            iconColor: 'text-slate-600 bg-slate-100'
          },
          {
            id: 'unscheduled',
            title: 'Unscheduled',
            count: summaryData?.unscheduled ?? plans.filter(p => (p.status || '').toUpperCase() === 'UNSCHEDULED').length,
            desc: 'Awaiting schedule',
            color: 'text-amber-800',
            bg: 'bg-amber-50/40 hover:bg-amber-50/70',
            accent: 'border-amber-200',
            icon: Clock,
            iconColor: 'text-amber-700 bg-amber-100'
          },
          {
            id: 'scheduled',
            title: 'Scheduled',
            count: summaryData?.scheduled ?? plans.filter(p => (p.status || '').toUpperCase() === 'SCHEDULED').length,
            desc: 'Ready for release',
            color: 'text-blue-800',
            bg: 'bg-blue-50/40 hover:bg-blue-50/70',
            accent: 'border-blue-200',
            icon: CalendarClock,
            iconColor: 'text-blue-700 bg-blue-100'
          },
          {
            id: 'all_plans_released',
            title: 'Released / Prod',
            count: (summaryData?.released || 0) + (summaryData?.inProgress || 0),
            desc: 'On shop floor',
            color: 'text-emerald-800',
            bg: 'bg-emerald-50/40 hover:bg-emerald-50/70',
            accent: 'border-emerald-200',
            icon: Play,
            iconColor: 'text-emerald-700 bg-emerald-100'
          },
          {
            id: 'exceptions',
            title: 'Exceptions',
            count: summaryData?.materialShortages ?? exceptions.length,
            desc: 'Action required',
            color: 'text-rose-800',
            bg: 'bg-rose-50/40 hover:bg-rose-50/70',
            accent: 'border-rose-200',
            icon: AlertTriangle,
            iconColor: 'text-rose-700 bg-rose-100'
          },
          {
            id: 'netting',
            title: 'Purchase Reqs',
            count: summaryData?.purchaseRequirements ?? 0,
            desc: 'Procurement needs',
            color: 'text-purple-800',
            bg: 'bg-purple-50/40 hover:bg-purple-50/70',
            accent: 'border-purple-200',
            icon: ShoppingCart,
            iconColor: 'text-purple-700 bg-purple-100'
          },
        ].map(kpi => (
          <div
            key={kpi.title}
            onClick={() => {
              if (kpi.id === 'all_plans_released') {
                setViewTab('all_plans');
                setPlanFilter('RELEASED');
              } else {
                setViewTab(kpi.id);
              }
            }}
            className={`p-3.5 rounded-2xl border ${kpi.accent} ${kpi.bg} shadow-sm cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 flex flex-col justify-between min-w-0`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate">{kpi.title}</span>
              <div className={`p-1.5 rounded-lg ${kpi.iconColor} shrink-0`}>
                <kpi.icon className="w-3 h-3" />
              </div>
            </div>
            <p className={`text-xl md:text-2xl font-black ${kpi.color} my-1 truncate`}>{kpi.count}</p>
            <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium">
              <span className="truncate">{kpi.desc}</span>
              <ArrowUpRight className="w-3 h-3 opacity-60 shrink-0" />
            </div>
          </div>
        ))}
      </div>

      {/* 3. NAVIGATION TABS BAR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-2.5 rounded-2xl border border-slate-200/90 shadow-sm">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-thin">
          {[
            ['dashboard', 'Dashboard', BarChart3],
            ['unscheduled', 'Unscheduled', Clock, summaryData?.unscheduled || plans.filter(p => (p.status || '').toUpperCase() === 'UNSCHEDULED').length],
            ['scheduled', 'Scheduled', CalendarClock, summaryData?.scheduled || plans.filter(p => (p.status || '').toUpperCase() === 'SCHEDULED').length],
            ['on_hold', 'On Hold', PauseCircle, summaryData?.onHold || plans.filter(p => (p.status || '').toUpperCase() === 'ON_HOLD' || (p.status || '').toUpperCase() === 'ON HOLD').length],
            ['templates', 'Reusable Templates', Copy, plans.filter(p => p.isTemplate || p.isReusable).length],
            ['all_plans', 'All Plans', FileText, plans.length],
            ['netting', 'Netting Matrix', Cpu, requirements.length],
            ['exceptions', 'Exceptions', AlertTriangle, exceptions.length],
            ['runs', 'History', History, runs.length],
          ].map(([id, label, Icon, badgeCount]) => (
            <button
              key={id}
              onClick={() => setViewTab(id)}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap ${viewTab === id
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{label}</span>
              {badgeCount !== undefined && badgeCount > 0 && (
                <span className={`px-1.5 py-0.2 text-[10px] rounded-full font-black ${viewTab === id ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-700'
                  }`}>
                  {badgeCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Filter & Search */}
        <div className="flex items-center gap-2 shrink-0">
          {viewTab !== 'dashboard' && viewTab !== 'runs' && (
            <select
              value={priorityFilter}
              onChange={e => setPriorityFilter(e.target.value)}
              className="text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 focus:outline-none"
            >
              <option value="ALL">All Priorities</option>
              <option value="CRITICAL">Critical Priority</option>
              <option value="HIGH">High Priority</option>
              <option value="MEDIUM">Medium Priority</option>
              <option value="LOW">Low Priority</option>
            </select>
          )}

          <div className="relative min-w-[180px]">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search plans..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
            />
          </div>
        </div>
      </div>

      {/* 4. PRODUCTION PLANS MATRIX TABLE */}
      {['dashboard', 'unscheduled', 'scheduled', 'on_hold', 'templates', 'all_plans'].includes(viewTab) && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-600 font-extrabold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-3.5">Plan Reference</th>
                  <th className="py-3 px-3.5">Manufactured Product</th>
                  <th className="py-3 px-3.5 text-right">Planned Qty</th>
                  <th className="py-3 px-3.5">Warehouse Location</th>
                  <th className="py-3 px-3.5">Status</th>
                  <th className="py-3 px-3.5">Priority</th>
                  <th className="py-3 px-3.5">Target Date</th>
                  <th className="py-3 px-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPlans.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400 italic">
                      No production plans match the active view criteria.
                    </td>
                  </tr>
                ) : (
                  filteredPlans.map(plan => {
                    const statusKey = plan.status || 'UNSCHEDULED';
                    const isUnscheduled = statusKey === 'UNSCHEDULED' || statusKey === 'DRAFT';
                    const isScheduled = statusKey === 'SCHEDULED';
                    const isOnHold = statusKey === 'ON_HOLD' || statusKey === 'ON HOLD';

                    return (
                      <React.Fragment key={plan._id}>
                        <tr className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-3.5">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-black text-slate-900">{plan.planNumber}</span>
                              {plan.isSeries && (
                                <button
                                  onClick={() => togglePlanInstances(plan._id)}
                                  className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded text-[9px] font-bold border border-indigo-200 hover:bg-indigo-100"
                                >
                                  Series #{plan.seriesIndex || 1}/{plan.seriesTotal || 1}
                                </button>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 font-medium truncate max-w-xs">{plan.planName || '-'}</div>
                          </td>

                          <td className="py-3 px-3.5">
                            <div className="font-bold text-slate-900">{plan.productName || plan.productId?.name || plan.product?.name || 'Product'}</div>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                              <span>BOM: v{plan.bomVersion || 1}</span>
                              {plan.workCenter && <span>● {plan.workCenter}</span>}
                            </div>
                            {/* Contextual Root Cause Diagnostics */}
                            {isOnHold && (
                              <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                <PauseCircle className="w-3 h-3 text-amber-600 shrink-0" />
                                <span>Hold Reason: {plan.holdReason || plan.notes || 'Awaiting Authorization'}</span>
                              </div>
                            )}
                            {plan.materialStatus?.status === 'SHORTAGE' && (
                              <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
                                <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" />
                                <span>Root Cause: Material Shortage ({plan.materialStatus?.shortageCount || 'Items'} deficient)</span>
                              </div>
                            )}
                            {(plan.exceptionReason || plan.rootCause) && (
                              <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
                                <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />
                                <span>Root Cause: {plan.exceptionReason || plan.rootCause}</span>
                              </div>
                            )}
                          </td>

                          <td className="py-3 px-3.5 text-right">
                            <span className="font-black text-slate-900 text-sm">{plan.totalPlans || plan.quantity}</span>
                            <span className="text-[10px] text-slate-400 ml-1">units</span>
                          </td>

                          <td className="py-3 px-3.5 font-medium text-slate-700">
                            {plan.warehouseId?.name || plan.warehouse?.name || 'Main Warehouse'}
                          </td>

                          <td className="py-3 px-3.5">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${statusBadgeStyles[statusKey] || 'bg-slate-100 text-slate-600'}`}>
                              {statusKey}
                            </span>
                          </td>

                          <td className="py-3 px-3.5">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${priorityStyles[plan.priority] || priorityStyles.MEDIUM}`}>
                              {plan.priority || 'MEDIUM'}
                            </span>
                          </td>

                          <td className="py-3 px-3.5 font-medium text-slate-600">
                            {plan.requiredDate ? new Date(plan.requiredDate).toLocaleDateString() : '-'}
                          </td>

                          <td className="py-3 px-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Schedule Action */}
                              {isUnscheduled && (
                                <button
                                  onClick={() => { setActivePlan(plan); setIsScheduleModalOpen(true); }}
                                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all flex items-center gap-1 active:scale-95"
                                  title="Schedule Plan"
                                >
                                  <Calendar className="w-3 h-3" /> Schedule
                                </button>
                              )}

                              {/* Scheduled Actions */}
                              {isScheduled && (
                                <>
                                  <button
                                    onClick={() => { setActivePlan(plan); setIsRescheduleModalOpen(true); }}
                                    className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold transition-all flex items-center gap-1"
                                    title="Reschedule Plan"
                                  >
                                    <CalendarClock className="w-3 h-3" /> Reschedule
                                  </button>
                                  <button
                                    onClick={() => handleDirectRelease(plan)}
                                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all flex items-center gap-1 active:scale-95"
                                    title="Release directly to Production Order"
                                  >
                                    <Play className="w-3 h-3" /> Release
                                  </button>
                                </>
                              )}

                              {/* On Hold Actions */}
                              {isOnHold && (
                                <>
                                  <button
                                    onClick={() => { setActivePlan(plan); setIsScheduleModalOpen(true); }}
                                    className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all flex items-center gap-1"
                                    title="Schedule Plan"
                                  >
                                    <Calendar className="w-3 h-3" /> Schedule
                                  </button>
                                  <button
                                    onClick={() => handlePlanStatusChange(plan._id, 'unschedule')}
                                    className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold transition-all flex items-center gap-1"
                                    title="Resume Plan"
                                  >
                                    <Play className="w-3 h-3" /> Resume
                                  </button>
                                </>
                              )}

                              {/* Edit Plan */}
                              {!['COMPLETED', 'CANCELLED'].includes((statusKey || '').toUpperCase()) && (
                                <button
                                  onClick={() => handleOpenEditPlan(plan)}
                                  className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition-all flex items-center gap-1 shadow-sm"
                                  title="Edit Plan, Shift, BOM, Warehouse, or Series Scope"
                                >
                                  <Edit3 className="w-3 h-3" /> Edit
                                </button>
                              )}

                              {/* Batch Copy & Reuse (Unified) */}
                              <button
                                onClick={() => handleOpenCopy(plan)}
                                className="px-2 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-lg text-xs font-bold transition-all flex items-center gap-1 shadow-sm"
                                title="Batch copy plan into grouped series or reuse template"
                              >
                                <Copy className="w-3 h-3" /> Copy &amp; Reuse
                              </button>

                              {/* Live Material Check */}
                              <button
                                onClick={() => handleCheckMaterials(plan)}
                                className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold transition-all"
                                title="Check Material Availability & Shortage Details"
                              >
                                <Eye className="w-3 h-3" />
                              </button>

                              {/* Hold Action */}
                              {['UNSCHEDULED', 'SCHEDULED', 'DRAFT', 'VALIDATED', 'APPROVED'].includes((statusKey || '').toUpperCase()) && (
                                <button
                                  onClick={() => handlePlanStatusChange(plan._id, 'hold')}
                                  className="p-1.5 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                                  title="Place Plan On Hold"
                                >
                                  <PauseCircle className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>

                        </tr>

                        {/* Series Expansion Row */}
                        {expandedPlanId === plan._id && (
                          <tr className="bg-indigo-50/40">
                            <td colSpan={8} className="p-3.5">
                              <div className="bg-white rounded-xl border border-indigo-100 p-3 space-y-2 shadow-inner">
                                <div className="flex items-center justify-between text-xs font-bold text-indigo-900">
                                  <span>Execution Series Instances ({planInstancesMap[plan._id]?.length || 0} batches)</span>
                                  <span className="text-[10px] text-slate-500 font-normal">Deterministic Series Engine</span>
                                </div>
                                {loadingInstances && !planInstancesMap[plan._id] ? (
                                  <div className="py-3 text-center text-xs text-slate-400 font-medium">Loading batch instances...</div>
                                ) : (planInstancesMap[plan._id] || []).length === 0 ? (
                                  <div className="py-2 text-center text-xs text-slate-400">No separate batch instances generated yet for this plan.</div>
                                ) : (
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-left text-[11px] whitespace-nowrap">
                                      <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
                                        <tr>
                                          <th className="py-1.5 px-2">Batch #</th>
                                          <th className="py-1.5 px-2">Quantity</th>
                                          <th className="py-1.5 px-2">Start Date</th>
                                          <th className="py-1.5 px-2">Work Center</th>
                                          <th className="py-1.5 px-2">Status</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {planInstancesMap[plan._id].map(inst => (
                                          <tr key={inst._id} className="hover:bg-slate-50/60">
                                            <td className="py-1.5 px-2 font-mono font-bold text-slate-800">{inst.instanceNumber || inst.planNumber}</td>
                                            <td className="py-1.5 px-2 font-semibold text-slate-900">{inst.quantity || inst.totalPlans} units</td>
                                            <td className="py-1.5 px-2 text-slate-500">{inst.requiredDate ? new Date(inst.requiredDate).toLocaleDateString() : '-'}</td>
                                            <td className="py-1.5 px-2 text-slate-600">{inst.workCenter || '-'}</td>
                                            <td className="py-1.5 px-2">
                                              <span className={`px-2 py-0.2 rounded-full text-[9px] font-bold border ${statusBadgeStyles[inst.status] || 'bg-slate-100 text-slate-600'}`}>
                                                {inst.status}
                                              </span>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. MATERIAL NETTING MATRIX */}
      {viewTab === 'netting' && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm space-y-4 p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-black text-slate-900">
                {selectedRun ? `Material Netting Matrix — Run ${selectedRun.runNumber}` : 'Material Requirements & Netting Matrix'}
              </h2>
              <p className="text-xs text-slate-500">
                Gross Demand $\rightarrow$ Available Stock $\rightarrow$ Open Orders $\rightarrow$ Net Shortage Breakdown
              </p>
            </div>
            {selectedRun && (
              <button
                onClick={() => setSelectedRun(null)}
                className="text-xs font-bold text-blue-600 hover:underline"
              >
                Clear Run Filter
              </button>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-600 font-extrabold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-3.5">Component / Material</th>
                  <th className="py-3 px-3.5 text-right">Gross Required</th>
                  <th className="py-3 px-3.5 text-right">On Hand Stock</th>
                  <th className="py-3 px-3.5 text-right">Reserved Stock</th>
                  <th className="py-3 px-3.5 text-right">Open Supply (PO/MO)</th>
                  <th className="py-3 px-3.5 text-right text-purple-700">Net Required</th>
                  <th className="py-3 px-3.5 text-right text-rose-700">Shortage Qty</th>
                  <th className="py-3 px-3.5">Recommended Action</th>
                  <th className="py-3 px-3.5 text-right">Calculation Trace</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requirements.map((req, i) => (
                  <tr key={i} className="hover:bg-slate-50/80">
                    <td className="py-3 px-3.5">
                      <div className="font-bold text-slate-900">{req.materialName}</div>
                      <div className="text-[10px] text-slate-400">{req.materialCode} ({req.unit})</div>
                    </td>
                    <td className="py-3 px-3.5 text-right font-black text-slate-800">{req.requiredQty}</td>
                    <td className="py-3 px-3.5 text-right font-medium text-slate-600">{req.availableQty || 0}</td>
                    <td className="py-3 px-3.5 text-right font-medium text-slate-400">{req.reservedQty || 0}</td>
                    <td className="py-3 px-3.5 text-right text-blue-600 font-bold">{req.onOrderQty || 0}</td>
                    <td className="py-3 px-3.5 text-right font-black text-purple-700">{req.netQty || 0}</td>
                    <td className="py-3 px-3.5 text-right font-black text-rose-600">{req.shortageQty || 0}</td>
                    <td className="py-3 px-3.5">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${req.action === 'Procure' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                        req.action === 'Produce' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                        {req.action}
                      </span>
                    </td>
                    <td className="py-3 px-3.5 text-right">
                      <button
                        onClick={() => handleOpenCalculation(req)}
                        className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1 shadow-sm"
                        title="View Full Transparent 16-Step Calculation Chain"
                      >
                        <Calculator className="w-3 h-3" /> View Calc
                      </button>
                    </td>
                  </tr>
                ))}
                {requirements.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400 italic">
                      Select an MRP Run from History or execute a new MRP calculation to view live netting.
                    </td>
                  </tr>
                )}

              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. EXCEPTIONS & ROOT CAUSE HUB */}
      {viewTab === 'exceptions' && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm space-y-4 p-5">
          <div className="pb-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                Planning Exceptions &amp; Root Cause Diagnostics
              </h2>
              <p className="text-xs text-slate-500">Itemized root cause breakdown, material shortages, and resolution paths</p>
            </div>
            <button
              onClick={fetchExceptions}
              className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all self-start sm:self-auto flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingExceptions ? 'animate-spin text-rose-600' : ''}`} />
              <span>Refresh Exceptions</span>
            </button>
          </div>

          <div className="space-y-3">
            {exceptions.map((ex, i) => (
              <div key={i} className="p-4 rounded-2xl border border-rose-200 bg-white shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="space-y-2.5 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 bg-rose-100 text-rose-800 border border-rose-300 rounded-md text-[10px] font-black uppercase tracking-wider">
                      {ex.code || 'CRITICAL_SHORTAGE'}
                    </span>
                    <span className="text-xs font-bold text-slate-900">{ex.productName || ex.productCode || 'Component Material'}</span>
                    <span className="text-xs text-slate-400">● {ex.warehouseName || 'Main Warehouse'}</span>
                  </div>

                  {/* Professional Root Cause Diagnostic Callout */}
                  <div className="p-3 bg-rose-50/70 border border-rose-200 rounded-xl space-y-1">
                    <div className="text-xs font-bold text-rose-900 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                      <span>Root Cause:</span>
                    </div>
                    <p className="text-xs text-rose-800 font-medium pl-5 leading-relaxed">
                      {ex.message || ex.rootCause || 'Warehouse available inventory is depleted below required production threshold with zero inbound purchase orders.'}
                    </p>
                  </div>

                  {ex.actionRequired && (
                    <div className="text-[11px] text-slate-600 font-medium flex items-center gap-1.5">
                      <span className="font-bold text-slate-800">Resolution:</span>
                      <span>{ex.actionRequired}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                  <button
                    onClick={() => setViewTab('all_plans')}
                    className="px-3.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-bold rounded-xl shadow-sm transition-all"
                  >
                    View Plan
                  </button>
                  <button
                    onClick={() => setIsRunModalOpen(true)}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all"
                  >
                    Re-run MRP
                  </button>
                </div>
              </div>
            ))}

            {exceptions.length === 0 && (
              <div className="p-12 text-center text-slate-400 italic bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                ✓ No active planning exceptions or material bottlenecks detected.
              </div>
            )}
          </div>
        </div>
      )}


      {/* 7. RUN HISTORY */}
      {viewTab === 'runs' && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm space-y-4 p-5">
          <div className="pb-3 border-b border-slate-100">
            <h2 className="text-base font-black text-slate-900">MRP Run Execution History</h2>
            <p className="text-xs text-slate-500">Traceability log for calculation cycles and multi-level BOM explosion</p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-600 font-extrabold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-3.5">Run Reference</th>
                  <th className="py-3 px-3.5">Product</th>
                  <th className="py-3 px-3.5 text-right">Target Quantity</th>
                  <th className="py-3 px-3.5">Execution Timestamp</th>
                  <th className="py-3 px-3.5">Material Shortages</th>
                  <th className="py-3 px-3.5">Status</th>
                  <th className="py-3 px-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {runs.map(r => (
                  <tr key={r._id} className="hover:bg-slate-50">
                    <td className="py-3 px-3.5 font-black text-slate-900">{r.runNumber}</td>
                    <td className="py-3 px-3.5 font-bold text-slate-800">{r.productId?.name || 'Finished Product'}</td>
                    <td className="py-3 px-3.5 text-right font-black">{r.targetQty}</td>
                    <td className="py-3 px-3.5 text-slate-500 font-medium">{new Date(r.createdAt).toLocaleString()}</td>
                    <td className="py-3 px-3.5">
                      {r.summary?.totalShortages > 0 ? (
                        <span className="text-rose-600 font-bold">{r.summary.totalShortages} shortages</span>
                      ) : (
                        <span className="text-emerald-600 font-bold">100% In Stock</span>
                      )}
                    </td>
                    <td className="py-3 px-3.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {r.status}
                      </span>
                    </td>
                    <td className="py-3 px-3.5 text-right">
                      <button
                        onClick={() => inspectRun(r._id)}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg text-xs transition-colors"
                      >
                        Inspect Matrix
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: UNIFIED CREATE PRODUCTION PLAN */}
      {/* ========================================================================= */}
      {isCreatePlanModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl border border-slate-100 animate-scaleIn max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl"><PlusCircle className="w-5 h-5" /></div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Create Production Plan</h3>
                  <p className="text-xs text-slate-500">Initialize manufacturing order with BOM recipe explosion</p>
                </div>
              </div>
              <button onClick={() => setIsCreatePlanModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleCreatePlanSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Target Product *</label>
                  <select
                    value={createPlanForm.productId}
                    onChange={e => {
                      const pid = e.target.value;
                      const prodMat = materials.find(m => m._id === pid);
                      const matchingBom = boms.find(b => (b.productId?._id || b.productId) === pid || (b.product?._id || b.product) === pid);
                      setCreatePlanForm(prev => ({
                        ...prev,
                        productId: pid,
                        planName: prodMat ? `${prodMat.name} Production` : prev.planName,
                        bomId: matchingBom ? matchingBom._id : ''
                      }));
                    }}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                    required
                  >
                    <option value="">-- Select Manufactured Product --</option>
                    {materials.filter(m => m.type === 'Finished' || m.type === 'Semi-Finished' || m.makeOrBuy === 'MAKE').map(m => (
                      <option key={m._id} value={m._id}>{m.name} ({m.code})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Plan Title / Reference</label>
                  <input
                    type="text"
                    value={createPlanForm.planName}
                    onChange={e => setCreatePlanForm(prev => ({ ...prev, planName: e.target.value }))}
                    placeholder="e.g. Daily Assembly Run"
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                  />
                </div>
              </div>

              {/* BOM Recipe & Ingredients Preview */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">BOM Recipe</label>
                <select
                  value={createPlanForm.bomId}
                  onChange={e => setCreatePlanForm(prev => ({ ...prev, bomId: e.target.value }))}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800"
                >
                  <option value="">-- Standard Active Recipe --</option>
                  {boms.filter(b => !createPlanForm.productId || (b.productId?._id || b.productId) === createPlanForm.productId || (b.product?._id || b.product) === createPlanForm.productId).map(b => (
                    <option key={b._id} value={b._id}>{b.bomNumber} (v{b.version || 1}) - {b.components?.length || 0} components</option>
                  ))}
                </select>

                {/* Recipe Components Quick Drawer */}
                {createPlanForm.bomId && (
                  <div className="mt-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                    <span className="font-bold text-slate-700 block mb-1.5">BOM Recipe Ingredients:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {(boms.find(b => b._id === createPlanForm.bomId)?.components || []).map((c, i) => (
                        <span key={i} className="px-2 py-0.5 bg-white border border-slate-200 rounded text-[11px] font-medium text-slate-700">
                          {c.materialId?.name || c.materialName || c.mpnName || 'Component'} ({c.quantity || c.qty || 1} {c.unit || 'pcs'})
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Planned Quantity *</label>
                  <input
                    type="number"
                    min="1"
                    value={createPlanForm.quantity}
                    onChange={e => setCreatePlanForm(prev => ({ ...prev, quantity: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black text-slate-900"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Target Warehouse *</label>
                  <select
                    value={createPlanForm.warehouseId}
                    onChange={e => setCreatePlanForm(prev => ({ ...prev, warehouseId: e.target.value }))}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                    required
                  >
                    <option value="">Select Warehouse</option>
                    {warehouses.map(w => (
                      <option key={w._id} value={w._id}>{w.name} ({w.code})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Priority</label>
                  <select
                    value={createPlanForm.priority}
                    onChange={e => setCreatePlanForm(prev => ({ ...prev, priority: e.target.value }))}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Required Completion Date *</label>
                  <input
                    type="date"
                    value={createPlanForm.requiredDate}
                    onChange={e => setCreatePlanForm(prev => ({ ...prev, requiredDate: e.target.value }))}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Production Shift</label>
                  <select
                    value={createPlanForm.shiftId}
                    onChange={e => setCreatePlanForm(prev => ({ ...prev, shiftId: e.target.value }))}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                  >
                    <option value="Morning Shift">Morning Shift</option>
                    <option value="Evening Shift">Evening Shift</option>
                    <option value="Night Shift">Night Shift</option>
                  </select>
                </div>
              </div>

              {/* 6 STAGES PREVIEW BANNER */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-black text-slate-800 uppercase tracking-wider">
                  <span className="flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-blue-600" />
                    Standard 6 Operational Stages (Forward Routing)
                  </span>
                  <span className="text-blue-600 font-mono text-[10px]">6 Stages Configured</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 text-[10px]">
                  {DEFAULT_OPERATIONAL_STAGES.map((s) => (
                    <div key={s.seq} className="p-2 bg-white rounded-lg border border-slate-200 flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${s.color}`}></span>
                      <span className="font-bold text-slate-700 truncate">{s.seq}. {s.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Reason / Customer Reference</label>
                <input
                  type="text"
                  value={createPlanForm.notes}
                  onChange={e => setCreatePlanForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="e.g. Urgent customer order / Stock replenishment"
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreatePlanModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingCreatePlan}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                >
                  {submittingCreatePlan ? <RefreshCw className="w-4 h-4 animate-spin" /> : <PlusCircle className="w-4 h-4" />}
                  <span>{submittingCreatePlan ? 'Creating Plan...' : 'Create Production Plan'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: UNIFIED BATCH COPY & REUSE PLANS */}
      {/* ========================================================================= */}
      {isCopyModalOpen && copySourcePlan && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-100 animate-scaleIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-sky-50 text-sky-600 rounded-xl"><Copy className="w-5 h-5" /></div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Batch Copy &amp; Reuse Plan {copySourcePlan.planNumber}</h3>
                  <p className="text-xs text-slate-500">Duplicate plan into grouped execution series</p>
                </div>
              </div>
              <button onClick={() => setIsCopyModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleCopySubmit} className="space-y-3.5">
              {/* Product summary banner */}
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs flex items-center justify-between">
                <span className="font-bold text-slate-800">{copySourcePlan.productName || copySourcePlan.product?.name || 'Product'}</span>
                <span className="text-slate-500 font-mono text-[11px]">BOM: v{copySourcePlan.bomVersion || 1}</span>
              </div>

              {/* Staleness check indicator */}
              {checkingStaleness ? (
                <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                  <RefreshCw className="w-3 h-3 animate-spin" /> Checking recipe compatibility...
                </div>
              ) : copyStaleness?.isStale ? (
                <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs flex items-center gap-2">
                  <Info className="w-4 h-4 shrink-0 text-amber-600" />
                  <span>Recipe updated: Source is v{copyStaleness.planBomVersion}, active recipe is v{copyStaleness.currentBomVersion}.</span>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Number of Copy Plans *</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={copyForm.copyCount}
                    onChange={e => setCopyForm(prev => ({ ...prev, copyCount: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                    className="w-full text-xs p-2.5 bg-blue-50/50 border border-blue-200 rounded-xl font-black text-blue-900 focus:bg-white"
                    required
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Generates grouped series with sequential IDs</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Target Quantity per Plan *</label>
                  <input
                    type="number"
                    min="1"
                    value={copyForm.quantity}
                    onChange={e => setCopyForm(prev => ({ ...prev, quantity: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:bg-white"
                    required
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Total: {Number(copyForm.copyCount || 1) * Number(copyForm.quantity || 1)} units</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Start / Required Date *</label>
                  <input
                    type="date"
                    value={copyForm.requiredDate}
                    onChange={e => setCopyForm(prev => ({ ...prev, requiredDate: e.target.value }))}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Target Warehouse *</label>
                  <select
                    value={copyForm.warehouseId}
                    onChange={e => setCopyForm(prev => ({ ...prev, warehouseId: e.target.value }))}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                    required
                  >
                    {warehouses.map(w => (
                      <option key={w._id} value={w._id}>{w.name} ({w.code})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Priority</label>
                  <select
                    value={copyForm.priority}
                    onChange={e => setCopyForm(prev => ({ ...prev, priority: e.target.value }))}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Production Shift</label>
                  <select
                    value={copyForm.shiftId}
                    onChange={e => setCopyForm(prev => ({ ...prev, shiftId: e.target.value }))}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                  >
                    <option value="Morning Shift">Morning Shift</option>
                    <option value="Evening Shift">Evening Shift</option>
                    <option value="Night Shift">Night Shift</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Planner Notes</label>
                <input
                  type="text"
                  value={copyForm.notes}
                  onChange={e => setCopyForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="e.g. Batch series duplicate"
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCopyModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingCopy}
                  className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                >
                  {submittingCopy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                  <span>{submittingCopy ? 'Generating Plans...' : `Generate ${copyForm.copyCount || 1} Copy Plans`}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: DIRECT PLAN EDIT & SERIES SCOPE */}
      {/* ========================================================================= */}
      {isEditPlanModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-100 animate-scaleIn max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl"><Edit3 className="w-5 h-5" /></div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Edit Plan {editPlanForm.planNumber}</h3>
                  <p className="text-xs text-slate-500">Update quantities, dates, shift, and series scope</p>
                </div>
              </div>
              <button onClick={() => setIsEditPlanModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleEditPlanSubmit} className="space-y-3.5">
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs flex items-center justify-between">
                <span className="font-bold text-slate-800">{editPlanForm.productName} ({editPlanForm.productCode})</span>
                {editPlanForm.seriesId && (
                  <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-[10px] font-bold border border-indigo-200">
                    Series #{editPlanForm.seriesIndex} of {editPlanForm.seriesTotal}
                  </span>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Plan Title / Name</label>
                <input
                  type="text"
                  value={editPlanForm.planName}
                  onChange={e => setEditPlanForm(prev => ({ ...prev, planName: e.target.value }))}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Planned Quantity *</label>
                  <input
                    type="number"
                    min="1"
                    value={editPlanForm.quantity}
                    onChange={e => setEditPlanForm(prev => ({ ...prev, quantity: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black text-slate-900"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Required Completion Date *</label>
                  <input
                    type="date"
                    value={editPlanForm.requiredDate}
                    onChange={e => setEditPlanForm(prev => ({ ...prev, requiredDate: e.target.value }))}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Target Warehouse *</label>
                  <select
                    value={editPlanForm.warehouseId}
                    onChange={e => setEditPlanForm(prev => ({ ...prev, warehouseId: e.target.value }))}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                    required
                  >
                    {warehouses.map(w => (
                      <option key={w._id} value={w._id}>{w.name} ({w.code})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Priority</label>
                  <select
                    value={editPlanForm.priority}
                    onChange={e => setEditPlanForm(prev => ({ ...prev, priority: e.target.value }))}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Production Work Center</label>
                  <input
                    type="text"
                    value={editPlanForm.workCenter}
                    onChange={e => setEditPlanForm(prev => ({ ...prev, workCenter: e.target.value }))}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Production Shift</label>
                  <select
                    value={editPlanForm.shiftId}
                    onChange={e => setEditPlanForm(prev => ({ ...prev, shiftId: e.target.value }))}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                  >
                    <option value="Morning Shift">Morning Shift</option>
                    <option value="Evening Shift">Evening Shift</option>
                    <option value="Night Shift">Night Shift</option>
                  </select>
                </div>
              </div>

              {/* Series Edit Scope Option */}
              {editPlanForm.seriesId && (
                <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-200 space-y-2">
                  <label className="block text-xs font-bold text-indigo-900">Apply Scope for Grouped Series:</label>
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                      <input
                        type="radio"
                        name="editScope"
                        value="SINGLE"
                        checked={editPlanForm.editScope === 'SINGLE'}
                        onChange={() => setEditPlanForm(prev => ({ ...prev, editScope: 'SINGLE' }))}
                        className="text-indigo-600"
                      />
                      <span>Only this plan ({editPlanForm.planNumber})</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                      <input
                        type="radio"
                        name="editScope"
                        value="ALL_REMAINING"
                        checked={editPlanForm.editScope === 'ALL_REMAINING'}
                        onChange={() => setEditPlanForm(prev => ({ ...prev, editScope: 'ALL_REMAINING' }))}
                        className="text-indigo-600"
                      />
                      <span>All remaining plans in this series ({editPlanForm.seriesIndex} to {editPlanForm.seriesTotal})</span>
                    </label>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Notes / Remarks</label>
                <textarea
                  rows={2}
                  value={editPlanForm.notes}
                  onChange={e => setEditPlanForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditPlanModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingEditPlan}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
                >
                  {submittingEditPlan ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>{submittingEditPlan ? 'Updating...' : (editPlanForm.editScope === 'ALL_REMAINING' ? 'Save All Remaining Plans' : 'Save Plan Changes')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: RUN MRP NETTING */}
      {/* ========================================================================= */}
      {isRunModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-100 animate-scaleIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-orange-50 text-orange-600 rounded-xl"><Play className="w-5 h-5" /></div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Execute MRP Netting Engine</h3>
                  <p className="text-xs text-slate-500">Multi-level BOM explosion and requirement calculation</p>
                </div>
              </div>
              <button onClick={() => setIsRunModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleExecuteRun} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Target Product *</label>
                <select
                  value={runForm.productId}
                  onChange={e => setRunForm(prev => ({ ...prev, productId: e.target.value }))}
                  className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  required
                >
                  <option value="">-- Select Finished Product --</option>
                  {materials.filter(m => m.type === 'Finished' || m.type === 'Semi-Finished' || m.makeOrBuy === 'MAKE').map(m => (
                    <option key={m._id} value={m._id}>{m.name} ({m.code})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Target Quantity *</label>
                  <input
                    type="number"
                    min="1"
                    value={runForm.targetQty}
                    onChange={e => setRunForm(prev => ({ ...prev, targetQty: e.target.value }))}
                    className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Required Date *</label>
                  <input
                    type="date"
                    value={runForm.requiredDate}
                    onChange={e => setRunForm(prev => ({ ...prev, requiredDate: e.target.value }))}
                    className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                    required
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsRunModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={executingMRP}
                  className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-all active:scale-95 disabled:opacity-50"
                >
                  {executingMRP ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  <span>{executingMRP ? 'Calculating...' : 'Run MRP Netting'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: SCHEDULE PLAN */}
      {/* ========================================================================= */}
      {isScheduleModalOpen && activePlan && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-100 animate-scaleIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl"><Calendar className="w-5 h-5" /></div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Schedule Plan {activePlan.planNumber}</h3>
                  <p className="text-xs text-slate-500">Lock work center line and shift</p>
                </div>
              </div>
              <button onClick={() => setIsScheduleModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleSchedulePlan} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Production Date *</label>
                <input
                  type="date"
                  value={scheduleForm.productionDate}
                  onChange={e => setScheduleForm(prev => ({ ...prev, productionDate: e.target.value }))}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Production Work Center Line</label>
                <select
                  value={scheduleForm.lineId}
                  onChange={e => setScheduleForm(prev => ({ ...prev, lineId: e.target.value }))}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                >
                  <option value="Assembly Line Alpha">Assembly Line Alpha (100 units/day)</option>
                  <option value="Main Production Bay 1">Main Production Bay 1 (150 units/day)</option>
                  <option value="High Speed Packaging Line">High Speed Packaging Line (200 units/day)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsScheduleModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingSchedule}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all"
                >
                  {submittingSchedule ? 'Saving...' : 'Save Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 6: RESCHEDULE PLAN */}
      {/* ========================================================================= */}
      {isRescheduleModalOpen && activePlan && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-100 animate-scaleIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-50 text-amber-600 rounded-xl"><CalendarClock className="w-5 h-5" /></div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Reschedule Plan {activePlan.planNumber}</h3>
                  <p className="text-xs text-slate-500">Record reason in audit trail</p>
                </div>
              </div>
              <button onClick={() => setIsRescheduleModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleReschedulePlan} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">New Production Date *</label>
                <input
                  type="date"
                  value={rescheduleForm.productionDate}
                  onChange={e => setRescheduleForm(prev => ({ ...prev, productionDate: e.target.value }))}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Rescheduling Reason *</label>
                <textarea
                  value={rescheduleForm.reason}
                  onChange={e => setRescheduleForm(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder="e.g. Supplier delivery delay, work center maintenance..."
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl h-24 font-medium"
                  required
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsRescheduleModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReschedule}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all"
                >
                  {submittingReschedule ? 'Saving...' : 'Confirm Reschedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 7: SPLIT PLAN */}
      {/* ========================================================================= */}
      {isSplitModalOpen && activePlan && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-100 animate-scaleIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-purple-50 text-purple-600 rounded-xl"><Scissors className="w-5 h-5" /></div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Split Plan {activePlan.planNumber}</h3>
                  <p className="text-xs text-slate-500">Target Total Quantity: <span className="font-bold text-slate-800">{targetPlanQty} units</span></p>
                </div>
              </div>
              <button onClick={() => setIsSplitModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleSplitPlan} className="space-y-4">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="flex justify-between text-xs font-bold">
                  <span>Total Split Allocated:</span>
                  <span className={isSplitSumValid ? 'text-emerald-700 font-black' : 'text-rose-600 font-black'}>
                    {totalSplitSum} / {targetPlanQty} units ({isSplitSumValid ? '100% Balanced' : 'Unbalanced'})
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-2 transition-all duration-300 ${isSplitSumValid ? 'bg-emerald-500' : 'bg-rose-500'}`}
                    style={{ width: `${Math.min(100, (totalSplitSum / (targetPlanQty || 1)) * 100)}%` }}
                  />
                </div>
              </div>

              <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                {splitForm.splits.map((s, i) => (
                  <div key={i} className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-2.5">
                    <span className="text-xs font-bold text-slate-700 w-16">Batch {String.fromCharCode(65 + i)}</span>
                    <input
                      type="number"
                      min="1"
                      placeholder="Qty"
                      value={s.quantity}
                      onChange={e => {
                        const val = e.target.value;
                        setSplitForm(prev => ({
                          splits: prev.splits.map((item, idx) => idx === i ? { ...item, quantity: val } : item)
                        }));
                      }}
                      className="w-24 text-xs p-2 bg-white border border-slate-200 rounded-lg font-bold"
                      required
                    />
                    <input
                      type="date"
                      value={s.requiredDate ? new Date(s.requiredDate).toISOString().split('T')[0] : ''}
                      onChange={e => {
                        const val = e.target.value;
                        setSplitForm(prev => ({
                          splits: prev.splits.map((item, idx) => idx === i ? { ...item, requiredDate: val } : item)
                        }));
                      }}
                      className="flex-1 text-xs p-2 bg-white border border-slate-200 rounded-lg font-medium"
                      required
                    />
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsSplitModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingSplit || !isSplitSumValid}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-sm transition-all"
                >
                  {submittingSplit ? 'Splitting...' : 'Confirm Plan Split'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 8: LIVE MATERIAL AVAILABILITY CHECK */}
      {/* ========================================================================= */}
      {isMatCheckModalOpen && activePlan && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl border border-slate-100 animate-scaleIn max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl"><Eye className="w-5 h-5" /></div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Material Availability Check</h3>
                  <p className="text-xs text-slate-500">Plan: <span className="font-bold text-slate-800">{activePlan.planNumber}</span> ({activePlan.productName || 'Product'})</p>
                </div>
              </div>
              <button onClick={() => setIsMatCheckModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1"><X className="w-5 h-5" /></button>
            </div>

            {matChecking ? (
              <div className="py-12 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
                <span>Evaluating warehouse inventory levels...</span>
              </div>
            ) : matCheckResult ? (
              <div className="space-y-4">
                <div className={`p-3 rounded-xl border flex items-center justify-between ${matCheckResult.status === 'READY' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' :
                  matCheckResult.status === 'PARTIAL' ? 'bg-amber-50 border-amber-200 text-amber-900' :
                    'bg-rose-50 border-rose-200 text-rose-900'
                  }`}>
                  <span className="text-xs font-bold">Overall Status: {matCheckResult.status}</span>
                  <span className="text-xs font-mono font-bold">{matCheckResult.shortages?.length || 0} shortage(s)</span>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-100">
                  <table className="w-full text-left text-xs whitespace-nowrap">
                    <thead className="bg-slate-50 text-slate-600 font-extrabold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Component Material</th>
                        <th className="py-2.5 px-3 text-right">Required</th>
                        <th className="py-2.5 px-3 text-right">Available</th>
                        <th className="py-2.5 px-3 text-right">Shortage</th>
                        <th className="py-2.5 px-3">Stock Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(matCheckResult.components || []).map((c, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-bold text-slate-800">{c.materialName || c.materialCode}</td>
                          <td className="py-2 px-3 text-right font-black">{c.requiredQty}</td>
                          <td className="py-2 px-3 text-right font-medium text-slate-600">{c.availableQty || 0}</td>
                          <td className="py-2 px-3 text-right font-black text-rose-600">{c.shortageQty || 0}</td>
                          <td className="py-2 px-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${Number(c.shortageQty || 0) > 0 ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                              {Number(c.shortageQty || 0) > 0 ? 'Shortage' : 'Available'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsMatCheckModalOpen(false)}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors"
              >
                Close Check
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 9: VIEW CALCULATION (16-FIELD TRANSPARENT BREAKDOWN) */}
      {/* ========================================================================= */}
      {isCalcModalOpen && selectedCalcItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 space-y-5 shadow-2xl border border-slate-100 animate-scaleIn max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl"><Calculator className="w-5 h-5" /></div>
                <div>
                  <h3 className="text-base font-black text-slate-900">MRP Calculation Breakdown</h3>
                  <p className="text-xs text-slate-500">
                    Component: <span className="font-bold text-slate-800">{selectedCalcItem.materialName || selectedCalcItem.materialCode}</span> ({selectedCalcItem.unit || 'pcs'})
                  </p>
                </div>
              </div>
              <button onClick={() => setIsCalcModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1"><X className="w-5 h-5" /></button>
            </div>

            {/* Formula Banner */}
            <div className="p-3.5 bg-slate-900 text-white rounded-xl space-y-1 font-mono text-xs shadow-sm">
              <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Deterministic MRP Netting Formula:</div>
              <div className="text-indigo-300 font-bold">
                Net Requirement = max(0, Gross Requirement - (Usable Available Stock + Open Supply + Production Coverage))
              </div>
              <div className="text-[11px] text-slate-300">
                Usable Available = max(0, Available Stock - Protected Safety Stock)
              </div>
            </div>

            {/* 16-Step Calculation Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { label: '1. Gross Requirement', val: selectedCalcItem.trace?.grossRequirement || selectedCalcItem.requiredQty || 0, desc: 'Demand × BOM Quantity', color: 'text-slate-900 bg-slate-50' },
                { label: '2. Current On-Hand Stock', val: selectedCalcItem.trace?.currentStock || selectedCalcItem.availableQty || 0, desc: 'Physical warehouse inventory', color: 'text-slate-800 bg-slate-50' },
                { label: '3. Reserved Stock', val: selectedCalcItem.trace?.reservedStock || selectedCalcItem.reservedQty || 0, desc: 'Hard-locked allocations', color: 'text-amber-800 bg-amber-50' },
                { label: '4. Available Stock', val: selectedCalcItem.trace?.availableStock || selectedCalcItem.availableQty || 0, desc: 'On-Hand − Reserved', color: 'text-slate-900 bg-slate-50' },
                { label: '5. Protected Safety Stock', val: selectedCalcItem.trace?.safetyStock || 0, desc: 'Untouchable safety buffer', color: 'text-blue-800 bg-blue-50' },
                { label: '6. Usable Available Stock', val: selectedCalcItem.trace?.usableAvailableStock || Math.max(0, (selectedCalcItem.availableQty || 0) - (selectedCalcItem.trace?.safetyStock || 0)), desc: 'Available − Safety Stock', color: 'text-indigo-800 bg-indigo-50' },
                { label: '7. Incoming Purchase Supply', val: selectedCalcItem.trace?.incomingSupply || selectedCalcItem.onOrderQty || 0, desc: 'Eligible POs due in time', color: 'text-purple-800 bg-purple-50' },
                { label: '8. Production Coverage', val: selectedCalcItem.trace?.existingProductionCoverage || 0, desc: 'Open MOs in manufacturing', color: 'text-cyan-800 bg-cyan-50' },
                { label: '9. Total Net Available', val: selectedCalcItem.trace?.netAvailable || 0, desc: 'Usable + POs + MOs', color: 'text-emerald-800 bg-emerald-50' },
                { label: '10. Net Requirement', val: selectedCalcItem.trace?.netRequirement || selectedCalcItem.netQty || 0, desc: 'Gross − Net Available', color: 'text-purple-900 bg-purple-50' },
                { label: '11. Operational Shortage', val: selectedCalcItem.trace?.shortage || selectedCalcItem.shortageQty || 0, desc: 'Deficit (Ceil-Rounded)', color: 'text-rose-900 bg-rose-50 font-black' },
                { label: '12. Inventory Surplus', val: selectedCalcItem.trace?.surplus || 0, desc: 'Excess buffer remaining', color: 'text-emerald-900 bg-emerald-50 font-bold' },
              ].map((step, idx) => (
                <div key={idx} className={`p-3 rounded-xl border border-slate-200/80 ${step.color} flex flex-col justify-between space-y-1`}>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{step.label}</span>
                  <div className="text-lg font-black">{step.val} <span className="text-xs font-normal text-slate-500">{selectedCalcItem.unit || 'pcs'}</span></div>
                  <span className="text-[10px] text-slate-400">{step.desc}</span>
                </div>
              ))}
            </div>

            {/* Financial & UOM Section */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
              <div>
                <span className="font-bold text-slate-700">Reason Code: </span>
                <span className="px-2 py-0.5 bg-slate-200 text-slate-800 rounded font-mono font-bold text-[11px]">
                  {selectedCalcItem.shortageReason || selectedCalcItem.trace?.shortageReason || 'SUFFICIENT'}
                </span>
              </div>
              <div>
                <span className="font-bold text-slate-700">UOM Conversion: </span>
                <span className="text-slate-600 font-mono">1.0 × {selectedCalcItem.unit || 'pcs'} (Canonical)</span>
              </div>
              {selectedCalcItem.trace?.requiredCost !== undefined && (
                <div>
                  <span className="font-bold text-slate-700">Estimated Required Cost: </span>
                  <span className="font-black text-slate-900 font-mono">${selectedCalcItem.trace.requiredCost}</span>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsCalcModalOpen(false)}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors"
              >
                Close Calculation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 10: USE EXISTING PLAN MATCHING DRAWER (SECTION 7 FORMULA) */}
      {/* ========================================================================= */}
      {isMatchDrawerOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-end">
          <div className="bg-white h-full max-w-xl w-full p-6 space-y-5 shadow-2xl border-l border-slate-200 animate-slideLeft overflow-y-auto flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-purple-50 text-purple-600 rounded-xl"><Sliders className="w-5 h-5" /></div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">Deterministic Plan Matcher</h3>
                    <p className="text-xs text-slate-500">10-Criteria Scoring Engine with Explainable Sub-Scores</p>
                  </div>
                </div>
                <button onClick={() => setIsMatchDrawerOpen(false)} className="text-slate-400 hover:text-slate-600 p-1"><X className="w-5 h-5" /></button>
              </div>

              {/* Matching Search Box */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Target Product</label>
                    <select
                      value={createPlanForm.productId}
                      onChange={e => {
                        const prod = e.target.value;
                        setCreatePlanForm(prev => ({ ...prev, productId: prod }));
                        handleRunMatching(prod, allocateQty);
                      }}
                      className="w-full mt-1 p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold"
                    >
                      {materials.map(m => (
                        <option key={m._id} value={m._id}>{m.name} ({m.code})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Requested Quantity</label>
                    <input
                      type="number"
                      min="1"
                      value={allocateQty}
                      onChange={e => {
                        const q = e.target.value;
                        setAllocateQty(q);
                        handleRunMatching(createPlanForm.productId, q);
                      }}
                      className="w-full mt-1 p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* Candidate Plans List */}
              {matchingLoading ? (
                <div className="py-16 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-purple-600" />
                  <span>Scoring existing plans across 10 deterministic dimensions...</span>
                </div>
              ) : matchedPlans.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-400 italic bg-slate-50 rounded-xl">
                  No matching master production plans found for this product.
                </div>
              ) : (
                <div className="space-y-3">
                  {matchedPlans.map(match => {
                    const score = match.totalScore || 0;
                    const scoreColor = score >= 80 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-rose-500';
                    const badgeBg = score >= 80 ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : score >= 50 ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-rose-50 text-rose-800 border-rose-200';

                    return (
                      <div key={match.planId} className="p-4 rounded-xl border border-slate-200 bg-white hover:border-purple-300 transition-all shadow-sm space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-black text-slate-900 text-sm">{match.planNumber}</span>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${badgeBg}`}>
                                {score}% Match
                              </span>
                            </div>
                            <div className="text-xs text-slate-600 font-medium truncate">{match.planName}</div>
                          </div>
                          <div className="text-right">
                            <span className="text-xs text-slate-400">Remaining:</span>
                            <div className="font-black text-slate-900 text-sm">{match.remainingQuantity} units</div>
                          </div>
                        </div>

                        {/* Match Percentage Progress Bar */}
                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                          <div className={`h-2 rounded-full transition-all duration-500 ${scoreColor}`} style={{ width: `${score}%` }} />
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center justify-between pt-1">
                          <button
                            onClick={() => {
                              setSelectedMatchForInspection(match);
                              setIsMatchDetailsModalOpen(true);
                            }}
                            className="text-xs font-bold text-purple-700 hover:underline flex items-center gap-1"
                          >
                            <Info className="w-3 h-3" /> View Sub-Scores
                          </button>

                          <button
                            onClick={() => handleUseMatchedPlan(match.planId, allocateQty)}
                            disabled={allocatingPlanId === match.planId || match.remainingQuantity < allocateQty}
                            className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white rounded-lg text-xs font-bold shadow-sm transition-all flex items-center gap-1 active:scale-95"
                          >
                            {allocatingPlanId === match.planId ? 'Allocating...' : `Allocate ${allocateQty} Units`}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setIsMatchDrawerOpen(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200"
              >
                Close Matcher
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Scores Inspection Modal */}
      {isMatchDetailsModalOpen && selectedMatchForInspection && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-100 animate-scaleIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-black text-slate-900">Explainable Match Breakdown</h3>
                <p className="text-xs text-slate-500">Plan: <span className="font-bold text-slate-800">{selectedMatchForInspection.planNumber}</span> (Overall: {selectedMatchForInspection.totalScore}%)</p>
              </div>
              <button onClick={() => setIsMatchDetailsModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1"><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-2">
              {Object.entries(selectedMatchForInspection.subScores || {}).map(([key, info]) => (
                <div key={key} className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-slate-800">{info.label}</span>
                    <span className="text-[10px] text-slate-400 ml-1.5">(Weight: {info.weight})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-20 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                      <div className="h-1.5 bg-purple-600 rounded-full" style={{ width: `${info.score}%` }} />
                    </div>
                    <span className="font-mono font-bold text-slate-900 w-8 text-right">{info.score}%</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsMatchDetailsModalOpen(false)}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* FLOATING TOAST NOTIFICATIONS (NON-INTRUSIVE, NO TOP-LAYOUT SHIFT) */}
      {/* ========================================================================= */}
      {(errorMsg || successMsg) && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md w-full animate-slideUp pointer-events-auto">
          {errorMsg && (
            <div className="p-4 bg-slate-900/95 text-white rounded-2xl shadow-2xl border border-rose-500/40 flex items-start justify-between gap-3 backdrop-blur-md">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-rose-500/20 text-rose-400 rounded-xl mt-0.5">
                  <AlertTriangle className="h-5 w-5 shrink-0" />
                </div>
                <div>
                  <div className="text-xs font-black uppercase tracking-wider text-rose-400">Notice / Issue Detected</div>
                  <div className="text-xs font-medium text-slate-200 mt-1 leading-relaxed">{errorMsg}</div>
                </div>
              </div>
              <button onClick={clearError} className="text-slate-400 hover:text-white text-lg font-bold p-1 leading-none">×</button>
            </div>
          )}
          {successMsg && !errorMsg && (
            <div className="p-4 bg-slate-900/95 text-white rounded-2xl shadow-2xl border border-emerald-500/40 flex items-start justify-between gap-3 backdrop-blur-md">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl mt-0.5">
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                </div>
                <div>
                  <div className="text-xs font-black uppercase tracking-wider text-emerald-400">Success</div>
                  <div className="text-xs font-medium text-slate-200 mt-1 leading-relaxed">{successMsg}</div>
                </div>
              </div>
              <button onClick={clearSuccess} className="text-slate-400 hover:text-white text-lg font-bold p-1 leading-none">×</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


