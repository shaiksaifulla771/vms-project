import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import api from '../services/api';
import {
  Cpu,
  Play,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  PackageCheck,
  ShoppingCart,
  Sparkles,
  Layers,
  Calendar,
  Factory,
  Boxes,
  Zap,
  ShieldCheck,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';

const statusStyles = {
  Sufficient: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Procure: 'bg-rose-50 text-rose-700 border-rose-200',
  Produce: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  'Partial Stock': 'bg-amber-50 text-amber-700 border-amber-200',
};

// Auto-dismissing toast — clears after `duration` ms
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
  const [activeTab, setActiveTab] = useState('netting');
  const [runs, setRuns] = useState([]);
  const [totalRuns, setTotalRuns] = useState(0);
  const [runsPage, setRunsPage] = useState(1);
  const [selectedRun, setSelectedRun] = useState(null);
  const [requirements, setRequirements] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [converting, setConverting] = useState(false);
  const [isRunModalOpen, setIsRunModalOpen] = useState(false);
  const [recentPRs, setRecentPRs] = useState([]);

  const [errorMsg, showError, clearError] = useToast(6000);
  const [successMsg, showSuccess, clearSuccess] = useToast(5000);

  const [runForm, setRunForm] = useState({
    productId: '',
    warehouseId: '',
    targetQty: 100,
    requiredDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0],
  });

  const RUNS_PER_PAGE = 20;

  const fetchData = useCallback(async (page = runsPage) => {
    setLoading(true);
    try {
      const [matsRes, whsRes, runsRes] = await Promise.all([
        api.get('/materials'),
        api.get('/warehouses'),
        api.get(`/mrp?page=${page}&limit=${RUNS_PER_PAGE}`),
      ]);

      const matList = matsRes.data.data || matsRes.data.materials || [];
      const whList = whsRes.data.data || whsRes.data.warehouses || [];
      const runList = runsRes.data.runs || [];

      setMaterials(matList);
      setWarehouses(whList);
      setRuns(runList);
      setTotalRuns(runsRes.data.total || runList.length);

      // Default: pre-select first Finished/Assembly material
      if (matList.length > 0 && !runForm.productId) {
        const preferred = matList.find(m => m.type === 'Finished' || m.type === 'Semi-Finished') || matList[0];
        setRunForm(prev => ({ ...prev, productId: preferred._id }));
      }
      if (whList.length > 0 && !runForm.warehouseId) {
        setRunForm(prev => ({ ...prev, warehouseId: whList[0]._id }));
      }

      if (runList.length > 0 && !selectedRun) {
        await inspectRun(runList[0]._id);
      }
    } catch (err) {
      showError(err.response?.data?.error || err.message || 'Failed to load MRP data');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runsPage]);

  useEffect(() => { fetchData(); }, []);

  const changePage = async (newPage) => {
    setRunsPage(newPage);
    setLoading(true);
    try {
      const res = await api.get(`/mrp?page=${newPage}&limit=${RUNS_PER_PAGE}`);
      setRuns(res.data.runs || []);
      setTotalRuns(res.data.total || 0);
    } catch (err) {
      showError(err.response?.data?.error || 'Failed to load page');
    } finally {
      setLoading(false);
    }
  };

  const inspectRun = async (runId) => {
    try {
      const res = await api.get(`/mrp/runs/${runId}`);
      if (res.data.success) {
        setSelectedRun(res.data.mrpRun);
        setRequirements(res.data.requirements || []);
        setRecentPRs([]);
      }
    } catch (err) {
      console.error('Failed to inspect MRP run:', err);
    }
  };

  const handleExecuteMRP = async (e) => {
    e.preventDefault();
    if (!runForm.productId || !runForm.warehouseId || runForm.targetQty <= 0) {
      showError('Please select a valid target product, warehouse, and quantity > 0.');
      return;
    }
    setExecuting(true);
    try {
      const res = await api.post('/mrp/run', runForm);
      if (res.data.success) {
        showSuccess(`MRP Calculation Completed! Run: ${res.data.mrpRun.runNumber}`);
        setIsRunModalOpen(false);
        setRunsPage(1);
        await fetchData(1);
        if (res.data.mrpRun) {
          setRuns(prev => [res.data.mrpRun, ...prev.slice(0, RUNS_PER_PAGE - 1)]);
          await inspectRun(res.data.mrpRun._id);
        }
      }
    } catch (err) {
      showError(err.response?.data?.error || err.message || 'MRP calculation failed');
    } finally {
      setExecuting(false);
    }
  };

  const handleConvertRequirement = async (reqId, actionType) => {
    try {
      const res = await api.post(`/mrp/requirements/${reqId}/convert`, { targetAction: actionType });
      if (res.data.success) {
        showSuccess(`Converted to ${res.data.convertedType}!`);
        if (res.data.purchaseReq) setRecentPRs(prev => [res.data.purchaseReq, ...prev]);
        if (selectedRun) await inspectRun(selectedRun._id);
      }
    } catch (err) {
      showError(err.response?.data?.error || err.message || 'Conversion failed');
    }
  };

  const handleBulkConvertRun = async () => {
    if (!selectedRun) return;
    setConverting(true);
    try {
      const res = await api.post(`/mrp/runs/${selectedRun._id}/bulk-convert`);
      if (res.data.success) {
        showSuccess(res.data.message || 'Successfully converted all shortages!');
        await inspectRun(selectedRun._id);
        await fetchData(runsPage);
      }
    } catch (err) {
      showError(err.response?.data?.error || err.message || 'Bulk conversion failed');
    } finally {
      setConverting(false);
    }
  };

  const handleCreateProductionPlan = async () => {
    if (!selectedRun) return;
    try {
      const res = await api.post('/production-plans/create', {
        mrpRunId: selectedRun._id,
        productId: selectedRun.productId?._id || selectedRun.productId,
        warehouseId: selectedRun.warehouseId?._id || selectedRun.warehouseId,
        qty: selectedRun.targetQty,
        mrpData: { hasShortage: false, materials: requirements },
      });
      if (res.data.success) {
        showSuccess(`Production Plan ${res.data.data.planNumber} created and materials reserved!`);
      }
    } catch (err) {
      showError(err.response?.data?.error || err.message);
    }
  };

  // Only show Finished/Assembly materials in the MRP run form (these are the products to plan for)
  const plannableMaterials = useMemo(() =>
    materials.filter(m => m.type === 'Finished' || m.type === 'Semi-Finished' || m.type === 'Assembly'),
  [materials]);

  const metrics = useMemo(() => {
    const totalReqs = requirements.length;
    const shortages = requirements.filter(r => r.shortageQty > 0);
    const totalShortageQty = shortages.reduce((acc, r) => acc + (r.shortageQty || 0), 0);
    const totalGrossQty = requirements.reduce((acc, r) => acc + (r.requiredQty || 0), 0);
    const convertedCount = requirements.filter(r => r.status && r.status.startsWith('Converted')).length;
    const readinessIndex = totalReqs > 0 ? Math.round(((totalReqs - shortages.length) / totalReqs) * 100) : 100;
    return { totalReqs, shortagesCount: shortages.length, totalShortageQty, totalGrossQty, convertedCount, readinessIndex };
  }, [requirements]);

  // Compute time-phased MPS weeks from requiredDate
  const mpsWeeks = useMemo(() => {
    if (!selectedRun?.requiredDate) return null;
    const required = new Date(selectedRun.requiredDate);
    const now = new Date();
    const daysToRequired = Math.ceil((required - now) / 86400000);
    return {
      week1: { label: 'Week 1 (0–7 days)', daysOut: Math.min(7, daysToRequired), urgent: daysToRequired <= 7 },
      week23: { label: 'Weeks 2–3 (8–21 days)', daysOut: Math.min(21, daysToRequired), planned: daysToRequired > 7 && daysToRequired <= 21 },
      month1: { label: `Month 1 (Due: ${required.toLocaleDateString()})`, daysOut: daysToRequired },
    };
  }, [selectedRun]);

  const totalPages = Math.ceil(totalRuns / RUNS_PER_PAGE);

  return (
    <div className="space-y-4 font-sans text-slate-900 bg-slate-50 min-h-screen p-2">
      {/* ENTERPRISE COMMAND TOPBAR */}
      <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-orange-600 text-white rounded-md flex items-center gap-1">
                <Cpu className="h-3.5 w-3.5" /> MRP Engine
              </span>
              <span className="text-xs text-slate-500 font-medium">● Deterministic Netting & BOM Explosion</span>
            </div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
              MRP Command Center & Production Netting Workbench
            </h1>
            <p className="text-xs text-slate-500">
              Execute multi-level BOM component explosion, inventory netting, and automated procurement requisition generation.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsRunModalOpen(true)}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-extrabold text-xs rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
            >
              <Play className="h-4 w-4" />
              <span>Execute New MRP Calculation</span>
            </button>

            {selectedRun && metrics.shortagesCount > 0 && (
              <button
                onClick={handleBulkConvertRun}
                disabled={converting}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-lg shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                <Zap className={`h-4 w-4 ${converting ? 'animate-spin' : ''}`} />
                <span>{converting ? 'Converting...' : `Bulk Convert (${metrics.shortagesCount})`}</span>
              </button>
            )}

            <button
              onClick={() => fetchData()}
              className="p-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg shadow-sm transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* TOAST ALERTS */}
        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-bold flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button onClick={clearError} className="underline font-bold ml-4 shrink-0">Dismiss</button>
          </div>
        )}

        {successMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs font-bold flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button onClick={clearSuccess} className="underline font-bold ml-4 shrink-0">Dismiss</button>
          </div>
        )}

        {/* Recent PR links after conversion */}
        {recentPRs.length > 0 && (
          <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-xs flex items-center gap-2 text-blue-800 font-medium">
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            <span>{recentPRs.length} Purchase Request{recentPRs.length > 1 ? 's' : ''} created from this run.</span>
            <a href="/purchase-requests" className="underline font-bold ml-1">View Purchase Requests →</a>
          </div>
        )}
      </section>

      {/* KPI TILES */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-extrabold uppercase tracking-wider">Scheduled Target</span>
            <Factory className="h-4 w-4 text-blue-600" />
          </div>
          <p className="text-2xl font-extrabold text-slate-900">{selectedRun ? `${selectedRun.targetQty} Units` : '—'}</p>
          <p className="text-[11px] text-slate-500 font-medium">{selectedRun?.productId?.name || 'No Run Selected'}</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-extrabold uppercase tracking-wider">Gross Demand</span>
            <Boxes className="h-4 w-4 text-indigo-600" />
          </div>
          <p className="text-2xl font-extrabold text-slate-900">{metrics.totalGrossQty.toFixed(2)}</p>
          <p className="text-[11px] text-slate-500 font-medium">Component Units Required</p>
        </div>

        <div className={`rounded-xl border p-4 shadow-sm space-y-1 ${metrics.shortagesCount > 0 ? 'bg-rose-50/50 border-rose-200' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-extrabold uppercase tracking-wider">Critical Shortages</span>
            <AlertTriangle className={`h-4 w-4 ${metrics.shortagesCount > 0 ? 'text-rose-600' : 'text-slate-400'}`} />
          </div>
          <p className={`text-2xl font-extrabold ${metrics.shortagesCount > 0 ? 'text-rose-600' : 'text-slate-900'}`}>{metrics.shortagesCount}</p>
          <p className="text-[11px] text-slate-500 font-medium">{metrics.shortagesCount > 0 ? 'Procurement Required' : 'All Components Stocked'}</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-extrabold uppercase tracking-wider">Converted Orders</span>
            <CheckSquare className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-extrabold text-slate-900">{metrics.convertedCount}</p>
          <p className="text-[11px] text-slate-500 font-medium">PRs & Work Orders Created</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-extrabold uppercase tracking-wider">Readiness Index</span>
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-extrabold text-emerald-600">{metrics.readinessIndex}%</p>
          <p className="text-[11px] text-slate-500 font-medium">BOM Fulfillment Rate</p>
        </div>
      </div>

      {/* MAIN WORKBENCH GRID */}
      <div className="grid gap-5 xl:grid-cols-[280px_1fr]">
        {/* LEFT: RUN HISTORY PANEL */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">Recent MRP Runs</h3>
            <span className="text-[10px] font-mono text-slate-400">{totalRuns} Total</span>
          </div>

          <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
            {loading ? (
              <p className="text-xs text-slate-400 italic text-center p-4">Loading runs...</p>
            ) : runs.length === 0 ? (
              <p className="text-xs text-slate-400 italic text-center p-4">No MRP runs recorded.</p>
            ) : (
              runs.map((r) => {
                const isSelected = selectedRun && selectedRun._id === r._id;
                return (
                  <div
                    key={r._id}
                    onClick={() => inspectRun(r._id)}
                    className={`p-3 rounded-xl border text-xs cursor-pointer transition-all space-y-1.5 ${
                      isSelected
                        ? 'border-orange-500 bg-orange-50/30 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-mono font-extrabold text-blue-600 text-[11px]">{r.runNumber}</span>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                        r.status === 'Converted' ? 'bg-slate-100 text-slate-600' :
                        r.summary?.hasShortage ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {r.status === 'Converted' ? 'Converted' : r.summary?.hasShortage ? 'Shortage' : 'Balanced'}
                      </span>
                    </div>
                    <p className="font-extrabold text-slate-900 text-xs truncate">{r.productId?.name || 'Assembly Product'}</p>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium pt-1 border-t border-slate-200/60">
                      <span>Qty: <strong>{r.targetQty}</strong></span>
                      <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <button
                onClick={() => changePage(runsPage - 1)}
                disabled={runsPage <= 1}
                className="p-1.5 rounded border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="text-[11px] text-slate-500 font-medium">Page {runsPage} / {totalPages}</span>
              <button
                onClick={() => changePage(runsPage + 1)}
                disabled={runsPage >= totalPages}
                className="p-1.5 rounded border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </section>

        {/* RIGHT: WORKBENCH TABS */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          {/* TAB HEADERS */}
          <div className="flex border-b border-slate-200 px-4 pt-2 overflow-x-auto">
            {[
              ['netting', 'BOM Netting & Shortages', Cpu],
              ['bomTree', 'BOM Visualizer', Layers],
              ['mps', 'Time-Phased MPS', Calendar],
              ['history', 'Audit & AI Commentary', Sparkles],
            ].map(([id, label, Icon]) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`px-4 py-2 font-bold text-xs transition-all border-b-2 -mb-px flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === id
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {/* TAB 1: BOM NETTING */}
          {activeTab === 'netting' && (
            <div className="p-4 space-y-4">
              {selectedRun ? (
                <>
                  {/* Run Header */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                    <div>
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h4 className="font-extrabold text-slate-900 text-sm">
                          {selectedRun.runNumber} — {selectedRun.productId?.name} ({selectedRun.productId?.code})
                        </h4>
                        {metrics.shortagesCount > 0 ? (
                          <span className="px-2.5 py-0.5 bg-rose-600 text-white rounded text-[10px] font-extrabold uppercase animate-pulse flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" /> SHORTAGE: ACTION REQUIRED
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 bg-emerald-600 text-white rounded text-[10px] font-extrabold uppercase flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> MATERIALS READY
                          </span>
                        )}
                      </div>
                      <p className="text-slate-500">
                        Warehouse: <strong>{selectedRun.warehouseId?.name || '—'}</strong> &bull;
                        Target: <strong>{selectedRun.targetQty} units</strong> &bull;
                        Required: <strong>{selectedRun.requiredDate ? new Date(selectedRun.requiredDate).toLocaleDateString() : '—'}</strong>
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        disabled={metrics.shortagesCount === 0}
                        onClick={handleBulkConvertRun}
                        className={`px-3 py-2 text-xs font-extrabold rounded-lg transition-colors flex items-center gap-1.5 ${
                          metrics.shortagesCount === 0
                            ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                            : 'bg-orange-600 hover:bg-orange-700 text-white shadow-sm'
                        }`}
                        title={metrics.shortagesCount === 0 ? 'No shortages to convert' : 'Create Purchase Requests for all shortages'}
                      >
                        <ShoppingCart className="h-4 w-4" />
                        <span>Create Purchase Requests</span>
                      </button>

                      <button
                        disabled={metrics.shortagesCount > 0}
                        onClick={handleCreateProductionPlan}
                        className={`px-3 py-2 text-xs font-extrabold rounded-lg transition-colors flex items-center gap-1.5 ${
                          metrics.shortagesCount > 0
                            ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                        }`}
                        title={metrics.shortagesCount > 0 ? 'Resolve shortages before creating production plan' : 'All materials ready — create production plan'}
                      >
                        <Factory className="h-4 w-4" />
                        <span>Create Production Plan</span>
                      </button>
                    </div>
                  </div>

                  {/* AI Commentary */}
                  {selectedRun.summary?.aiExplanation && (
                    <div className="p-3.5 bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-100 rounded-xl flex items-start gap-3 text-xs">
                      <Sparkles className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-extrabold text-indigo-950">AI Executive Rationale</p>
                        <p className="text-slate-700 leading-relaxed mt-0.5">{selectedRun.summary.aiExplanation}</p>
                      </div>
                    </div>
                  )}

                  {/* Requirements Table */}
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                        <tr>
                          <th className="p-3">Component</th>
                          <th className="p-3 text-right">Gross Req.</th>
                          <th className="p-3 text-right">On-Hand</th>
                          <th className="p-3 text-right">On-Order</th>
                          <th className="p-3 text-right">Net Shortage</th>
                          <th className="p-3 text-center">Lead Time</th>
                          <th className="p-3 text-center">Recommendation</th>
                          <th className="p-3 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/70 font-medium text-slate-700">
                        {requirements.length === 0 ? (
                          <tr><td colSpan="8" className="p-8 text-center font-bold text-slate-400">No component requirements calculated.</td></tr>
                        ) : requirements.map((req) => (
                          <tr key={req._id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-3">
                              <p className="font-extrabold text-slate-900">{req.materialName}</p>
                              <span className="text-[10px] font-mono text-slate-400 block">{req.materialCode}</span>
                            </td>
                            <td className="p-3 text-right font-extrabold text-slate-900">{req.requiredQty} {req.unit}</td>
                            <td className="p-3 text-right font-bold text-emerald-600">{req.availableQty} {req.unit}</td>
                            <td className="p-3 text-right font-bold text-blue-600">{req.onOrderQty || 0} {req.unit}</td>
                            <td className={`p-3 text-right font-extrabold ${req.shortageQty > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                              {req.shortageQty} {req.unit}
                            </td>
                            <td className="p-3 text-center font-mono text-[11px]">{req.suggestedLeadTimeDays || 7}d</td>
                            <td className="p-3 text-center">
                              <span className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-extrabold uppercase ${statusStyles[req.action] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                {req.action || 'Sufficient'}
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              {req.status && req.status.startsWith('Converted') ? (
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-extrabold uppercase border border-slate-200">
                                  ✓ {req.status}
                                </span>
                              ) : req.shortageQty > 0 ? (
                                <button
                                  onClick={() => handleConvertRequirement(req._id, req.action === 'Produce' ? 'ProductionPlan' : 'PurchaseRequest')}
                                  className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 font-extrabold text-[10px] rounded-lg shadow-sm flex items-center justify-center gap-1 mx-auto"
                                >
                                  {req.action === 'Produce'
                                    ? <><PackageCheck className="h-3 w-3 text-indigo-600" /><span>Work Order</span></>
                                    : <><ShoppingCart className="h-3 w-3 text-orange-600" /><span>Create PR</span></>
                                  }
                                </button>
                              ) : (
                                <span className="text-[10px] font-extrabold text-emerald-600">✓ Ready</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="p-12 text-center text-slate-400 text-xs italic bg-slate-50 rounded-xl border border-slate-200">
                  Select an MRP run from the left panel or click "Execute New MRP Calculation" to begin.
                </div>
              )}
            </div>
          )}

          {/* TAB 2: BOM VISUALIZER */}
          {activeTab === 'bomTree' && (
            <div className="p-4 space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs flex justify-between items-center">
                <div>
                  <h4 className="font-extrabold text-slate-900">BOM Explosion Structural Tree</h4>
                  <p className="text-slate-500 font-normal">Component breakdown for {selectedRun?.productId?.name || 'Selected Assembly'}</p>
                </div>
                <span className="px-2.5 py-1 bg-blue-100 text-blue-800 rounded font-mono font-bold">
                  v{selectedRun?.bomVersion || 1}
                </span>
              </div>

              {selectedRun && requirements.length > 0 ? (
                <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/30 space-y-3 font-mono text-xs">
                  {/* Parent Node */}
                  <div className="p-3 bg-slate-900 text-white rounded-xl flex items-center justify-between shadow-xs font-sans">
                    <div className="flex items-center gap-2">
                      <Boxes className="h-5 w-5 text-orange-400" />
                      <div>
                        <h5 className="font-extrabold text-sm">{selectedRun.productId?.name || 'Finished Good'}</h5>
                        <span className="text-[10px] font-mono text-slate-400">Code: {selectedRun.productId?.code || '—'}</span>
                      </div>
                    </div>
                    <span className="px-3 py-1 bg-orange-500/20 text-orange-400 rounded-md text-xs font-bold">
                      Target: {selectedRun.targetQty || 0} Units
                    </span>
                  </div>

                  {/* Component Tree */}
                  <div className="pl-6 border-l-2 border-slate-300 space-y-2 pt-2">
                    {requirements.map((comp, idx) => (
                      <div key={comp._id || idx} className="p-3 bg-white border border-slate-200 rounded-xl space-y-1 shadow-sm font-sans">
                        <div className="flex justify-between items-center flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-400 font-mono text-xs">└──</span>
                            <span className="font-extrabold text-slate-900">{comp.materialName}</span>
                            <span className="text-[10px] font-mono text-slate-400">({comp.materialCode})</span>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                            comp.shortageQty === 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            {comp.shortageQty === 0 ? '✓ Sufficient' : `Shortage: ${comp.shortageQty} ${comp.unit}`}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-500 font-medium pl-6 pt-1">
                          <div>Gross: <strong className="text-slate-900">{comp.requiredQty} {comp.unit}</strong></div>
                          <div>Available: <strong className="text-emerald-600">{comp.availableQty} {comp.unit}</strong></div>
                          <div>On-Order: <strong className="text-blue-600">{comp.onOrderQty || 0} {comp.unit}</strong></div>
                          <div>Lead Time: <strong className="text-slate-700">{comp.suggestedLeadTimeDays || 7}d</strong></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-12 text-center text-slate-400 text-xs italic bg-slate-50 rounded-xl border border-slate-200">
                  Select an MRP run to visualize the BOM explosion tree.
                </div>
              )}
            </div>
          )}

          {/* TAB 3: TIME-PHASED MPS */}
          {activeTab === 'mps' && (
            <div className="p-4 space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs flex justify-between items-center">
                <div>
                  <h4 className="font-extrabold text-slate-900">Time-Phased Master Production Schedule (MPS)</h4>
                  <p className="text-slate-500 font-normal">
                    Material demand forecast based on required date:&nbsp;
                    <strong>{selectedRun?.requiredDate ? new Date(selectedRun.requiredDate).toLocaleDateString() : 'Not set'}</strong>
                  </p>
                </div>
              </div>

              {selectedRun && mpsWeeks ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className={`p-4 border rounded-xl space-y-2 ${mpsWeeks.week1.urgent ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="flex justify-between items-center">
                      <span className="font-extrabold text-xs text-slate-800">{mpsWeeks.week1.label}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${mpsWeeks.week1.urgent ? 'bg-rose-200 text-rose-800' : 'bg-slate-200 text-slate-700'}`}>
                        {mpsWeeks.week1.urgent ? 'CRITICAL' : 'Normal'}
                      </span>
                    </div>
                    <p className="text-xl font-extrabold text-slate-900">{metrics.shortagesCount} Shortage{metrics.shortagesCount !== 1 ? 's' : ''}</p>
                    <p className="text-xs text-slate-500">
                      {metrics.shortagesCount > 0 ? 'Immediate Purchase Requisition required.' : 'No immediate action needed.'}
                    </p>
                  </div>

                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-extrabold text-xs text-slate-800">{mpsWeeks.week23.label}</span>
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-[10px] font-bold">Planned</span>
                    </div>
                    <p className="text-xl font-extrabold text-slate-900">{requirements.filter(r => r.onOrderQty > 0).length} On-Order</p>
                    <p className="text-xs text-slate-500">Open Purchase Orders scheduled for delivery.</p>
                  </div>

                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-extrabold text-xs text-slate-800">{mpsWeeks.month1.label}</span>
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px] font-bold">Target</span>
                    </div>
                    <p className="text-xl font-extrabold text-slate-900">{metrics.readinessIndex}% Ready</p>
                    <p className="text-xs text-slate-500">
                      {mpsWeeks.month1.daysOut > 0 ? `${mpsWeeks.month1.daysOut} days to required date.` : 'Required date has passed!'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-12 text-center text-slate-400 text-xs italic bg-slate-50 rounded-xl border border-slate-200">
                  Select an MRP run to view the time-phased schedule.
                </div>
              )}
            </div>
          )}

          {/* TAB 4: AUDIT HISTORY */}
          {activeTab === 'history' && (
            <div className="p-4 space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                <h4 className="font-extrabold text-slate-900">MRP Execution Log & Audit Trail</h4>
                <p className="text-slate-500 font-normal">History of all executed calculation runs and AI commentary.</p>
              </div>

              <div className="space-y-3">
                {runs.length === 0 ? (
                  <p className="text-xs text-slate-400 italic text-center p-8">No runs to display.</p>
                ) : runs.map((r) => (
                  <div key={r._id} className="p-4 bg-white border border-slate-200 rounded-xl space-y-2 shadow-sm">
                    <div className="flex flex-wrap justify-between items-center gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-extrabold text-blue-600 text-xs">{r.runNumber}</span>
                        <span className="font-extrabold text-slate-900 text-xs">{r.productId?.name}</span>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                          r.status === 'Converted' ? 'bg-slate-100 text-slate-600' :
                          r.summary?.hasShortage ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>{r.status}</span>
                      </div>
                      <span className="text-xs text-slate-400 font-mono">{new Date(r.createdAt).toLocaleString()}</span>
                    </div>

                    <div className="flex gap-4 text-[11px] text-slate-500 font-medium">
                      <span>Target: <strong className="text-slate-700">{r.targetQty} units</strong></span>
                      <span>Components: <strong className="text-slate-700">{r.summary?.totalComponents || 0}</strong></span>
                      <span>Shortages: <strong className={r.summary?.totalShortages > 0 ? 'text-rose-600' : 'text-emerald-600'}>{r.summary?.totalShortages || 0}</strong></span>
                    </div>

                    {r.summary?.aiExplanation && (
                      <p className="text-xs text-slate-600 bg-indigo-50/50 p-2.5 rounded-lg border border-indigo-100 font-medium">
                        🤖 {r.summary.aiExplanation}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Modal: Execute MRP Run */}
      {isRunModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl space-y-3 border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-sm font-extrabold text-slate-950 flex items-center gap-1.5">
                <Cpu className="h-4 w-4 text-orange-600" /> Execute New MRP Calculation
              </h3>
              <button onClick={() => setIsRunModalOpen(false)} className="rounded-md px-2 py-0.5 text-xs font-bold text-slate-400 hover:bg-slate-100 hover:text-slate-700">✕</button>
            </div>

            <form onSubmit={handleExecuteMRP} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Target Assembly / Finished Good *
                  {plannableMaterials.length === 0 && (
                    <span className="text-rose-500 font-normal ml-1">(No finished/assembly materials found)</span>
                  )}
                </label>
                <select
                  required
                  value={runForm.productId}
                  onChange={(e) => setRunForm({ ...runForm, productId: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs font-medium bg-white"
                >
                  <option value="">Select Product</option>
                  {plannableMaterials.map((m) => (
                    <option key={m._id} value={m._id}>{m.name} ({m.code}) — {m.type}</option>
                  ))}
                  {plannableMaterials.length === 0 && materials.map((m) => (
                    <option key={m._id} value={m._id}>{m.name} ({m.code}) — {m.type}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Target Warehouse *</label>
                <select
                  required
                  value={runForm.warehouseId}
                  onChange={(e) => setRunForm({ ...runForm, warehouseId: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs font-medium bg-white"
                >
                  <option value="">Select Warehouse</option>
                  {warehouses.map((w) => (
                    <option key={w._id} value={w._id}>{w.name} ({w.code})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Target Quantity *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    step="0.01"
                    value={runForm.targetQty}
                    onChange={(e) => setRunForm({ ...runForm, targetQty: parseFloat(e.target.value) })}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs font-medium"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Required Date *</label>
                  <input
                    type="date"
                    required
                    min={new Date().toISOString().split('T')[0]}
                    value={runForm.requiredDate}
                    onChange={(e) => setRunForm({ ...runForm, requiredDate: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs font-medium"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsRunModalOpen(false)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 font-bold text-slate-600 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={executing}
                  className="rounded-lg bg-orange-600 hover:bg-orange-700 px-4 py-1.5 font-bold text-white shadow-sm transition-colors flex items-center gap-1 text-xs disabled:opacity-60"
                >
                  <Play className={`h-3.5 w-3.5 ${executing ? 'animate-spin' : ''}`} />
                  <span>{executing ? 'Calculating...' : 'Run MRP Calculation'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
