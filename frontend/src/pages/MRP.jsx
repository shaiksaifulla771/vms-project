import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import api from '../services/api';
import productionPlanService from '../services/productionPlanService';
import { useSiteContext } from '../context/SiteContext';
import {
  Cpu, Play, RefreshCw, AlertTriangle, CheckCircle2, PackageCheck,
  ShoppingCart, Sparkles, Layers, Calendar, Factory, Boxes, Zap,
  ShieldCheck, CheckSquare, ChevronLeft, ChevronRight, ExternalLink,
  PlusCircle, Clock, CheckCircle, XCircle, PauseCircle, FileText,
  Search, Filter, Eye, Sliders, SendHorizontal, ArrowRight, X, Plus,
  Trash2, TrendingDown, Scale, Scissors, AlertCircle, BarChart3,
  CalendarClock, ArrowUpRight, History, Check, Info, ChevronDown
} from 'lucide-react';

const statusBadgeStyles = {
  UNSCHEDULED: 'bg-amber-50 text-amber-800 border-amber-200/80',
  Unscheduled: 'bg-amber-50 text-amber-800 border-amber-200/80',
  SCHEDULED: 'bg-blue-50 text-blue-800 border-blue-200/80',
  Scheduled: 'bg-blue-50 text-blue-800 border-blue-200/80',
  'Partially Scheduled': 'bg-indigo-50 text-indigo-800 border-indigo-200/80',
  RELEASED: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
  Released: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
  IN_PROGRESS: 'bg-purple-50 text-purple-800 border-purple-200/80',
  'In Production': 'bg-purple-50 text-purple-800 border-purple-200/80',
  COMPLETED: 'bg-slate-100 text-slate-800 border-slate-300/80',
  Completed: 'bg-slate-100 text-slate-800 border-slate-300/80',
  ON_HOLD: 'bg-orange-50 text-orange-800 border-orange-200/80',
  'On Hold': 'bg-orange-50 text-orange-800 border-orange-200/80',
  CANCELLED: 'bg-rose-50 text-rose-800 border-rose-200/80',
  Cancelled: 'bg-rose-50 text-rose-800 border-rose-200/80',
  DRAFT: 'bg-slate-100 text-slate-700 border-slate-200',
  Draft: 'bg-slate-100 text-slate-700 border-slate-200',
};

const materialBadgeStyles = {
  READY: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Ready: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PARTIAL: 'bg-amber-50 text-amber-700 border-amber-200',
  Partial: 'bg-amber-50 text-amber-700 border-amber-200',
  SHORTAGE: 'bg-rose-50 text-rose-700 border-rose-200',
  Shortage: 'bg-rose-50 text-rose-700 border-rose-200',
  'Not Evaluated': 'bg-slate-50 text-slate-600 border-slate-200',
};

const priorityStyles = {
  HIGH: 'bg-rose-50 text-rose-700 border-rose-200',
  MEDIUM: 'bg-amber-50 text-amber-700 border-amber-200',
  LOW: 'bg-slate-50 text-slate-600 border-slate-200',
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
  const { activeSiteId, activeWarehouseId, activeSite, activeWarehouse } = useSiteContext();
  
  // Navigation: 'dashboard' | 'unscheduled' | 'scheduled' | 'all_plans' | 'netting' | 'exceptions' | 'runs'
  const [viewTab, setViewTab] = useState('dashboard');
  const [planFilter, setPlanFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Summary and Exceptions State
  const [summaryData, setSummaryData] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [exceptions, setExceptions] = useState([]);
  const [loadingExceptions, setLoadingExceptions] = useState(false);

  // Runs and Requirements
  const [runs, setRuns] = useState([]);
  const [totalRuns, setTotalRuns] = useState(0);
  const [runsPage, setRunsPage] = useState(1);
  const [selectedRun, setSelectedRun] = useState(null);
  const [requirements, setRequirements] = useState([]);

  // Plans & Master Data
  const [plans, setPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [materials, setMaterials] = useState([]);
  const [boms, setBoms] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [sites, setSites] = useState([]);

  // Modals & Action States
  const [isRunModalOpen, setIsRunModalOpen] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isRescheduleModalOpen, setIsRescheduleModalOpen] = useState(false);
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [isUseModalOpen, setIsUseModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isMatCheckModalOpen, setIsMatCheckModalOpen] = useState(false);

  const [activePlan, setActivePlan] = useState(null);
  const [plansToUseQty, setPlansToUseQty] = useState(1);
  const [matCheckResult, setMatCheckResult] = useState(null);
  const [matChecking, setMatChecking] = useState(false);
  const [executingMRP, setExecutingMRP] = useState(false);
  const [submittingPlan, setSubmittingPlan] = useState(false);
  const [submittingSchedule, setSubmittingSchedule] = useState(false);
  const [submittingReschedule, setSubmittingReschedule] = useState(false);
  const [submittingSplit, setSubmittingSplit] = useState(false);
  const [submittingUse, setSubmittingUse] = useState(false);

  const [errorMsg, showError, clearError] = useToast(6000);
  const [successMsg, showSuccess, clearSuccess] = useToast(5000);

  // Form States
  const [runForm, setRunForm] = useState({
    productId: '',
    siteId: '',
    warehouseId: 'all',
    warehouseScope: 'all',
    targetQty: 100,
    horizonDays: 30,
    requiredDate: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().split('T')[0],
  });

  const [manualForm, setManualForm] = useState({
    planName: '',
    productId: '',
    bomId: '',
    warehouseId: '',
    totalPlans: 50,
    priority: 'MEDIUM',
    requiredDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0],
    notes: '',
    ingredients: [],
  });

  const [scheduleForm, setScheduleForm] = useState({
    productionDate: new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString().split('T')[0],
    startTime: '08:00',
    endTime: '16:00',
    shiftId: 'Morning Shift',
    lineId: 'Assembly Line Alpha',
    estimatedDuration: 480,
  });

  const [rescheduleForm, setRescheduleForm] = useState({
    productionDate: new Date(Date.now() + 4 * 24 * 3600 * 1000).toISOString().split('T')[0],
    startTime: '08:00',
    endTime: '16:00',
    shiftId: 'Morning Shift',
    lineId: 'Assembly Line Alpha',
    reason: '',
  });

  const [splitForm, setSplitForm] = useState({
    splits: [
      { quantity: 50, requiredDate: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString().split('T')[0], lineId: 'Assembly Line Alpha' },
      { quantity: 50, requiredDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0], lineId: 'Assembly Line Alpha' }
    ]
  });

  // Summary Fetch
  const fetchSummary = useCallback(async () => {
    setLoadingSummary(true);
    try {
      const query = {};
      if (activeSiteId) query.siteId = activeSiteId;
      if (activeWarehouseId && activeWarehouseId !== 'all') query.warehouseId = activeWarehouseId;
      const res = await api.get('/mrp/summary', { params: query });
      setSummaryData(res.data.summary);
    } catch (err) {
      console.warn('[MRP Dashboard] Summary error:', err.message);
    } finally {
      setLoadingSummary(false);
    }
  }, [activeSiteId, activeWarehouseId]);

  // Exceptions Fetch
  const fetchExceptions = useCallback(async () => {
    setLoadingExceptions(true);
    try {
      const query = {};
      if (activeSiteId) query.siteId = activeSiteId;
      const res = await api.get('/mrp/exceptions', { params: query });
      setExceptions(res.data.data || []);
    } catch (err) {
      console.warn('[MRP Exceptions] Error:', err.message);
    } finally {
      setLoadingExceptions(false);
    }
  }, [activeSiteId]);

  // Fetch All Core Data
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
        setManualForm(prev => ({ ...prev, productId: makeMats[0]._id, planName: `${makeMats[0].name} Production` }));
      }
      if (whList.length > 0 && !manualForm.warehouseId) {
        setManualForm(prev => ({ ...prev, warehouseId: whList[0]._id }));
        setScheduleForm(prev => ({ ...prev, warehouseId: whList[0]._id }));
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

  // Run MRP
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

  // Schedule Plan
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

  // Reschedule Plan
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

  // Split Plan
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

  // Release Plan
  const handleReleasePlan = async (e) => {
    e.preventDefault();
    if (!activePlan) return;
    setSubmittingUse(true);
    try {
      const res = await api.post(`/production-plans/${activePlan._id}/release`, { quantity: plansToUseQty });
      showSuccess(res.data.message || `Released ${plansToUseQty} plans into Production Order.`);
      setIsUseModalOpen(false);
      setActivePlan(null);
      fetchData();
    } catch (err) {
      showError(err.response?.data?.error || 'Plan release failed');
    } finally {
      setSubmittingUse(false);
    }
  };

  // Check Materials
  const handleCheckMaterials = async (plan) => {
    setActivePlan(plan);
    setMatChecking(true);
    setIsMatCheckModalOpen(true);
    try {
      const res = await api.post(`/production-plans/${plan._id}/material-check`);
      setMatCheckResult(res.data.data || res.data);
    } catch (err) {
      showError(err.response?.data?.error || 'Material check failed');
      setIsMatCheckModalOpen(false);
    } finally {
      setMatChecking(false);
    }
  };

  // Hold / Cancel Plan
  const handlePlanStatusChange = async (planId, action) => {
    try {
      await api.post(`/production-plans/${planId}/${action}`);
      showSuccess(`Plan ${action} action executed successfully.`);
      fetchData();
    } catch (err) {
      showError(err.response?.data?.error || `Action ${action} failed`);
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
    } else if (planFilter !== 'ALL') {
      list = list.filter(p => {
        const s = (p.status || '').toUpperCase();
        if (planFilter === 'UNSCHEDULED') return s === 'UNSCHEDULED' || s === 'DRAFT';
        if (planFilter === 'SCHEDULED') return s === 'SCHEDULED';
        if (planFilter === 'RELEASED') return s === 'RELEASED';
        if (planFilter === 'IN_PROGRESS') return s === 'IN_PROGRESS' || s === 'IN PRODUCTION';
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

  // Split calculation validation helper
  const totalSplitSum = useMemo(() => {
    return splitForm.splits.reduce((acc, s) => acc + (Number(s.quantity) || 0), 0);
  }, [splitForm.splits]);

  const targetPlanQty = activePlan?.totalPlans || activePlan?.quantity || 0;
  const isSplitSumValid = totalSplitSum === targetPlanQty && targetPlanQty > 0;

  return (
    <div className="space-y-5 font-sans text-slate-900 bg-slate-50/60 min-h-screen p-3 md:p-6 max-w-full overflow-x-hidden">
      {/* 1. HERO TOP BAR */}
      <section className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200/90 shadow-sm space-y-3 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-slate-900 text-white rounded-md flex items-center gap-1">
                <Cpu className="h-3 w-3" /> MRP & Production Engine
              </span>
              <span className="text-xs text-slate-500 font-semibold flex items-center gap-1">
                ● {activeSite?.name || 'All Sites'} {activeWarehouse?.name ? `(${activeWarehouse.name})` : ''}
              </span>
            </div>
            <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">
              Material Requirements & Planning
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
              onClick={() => setIsManualModalOpen(true)}
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

        {/* TOAST ALERTS */}
        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl text-xs font-bold flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button onClick={clearError} className="underline font-bold ml-4 shrink-0 hover:text-rose-700">Dismiss</button>
          </div>
        )}

        {successMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs font-bold flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button onClick={clearSuccess} className="underline font-bold ml-4 shrink-0 hover:text-emerald-700">Dismiss</button>
          </div>
        )}
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
            ['all_plans', 'All Plans', FileText, plans.length],
            ['netting', 'Netting Matrix', Cpu, requirements.length],
            ['exceptions', 'Exceptions', AlertTriangle, exceptions.length],
            ['runs', 'History', History, runs.length],
          ].map(([id, label, Icon, badgeCount]) => (
            <button
              key={id}
              onClick={() => setViewTab(id)}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap ${
                viewTab === id
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{label}</span>
              {badgeCount !== undefined && badgeCount > 0 && (
                <span className={`px-1.5 py-0.2 text-[10px] rounded-full font-black ${
                  viewTab === id ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-700'
                }`}>
                  {badgeCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Filter & Search Hub */}
        <div className="flex items-center gap-2 shrink-0">
          {viewTab !== 'dashboard' && viewTab !== 'runs' && (
            <select
              value={priorityFilter}
              onChange={e => setPriorityFilter(e.target.value)}
              className="text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 focus:outline-none"
            >
              <option value="ALL">All Priorities</option>
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


      {/* ========================================================================= */}
      {/* 1. PLANNING DASHBOARD VIEW */}
      {/* ========================================================================= */}
      {viewTab === 'dashboard' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Quick Action Box 1: Unscheduled Plans */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-600" />
                    Unscheduled Requirements
                  </h3>
                  <span className="text-[11px] font-extrabold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                    Needs Assignment
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Confirmed customer and forecast demand awaiting shop floor work center assignment.
                </p>

                <div className="space-y-2">
                  {plans.filter(p => (p.status || '').toUpperCase() === 'UNSCHEDULED').slice(0, 4).map(p => (
                    <div key={p._id} className="p-3 bg-slate-50/80 hover:bg-slate-100/80 rounded-xl border border-slate-100 flex items-center justify-between transition-colors">
                      <div>
                        <p className="text-xs font-bold text-slate-900">{p.planNumber} — {p.productName || p.productCode}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          <span className="font-bold text-slate-700">{p.totalPlans || p.quantity} units</span> ● Due {p.requiredDate ? new Date(p.requiredDate).toLocaleDateString() : 'N/A'}
                        </p>
                      </div>
                      <button
                        onClick={() => { setActivePlan(p); setIsScheduleModalOpen(true); }}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm"
                      >
                        Schedule
                      </button>
                    </div>
                  ))}
                  {plans.filter(p => (p.status || '').toUpperCase() === 'UNSCHEDULED').length === 0 && (
                    <div className="p-6 text-center text-slate-400 italic text-xs bg-slate-50 rounded-xl">
                      No unscheduled plans pending.
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={() => setViewTab('unscheduled')}
                className="pt-2 text-xs font-extrabold text-blue-600 hover:text-blue-700 flex items-center justify-between border-t border-slate-100"
              >
                <span>View all unscheduled plans</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Quick Action Box 2: Scheduled Queue */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                    <CalendarClock className="w-4 h-4 text-blue-600" />
                    Scheduled Production Queue
                  </h3>
                  <span className="text-[11px] font-extrabold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                    Ready to Release
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Plans with locked resources and dates ready for shop floor dispatch.
                </p>

                <div className="space-y-2">
                  {plans.filter(p => (p.status || '').toUpperCase() === 'SCHEDULED').slice(0, 4).map(p => (
                    <div key={p._id} className="p-3 bg-slate-50/80 hover:bg-slate-100/80 rounded-xl border border-slate-100 flex items-center justify-between transition-colors">
                      <div>
                        <p className="text-xs font-bold text-slate-900">{p.planNumber} — {p.productName || p.productCode}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {p.workCenter || p.schedule?.lineId || 'Assembly Line'} ● Start: {p.scheduledStartDate ? new Date(p.scheduledStartDate).toLocaleDateString() : 'Set'}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setActivePlan(p);
                          setPlansToUseQty(p.availablePlans || p.quantity || 1);
                          setIsUseModalOpen(true);
                        }}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm"
                      >
                        Release
                      </button>
                    </div>
                  ))}
                  {plans.filter(p => (p.status || '').toUpperCase() === 'SCHEDULED').length === 0 && (
                    <div className="p-6 text-center text-slate-400 italic text-xs bg-slate-50 rounded-xl">
                      No scheduled plans in queue.
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={() => setViewTab('scheduled')}
                className="pt-2 text-xs font-extrabold text-blue-600 hover:text-blue-700 flex items-center justify-between border-t border-slate-100"
              >
                <span>View all scheduled plans</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Quick Action Box 3: Exceptions */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    Planning Exceptions Hub
                  </h3>
                  <span className="text-[11px] font-extrabold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                    Live Diagnostics
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Real-time stock shortages, past-due lead times, and capacity conflicts.
                </p>

                <div className="space-y-2">
                  {exceptions.slice(0, 3).map((ex, i) => (
                    <div key={i} className="p-3 bg-rose-50/50 rounded-xl border border-rose-100 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-rose-700 uppercase">{ex.code || 'SHORTAGE'}</span>
                        <span className="text-[10px] text-slate-400">{ex.productName || 'Material'}</span>
                      </div>
                      <p className="text-xs font-bold text-slate-800">{ex.message}</p>
                    </div>
                  ))}
                  {exceptions.length === 0 && (
                    <div className="p-6 text-center text-emerald-600 italic text-xs bg-emerald-50/50 rounded-xl font-bold flex items-center justify-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" /> All planning parameters optimal.
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={() => setViewTab('exceptions')}
                className="pt-2 text-xs font-extrabold text-rose-600 hover:text-rose-700 flex items-center justify-between border-t border-slate-100"
              >
                <span>Open Exceptions Hub ({exceptions.length})</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2/3/4. PLANS GRID (UNSCHEDULED / SCHEDULED / ALL) */}
      {/* ========================================================================= */}
      {(viewTab === 'unscheduled' || viewTab === 'scheduled' || viewTab === 'all_plans') && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm space-y-4 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-black text-slate-900 tracking-tight">
                {viewTab === 'unscheduled' && 'Unscheduled Production Requirements'}
                {viewTab === 'scheduled' && 'Scheduled Manufacturing Plans'}
                {viewTab === 'all_plans' && 'All Production Plans Master Ledger'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Showing {filteredPlans.length} requirements
              </p>
            </div>

            {viewTab === 'all_plans' && (
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
                {['ALL', 'UNSCHEDULED', 'SCHEDULED', 'RELEASED', 'IN_PROGRESS', 'COMPLETED', 'SHORTAGES'].map(f => (
                  <button
                    key={f}
                    onClick={() => setPlanFilter(f)}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                      planFilter === f
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-slate-50/90 text-slate-600 font-extrabold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-3.5">Plan Reference</th>
                  <th className="py-3 px-3.5">Target Product</th>
                  <th className="py-3 px-3.5 text-right">Quantity</th>
                  <th className="py-3 px-3.5">Priority</th>
                  <th className="py-3 px-3.5">Required Date</th>
                  <th className="py-3 px-3.5">Lifecycle Status</th>
                  <th className="py-3 px-3.5">Material Check</th>
                  <th className="py-3 px-3.5">Assigned Resource</th>
                  <th className="py-3 px-3.5 text-right">Planner Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPlans.map(plan => {
                  const statusKey = plan.status || 'UNSCHEDULED';
                  const matStatusKey = plan.materialStatus?.status || 'Not Evaluated';
                  const isUnscheduled = ['UNSCHEDULED', 'DRAFT', 'PENDING'].includes((statusKey || '').toUpperCase());
                  const isScheduled = ['SCHEDULED', 'PARTIALLY SCHEDULED'].includes((statusKey || '').toUpperCase());

                  return (
                    <tr key={plan._id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Reference */}
                      <td className="py-3 px-3.5 font-black text-slate-900">
                        {plan.planNumber}
                        {plan.parentPlanNumber && (
                          <span className="block text-[10px] text-slate-400 font-normal">Split from {plan.parentPlanNumber}</span>
                        )}
                      </td>

                      {/* Product */}
                      <td className="py-3 px-3.5">
                        <div className="font-bold text-slate-800">{plan.productName || plan.productCode}</div>
                        <div className="text-[10px] text-slate-400">BOM: {plan.bomVersion ? `v${plan.bomVersion}` : 'Default Recipe'}</div>
                      </td>

                      {/* Quantity */}
                      <td className="py-3 px-3.5 text-right font-black text-slate-900">
                        {plan.totalPlans || plan.quantity} units
                        {plan.releasedPlans > 0 && (
                          <span className="block text-[10px] text-emerald-600 font-bold">Rel: {plan.releasedPlans}</span>
                        )}
                      </td>

                      {/* Priority */}
                      <td className="py-3 px-3.5">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${priorityStyles[(plan.priority || 'MEDIUM').toUpperCase()]}`}>
                          {plan.priority || 'MEDIUM'}
                        </span>
                      </td>

                      {/* Required Date */}
                      <td className="py-3 px-3.5 font-medium text-slate-600">
                        {plan.requiredDate ? new Date(plan.requiredDate).toLocaleDateString() : 'N/A'}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3.5">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${statusBadgeStyles[statusKey] || 'bg-slate-100 text-slate-700'}`}>
                          {statusKey}
                        </span>
                      </td>

                      {/* Material Status */}
                      <td className="py-3 px-3.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${materialBadgeStyles[matStatusKey] || 'bg-slate-100 text-slate-600'}`}>
                          {matStatusKey}
                        </span>
                      </td>

                      {/* Work Center */}
                      <td className="py-3 px-3.5 text-slate-600 font-medium">
                        {plan.workCenter || plan.schedule?.lineId || '-'}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Live Material Check */}
                          <button
                            onClick={() => handleCheckMaterials(plan)}
                            className="p-1.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                            title="Check Live Inventory Availability"
                          >
                            <Boxes className="w-3.5 h-3.5" />
                          </button>

                          {/* Unscheduled Actions */}
                          {isUnscheduled && (
                            <>
                              <button
                                onClick={() => { setActivePlan(plan); setIsScheduleModalOpen(true); }}
                                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all flex items-center gap-1"
                              >
                                <Calendar className="w-3 h-3" /> Schedule
                              </button>
                              <button
                                onClick={() => {
                                  setActivePlan(plan);
                                  const total = plan.totalPlans || plan.quantity;
                                  const half = Math.floor(total / 2);
                                  setSplitForm({
                                    splits: [
                                      { quantity: half, requiredDate: plan.requiredDate, lineId: 'Assembly Line Alpha' },
                                      { quantity: total - half, requiredDate: plan.requiredDate, lineId: 'Assembly Line Alpha' }
                                    ]
                                  });
                                  setIsSplitModalOpen(true);
                                }}
                                className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg text-xs font-bold transition-all flex items-center gap-1"
                              >
                                <Scissors className="w-3 h-3" /> Split
                              </button>
                            </>
                          )}

                          {/* Scheduled Actions */}
                          {isScheduled && (
                            <>
                              <button
                                onClick={() => {
                                  setActivePlan(plan);
                                  setRescheduleForm({
                                    productionDate: plan.scheduledStartDate ? new Date(plan.scheduledStartDate).toISOString().split('T')[0] : '',
                                    startTime: '08:00',
                                    endTime: '16:00',
                                    shiftId: 'Morning Shift',
                                    lineId: plan.workCenter || 'Assembly Line Alpha',
                                    reason: ''
                                  });
                                  setIsRescheduleModalOpen(true);
                                }}
                                className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold transition-all flex items-center gap-1"
                              >
                                <CalendarClock className="w-3 h-3" /> Reschedule
                              </button>
                              <button
                                onClick={() => {
                                  setActivePlan(plan);
                                  setPlansToUseQty(plan.availablePlans !== undefined ? plan.availablePlans : (plan.quantity || 1));
                                  setIsUseModalOpen(true);
                                }}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all flex items-center gap-1"
                              >
                                <Play className="w-3 h-3" /> Release
                              </button>
                            </>
                          )}

                          {/* Hold */}
                          {['UNSCHEDULED', 'SCHEDULED'].includes((statusKey || '').toUpperCase()) && (
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
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. MATERIAL REQUIREMENTS & NETTING MATRIX */}
      {/* ========================================================================= */}
      {viewTab === 'netting' && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm space-y-4 p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-black text-slate-900">
                {selectedRun ? `Material Netting Matrix — Run ${selectedRun.runNumber}` : 'Material Requirements & Netting Matrix'}
              </h2>
              <p className="text-xs text-slate-500">
                Gross Requirements $\rightarrow$ Available On Hand $\rightarrow$ Open Supply $\rightarrow$ Net Shortage Calculation
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
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${
                        req.action === 'Procure' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                        req.action === 'Produce' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                        'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}>
                        {req.action}
                      </span>
                    </td>
                  </tr>
                ))}
                {requirements.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400 italic">
                      Select an MRP Run from History or execute a new MRP calculation to view live netting.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. PLANNING EXCEPTIONS HUB */}
      {/* ========================================================================= */}
      {viewTab === 'exceptions' && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm space-y-4 p-5">
          <div className="pb-3 border-b border-slate-100">
            <h2 className="text-base font-black text-slate-900">Planning Exceptions & Constraints</h2>
            <p className="text-xs text-slate-500">Live actionable bottleneck diagnosis</p>
          </div>

          <div className="space-y-3">
            {exceptions.map((ex, i) => (
              <div key={i} className="p-4 rounded-xl border border-rose-200 bg-rose-50/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-rose-600 text-white rounded text-[10px] font-black uppercase">
                      {ex.code}
                    </span>
                    <span className="text-xs font-bold text-slate-800">{ex.productName || ex.productCode}</span>
                    <span className="text-xs text-slate-400">● {ex.warehouseName || 'Main Warehouse'}</span>
                  </div>
                  <p className="text-xs text-slate-700 font-medium">{ex.message}</p>
                  <p className="text-[11px] text-slate-500 font-bold">Suggested Action: {ex.actionRequired}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setViewTab('all_plans')}
                    className="px-3.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-bold rounded-lg shadow-sm"
                  >
                    View Plan
                  </button>
                  <button
                    onClick={() => setIsRunModalOpen(true)}
                    className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg shadow-sm"
                  >
                    Re-run MRP
                  </button>
                </div>
              </div>
            ))}

            {exceptions.length === 0 && (
              <div className="p-12 text-center text-slate-400 italic bg-slate-50 rounded-xl">
                No active planning exceptions or material shortages found.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. MRP RUN HISTORY */}
      {/* ========================================================================= */}
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
      {/* MODAL: RUN MRP ENGINE */}
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
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={executingMRP}
                  className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-all active:scale-95"
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
      {/* MODAL: RESCHEDULE PLAN */}
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
              <button onClick={() => setIsRescheduleModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
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
                  placeholder="e.g. Material delivery delay from vendor, Work center resequencing..."
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl h-24 font-medium"
                  required
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {['Supplier Delay', 'Line Breakdown', 'Urgent Customer Priority', 'Material Shortage'].map(chip => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setRescheduleForm(prev => ({ ...prev, reason: chip }))}
                    className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-[10px] font-bold"
                  >
                    {chip}
                  </button>
                ))}
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
      {/* MODAL: SPLIT PLAN WITH PROGRESS VALIDATION */}
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
              <button onClick={() => setIsSplitModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleSplitPlan} className="space-y-4">
              {/* Allocation Validation Bar */}
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
      {/* MODAL: SCHEDULE PLAN */}
      {/* ========================================================================= */}
      {isScheduleModalOpen && activePlan && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-100 animate-scaleIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl"><Calendar className="w-5 h-5" /></div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Schedule Plan {activePlan.planNumber}</h3>
                  <p className="text-xs text-slate-500">Lock work center and shift calendar</p>
                </div>
              </div>
              <button onClick={() => setIsScheduleModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
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
                <label className="block text-xs font-bold text-slate-700 mb-1">Production Work Center</label>
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
      {/* MODAL: RELEASE TO PRODUCTION ORDER */}
      {/* ========================================================================= */}
      {isUseModalOpen && activePlan && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-100 animate-scaleIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl"><Play className="w-5 h-5" /></div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Release Plan to Production</h3>
                  <p className="text-xs text-slate-500">Generate shop floor Production Order</p>
                </div>
              </div>
              <button onClick={() => setIsUseModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleReleasePlan} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Release Quantity</label>
                <input
                  type="number"
                  min="1"
                  max={activePlan.availablePlans || activePlan.quantity}
                  value={plansToUseQty}
                  onChange={e => setPlansToUseQty(Math.max(1, parseInt(e.target.value, 10)))}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  required
                />
                <p className="text-[11px] text-slate-400 mt-1 font-medium">Available remaining in plan: {activePlan.availablePlans || activePlan.quantity} units</p>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsUseModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingUse}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all"
                >
                  {submittingUse ? 'Releasing...' : 'Generate Production Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: LIVE MATERIAL CHECK */}
      {/* ========================================================================= */}
      {isMatCheckModalOpen && activePlan && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl border border-slate-100 animate-scaleIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-slate-100 text-slate-800 rounded-xl"><Boxes className="w-5 h-5" /></div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Material Availability Check</h3>
                  <p className="text-xs text-slate-500">Plan: {activePlan.planNumber} ({activePlan.totalPlans || activePlan.quantity} units)</p>
                </div>
              </div>
              <button onClick={() => setIsMatCheckModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>

            {matChecking ? (
              <div className="py-12 text-center text-slate-400 font-bold flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" /> Evaluating warehouse inventory balances...
              </div>
            ) : matCheckResult ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-xs font-bold text-slate-700">Readiness Assessment:</span>
                  <span className={`px-3 py-1 rounded-full text-xs font-black border ${materialBadgeStyles[matCheckResult.status] || 'bg-slate-100 text-slate-700'}`}>
                    {matCheckResult.status}
                  </span>
                </div>

                <div className="overflow-x-auto max-h-60 rounded-xl border border-slate-100">
                  <table className="w-full text-left text-xs whitespace-nowrap">
                    <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Component Material</th>
                        <th className="py-2.5 px-3 text-right">Required</th>
                        <th className="py-2.5 px-3 text-right">Available</th>
                        <th className="py-2.5 px-3 text-right text-rose-600">Shortage</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(matCheckResult.components || []).map((comp, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-bold text-slate-800">{comp.materialName || comp.materialCode}</td>
                          <td className="py-2.5 px-3 text-right font-black">{comp.requiredQty} {comp.unit}</td>
                          <td className="py-2.5 px-3 text-right font-bold text-blue-700">{comp.availableQty} {comp.unit}</td>
                          <td className="py-2.5 px-3 text-right font-black text-rose-600">
                            {comp.shortageQty > 0 ? `${comp.shortageQty} ${comp.unit}` : '0'}
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
                onClick={() => setIsMatCheckModalOpen(false)}
                className="px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors shadow-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
