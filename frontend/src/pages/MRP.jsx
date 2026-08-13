import React, { useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import {
  Cpu,
  Play,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  PackageCheck,
  ShoppingCart,
  Sparkles,
  Layers,
  Calendar,
  Building2,
  Factory,
  Boxes,
  Zap,
  TrendingUp,
  Clock,
  ShieldCheck,
  CheckSquare,
  FileText
} from 'lucide-react';

const statusStyles = {
  Sufficient: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Procure: 'bg-rose-50 text-rose-700 border-rose-200',
  Produce: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  'Partial Stock': 'bg-amber-50 text-amber-700 border-amber-200',
};

export default function MRP() {
  const [activeTab, setActiveTab] = useState('netting'); // netting, bomTree, mps, history
  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [requirements, setRequirements] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [boms, setBoms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [converting, setConverting] = useState(false);
  const [isRunModalOpen, setIsRunModalOpen] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [runForm, setRunForm] = useState({
    productId: '',
    warehouseId: '',
    targetQty: 100,
    requiredDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0],
  });

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [matsRes, whsRes, runsRes, bomRes] = await Promise.all([
        api.get('/materials'),
        api.get('/warehouses'),
        api.get('/mrp'),
        api.get('/boms')
      ]);

      const matList = matsRes.data.data || matsRes.data.materials || [];
      const whList = whsRes.data.data || whsRes.data.warehouses || [];
      const runList = runsRes.data.runs || [];
      const bomList = bomRes.data.data || bomRes.data.boms || [];

      setMaterials(matList);
      setWarehouses(whList);
      setRuns(runList);
      setBoms(bomList);

      // Default select first product & warehouse if form empty
      if (matList.length > 0 && !runForm.productId) {
        const finishedMat = matList.find(m => m.type === 'Finished' || m.type === 'Assembly') || matList[0];
        setRunForm(prev => ({ ...prev, productId: finishedMat._id }));
      }
      if (whList.length > 0 && !runForm.warehouseId) {
        setRunForm(prev => ({ ...prev, warehouseId: whList[0]._id }));
      }

      if (runList.length > 0) {
        inspectRun(runList[0]._id);
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load MRP master data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const inspectRun = async (runId) => {
    try {
      const res = await api.get(`/mrp/runs/${runId}`);
      if (res.data.success) {
        setSelectedRun(res.data.mrpRun);
        setRequirements(res.data.requirements || []);
      }
    } catch (err) {
      console.error('Failed to inspect MRP run:', err);
    }
  };

  const handleExecuteMRP = async (e) => {
    e.preventDefault();
    if (!runForm.productId || !runForm.warehouseId || runForm.targetQty <= 0) {
      setError('Please select a valid target product, warehouse, and quantity > 0.');
      return;
    }
    setExecuting(true);
    setError('');
    setSuccess('');
    try {
      const res = await api.post('/mrp/run', runForm);
      if (res.data.success) {
        setSuccess(`MRP Calculation Completed! Run Code: ${res.data.mrpRun.runNumber}`);
        setIsRunModalOpen(false);
        await fetchData();
        if (res.data.mrpRun) {
          inspectRun(res.data.mrpRun._id);
        }
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'MRP calculation failed');
    } finally {
      setExecuting(false);
    }
  };

  const handleConvertRequirement = async (reqId, actionType) => {
    setError('');
    setSuccess('');
    try {
      const res = await api.post(`/mrp/requirements/${reqId}/convert`, { targetAction: actionType });
      if (res.data.success) {
        setSuccess(`Converted requirement to ${res.data.convertedType}!`);
        if (selectedRun) inspectRun(selectedRun._id);
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Conversion failed');
    }
  };

  const handleBulkConvertRun = async () => {
    if (!selectedRun) return;
    setConverting(true);
    setError('');
    setSuccess('');
    try {
      const res = await api.post(`/mrp/runs/${selectedRun._id}/bulk-convert`);
      if (res.data.success) {
        setSuccess(res.data.message || 'Successfully converted all run shortages into POs and Work Orders!');
        inspectRun(selectedRun._id);
        fetchData();
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Bulk conversion failed');
    } finally {
      setConverting(false);
    }
  };

  // Metrics summary calculated from selected run
  const metrics = useMemo(() => {
    const totalReqs = requirements.length;
    const shortages = requirements.filter(r => r.shortageQty > 0);
    const totalShortageQty = shortages.reduce((acc, r) => acc + (r.shortageQty || 0), 0);
    const totalGrossQty = requirements.reduce((acc, r) => acc + (r.requiredQty || 0), 0);
    const convertedCount = requirements.filter(r => r.status && r.status.startsWith('Converted')).length;
    const readinessIndex = totalReqs > 0 ? Math.round(((totalReqs - shortages.length) / totalReqs) * 100) : 100;
    return { totalReqs, shortagesCount: shortages.length, totalShortageQty, totalGrossQty, convertedCount, readinessIndex };
  }, [requirements]);

  const activeBomObject = useMemo(() => {
    if (!selectedRun) return null;
    return boms.find(b => b._id === (selectedRun.bomId?._id || selectedRun.bomId));
  }, [selectedRun, boms]);

  return (
    <div className="space-y-4 font-sans text-slate-900 bg-slate-50 min-h-screen p-2">
      {/* ENTERPRISE COMMAND TOPBAR */}
      <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-orange-600 text-white rounded-md flex items-center gap-1">
                <Cpu className="h-3.5 w-3.5" /> Material Requirements Planning (MRP Engine)
              </span>
              <span className="text-xs text-slate-500 font-medium">● Deterministic Netting & BOM Explosion</span>
            </div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              MRP Command Center & Production Netting Workbench
            </h1>
            <p className="text-xs text-slate-500 font-normal">
              Execute multi-level BOM component explosion, inventory netting, and automated procurement requisition generation.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsRunModalOpen(true)}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-extrabold text-xs rounded-lg shadow-2xs transition-colors flex items-center gap-1.5"
            >
              <Play className="h-4 w-4" />
              <span>Execute New MRP Calculation</span>
            </button>

            {selectedRun && metrics.shortagesCount > 0 && (
              <button
                onClick={handleBulkConvertRun}
                disabled={converting}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-lg shadow-2xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                <Zap className={`h-4 w-4 ${converting ? 'animate-spin' : ''}`} />
                <span>{converting ? 'Converting...' : `Bulk Convert All Shortages (${metrics.shortagesCount})`}</span>
              </button>
            )}

            <button
              onClick={fetchData}
              className="p-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs rounded-lg shadow-2xs transition-colors"
              title="Refresh Data"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* FEEDBACK TOASTS */}
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-bold flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-600" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError('')} className="underline font-bold">Dismiss</button>
          </div>
        )}

        {success && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs font-bold flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>{success}</span>
            </div>
            <button onClick={() => setSuccess('')} className="underline font-bold">Dismiss</button>
          </div>
        )}
      </section>

      {/* EXECUTIVE SUMMARY KPI TILES */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-extrabold uppercase tracking-wider">Scheduled Target</span>
            <Factory className="h-4 w-4 text-blue-600" />
          </div>
          <p className="text-2xl font-extrabold text-slate-900">{selectedRun ? `${selectedRun.targetQty} Units` : '-'}</p>
          <p className="text-[11px] text-slate-500 font-medium">{selectedRun?.productId?.name || 'No Run Selected'}</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-extrabold uppercase tracking-wider">Gross Demand</span>
            <Boxes className="h-4 w-4 text-indigo-600" />
          </div>
          <p className="text-2xl font-extrabold text-slate-900">{metrics.totalGrossQty}</p>
          <p className="text-[11px] text-slate-500 font-medium">Component Units Required</p>
        </div>

        <div className={`rounded-xl border p-4 shadow-2xs space-y-1 ${metrics.shortagesCount > 0 ? 'bg-rose-50/50 border-rose-200' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-extrabold uppercase tracking-wider">Critical Shortages</span>
            <AlertTriangle className={`h-4 w-4 ${metrics.shortagesCount > 0 ? 'text-rose-600' : 'text-slate-400'}`} />
          </div>
          <p className={`text-2xl font-extrabold ${metrics.shortagesCount > 0 ? 'text-rose-600' : 'text-slate-900'}`}>{metrics.shortagesCount}</p>
          <p className="text-[11px] text-slate-500 font-medium">{metrics.shortagesCount > 0 ? 'Shortage Procurement Required' : 'All Components Stocked'}</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-extrabold uppercase tracking-wider">Converted Orders</span>
            <CheckSquare className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-extrabold text-slate-900">{metrics.convertedCount}</p>
          <p className="text-[11px] text-slate-500 font-medium">PRs & Work Orders Created</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-extrabold uppercase tracking-wider">Readiness Index</span>
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-extrabold text-emerald-600">{metrics.readinessIndex}%</p>
          <p className="text-[11px] text-slate-500 font-medium">BOM Fulfillment Rate</p>
        </div>
      </div>

      {/* MAIN WORKBENCH GRID */}
      <div className="grid gap-5 xl:grid-cols-[300px_1fr]">
        {/* LEFT COLUMN: RUN HISTORY SELECTOR */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">Recent MRP Executions</h3>
            <span className="text-[10px] font-mono text-slate-400">Total ({runs.length})</span>
          </div>

          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {runs.length === 0 ? (
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
                        ? 'border-orange-500 bg-orange-50/30 shadow-2xs'
                        : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-mono font-extrabold text-blue-600 text-[11px]">{r.runNumber}</span>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                        r.summary?.hasShortage ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {r.summary?.hasShortage ? 'Shortage' : 'Balanced'}
                      </span>
                    </div>

                    <p className="font-extrabold text-slate-900 text-xs">{r.productId?.name || 'Assembly Product'}</p>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium pt-1 border-t border-slate-200/60">
                      <span>Target Qty: <strong>{r.targetQty}</strong></span>
                      <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* RIGHT COLUMN: INDUSTRIAL WORKBENCH TABS */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-2xs space-y-3">
          {/* TAB HEADERS */}
          <div className="flex border-b border-slate-200 px-4 pt-2">
            {[
              ['netting', 'BOM Netting & Shortages', Cpu],
              ['bomTree', 'Multi-Level BOM Visualizer', Layers],
              ['mps', 'Time-Phased MPS Buckets', Calendar],
              ['history', 'Execution Audit & AI Commentary', Sparkles]
            ].map(([id, label, Icon]) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`px-4 py-2 font-bold text-xs transition-all border-b-2 -mb-px flex items-center gap-1.5 ${
                  activeTab === id
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {/* TAB 1: BOM NETTING & SHORTAGE ANALYSIS */}
          {activeTab === 'netting' && (
            <div className="p-4 space-y-4">
              {selectedRun ? (
                <>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-extrabold text-slate-900 text-sm">
                          {selectedRun.runNumber} — {selectedRun.productId?.name} ({selectedRun.productId?.code})
                        </h4>
                        {metrics.shortagesCount > 0 ? (
                          <span className="px-2.5 py-0.5 bg-rose-600 text-white rounded text-[10px] font-extrabold uppercase animate-pulse flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" /> SHORTAGE: PRODUCTION BLOCKED
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 bg-emerald-600 text-white rounded text-[10px] font-extrabold uppercase flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> MATERIALS READY & RESERVED
                          </span>
                        )}
                      </div>
                      <p className="text-slate-500 font-normal">
                        Warehouse: <strong>{selectedRun.warehouseId?.name || 'Central Warehouse'}</strong> • Target Output: <strong>{selectedRun.targetQty} units</strong>
                      </p>
                    </div>

                    {/* STRICT BUTTON LOGIC (SECTIONS 7 & 8) */}
                    <div className="flex items-center gap-2">
                      <button
                        disabled={metrics.shortagesCount === 0}
                        onClick={handleBulkConvertRun}
                        className={`px-3 py-2 text-xs font-extrabold rounded-lg transition-colors flex items-center gap-1.5 ${
                          metrics.shortagesCount === 0
                            ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                            : 'bg-orange-600 hover:bg-orange-700 text-white shadow-2xs'
                        }`}
                        title={metrics.shortagesCount === 0 ? 'DISABLED: Inventory is sufficient. No PR required.' : 'REQUIRED: Create Purchase Requests for material shortages.'}
                      >
                        <ShoppingCart className="h-4 w-4" />
                        <span>Create Purchase Request</span>
                      </button>

                      <button
                        disabled={metrics.shortagesCount > 0}
                        onClick={async () => {
                          setError('');
                          setSuccess('');
                          try {
                            const res = await api.post('/production/create', {
                              mrpRunId: selectedRun._id,
                              productId: selectedRun.productId?._id || selectedRun.productId,
                              warehouseId: selectedRun.warehouseId?._id || selectedRun.warehouseId,
                              qty: selectedRun.targetQty,
                              mrpData: { hasShortage: false, materials: requirements }
                            });
                            if (res.data.success) {
                              setSuccess(`Production Plan created and inventory reserved! Plan: ${res.data.data.planNumber}`);
                            }
                          } catch (err) {
                            setError(err.response?.data?.error || err.message);
                          }
                        }}
                        className={`px-3 py-2 text-xs font-extrabold rounded-lg transition-colors flex items-center gap-1.5 ${
                          metrics.shortagesCount > 0
                            ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs'
                        }`}
                        title={metrics.shortagesCount > 0 ? 'BLOCKED: Material Shortage Exists. Procure materials first.' : 'ALLOWED: All materials reserved and ready for production.'}
                      >
                        <Factory className="h-4 w-4" />
                        <span>Create Production Plan</span>
                      </button>
                    </div>
                  </div>

                  {/* AI EXECUTIVE SUMMARY BOX */}
                  {selectedRun.summary?.aiExplanation && (
                    <div className="p-3.5 bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-100 rounded-xl flex items-start gap-3 text-xs">
                      <Sparkles className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-extrabold text-indigo-950">AI Executive Rationale</p>
                        <p className="text-slate-700 leading-relaxed mt-0.5">{selectedRun.summary.aiExplanation}</p>
                      </div>
                    </div>
                  )}

                  {/* REQUIREMENTS TABLE */}
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                        <tr>
                          <th className="p-3">Component Material</th>
                          <th className="p-3 text-right">Gross Requirement</th>
                          <th className="p-3 text-right">On-Hand Stock</th>
                          <th className="p-3 text-right">On-Order (PO)</th>
                          <th className="p-3 text-right">Net Shortage</th>
                          <th className="p-3 text-center">Lead Time</th>
                          <th className="p-3 text-center">Recommendation</th>
                          <th className="p-3 text-center">Automated Action</th>
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
                            <td className="p-3 text-center font-mono text-[11px]">
                              {req.suggestedLeadTimeDays || 7} days
                            </td>
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
                                  className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 font-extrabold text-[10px] rounded-lg shadow-2xs flex items-center justify-center gap-1 mx-auto"
                                >
                                  {req.action === 'Produce' ? <PackageCheck className="h-3 w-3 text-indigo-600" /> : <ShoppingCart className="h-3 w-3 text-orange-600" />}
                                  <span>Convert to {req.action === 'Produce' ? 'Work Order' : 'PR'}</span>
                                </button>
                              ) : (
                                <span className="text-[10px] font-extrabold text-emerald-600">Ready for Assembly</span>
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
                  Select an MRP run from the left panel or click "+ Execute New MRP Calculation" above to view requirement netting.
                </div>
              )}
            </div>
          )}

          {/* TAB 2: MULTI-LEVEL BOM VISUALIZER */}
          {activeTab === 'bomTree' && (
            <div className="p-4 space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs flex justify-between items-center">
                <div>
                  <h4 className="font-extrabold text-slate-900">BOM Explosion Structural Tree</h4>
                  <p className="text-slate-500 font-normal">Component assembly breakdown for {selectedRun?.productId?.name || 'Selected Assembly'}</p>
                </div>
                <span className="px-2.5 py-1 bg-blue-100 text-blue-800 rounded font-mono font-bold">
                  BOM Version: {selectedRun?.bomVersion || 1}
                </span>
              </div>

              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/30 space-y-3 font-mono text-xs">
                {/* Parent Node */}
                <div className="p-3 bg-slate-900 text-white rounded-xl flex items-center justify-between shadow-xs font-sans">
                  <div className="flex items-center gap-2">
                    <Boxes className="h-5 w-5 text-orange-400" />
                    <div>
                      <h5 className="font-extrabold text-sm">{selectedRun?.productId?.name || 'Finished Good'}</h5>
                      <span className="text-[10px] font-mono text-slate-400">Code: {selectedRun?.productId?.code || 'FG-MAIN'}</span>
                    </div>
                  </div>
                  <span className="px-3 py-1 bg-orange-500/20 text-orange-400 rounded-md text-xs font-bold">
                    Target Output: {selectedRun?.targetQty || 0} Units
                  </span>
                </div>

                {/* Component Breakdown Tree */}
                <div className="pl-6 border-l-2 border-slate-300 space-y-2 pt-2">
                  {requirements.map((comp, idx) => (
                    <div key={comp._id || idx} className="p-3 bg-white border border-slate-200 rounded-xl space-y-1 shadow-2xs font-sans">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 font-mono text-xs">└──</span>
                          <span className="font-extrabold text-slate-900">{comp.materialName}</span>
                          <span className="text-[10px] font-mono text-slate-400">({comp.materialCode})</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                          comp.shortageQty === 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {comp.shortageQty === 0 ? 'Sufficient Stock' : `Shortage: ${comp.shortageQty} ${comp.unit}`}
                        </span>
                      </div>

                      <div className="grid grid-cols-4 gap-2 text-[11px] text-slate-500 font-medium pl-6 pt-1">
                        <div>Gross Demand: <strong className="text-slate-900">{comp.requiredQty} {comp.unit}</strong></div>
                        <div>Available: <strong className="text-emerald-600">{comp.availableQty} {comp.unit}</strong></div>
                        <div>On-Order: <strong className="text-blue-600">{comp.onOrderQty || 0} {comp.unit}</strong></div>
                        <div>Lead Time: <strong className="text-slate-700">{comp.suggestedLeadTimeDays || 7} Days</strong></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: TIME-PHASED MPS BUCKETS */}
          {activeTab === 'mps' && (
            <div className="p-4 space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs flex justify-between items-center">
                <div>
                  <h4 className="font-extrabold text-slate-900">Time-Phased Master Production Schedule (MPS)</h4>
                  <p className="text-slate-500 font-normal">Weekly material demand & lead-time bucket forecast</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-extrabold text-xs text-slate-800">Week 1 (Immediate)</span>
                    <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded text-[10px] font-bold">Critical</span>
                  </div>
                  <p className="text-xl font-extrabold text-slate-900">{metrics.shortagesCount} Materials Short</p>
                  <p className="text-xs text-slate-500">Require immediate Purchase Requisition release.</p>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-extrabold text-xs text-slate-800">Week 2 - 3 (In-Transit)</span>
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-[10px] font-bold">Planned</span>
                  </div>
                  <p className="text-xl font-extrabold text-slate-900">{requirements.filter(r => r.onOrderQty > 0).length} Orders In-Transit</p>
                  <p className="text-xs text-slate-500">Open Purchase Orders scheduled for dock arrival.</p>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-extrabold text-xs text-slate-800">Month 1 (Lookahead)</span>
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px] font-bold">Forecast</span>
                  </div>
                  <p className="text-xl font-extrabold text-slate-900">{metrics.readinessIndex}% Ready</p>
                  <p className="text-xs text-slate-500">Overall assembly production schedule stability.</p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: AUDIT HISTORY & AI COMMENTARY */}
          {activeTab === 'history' && (
            <div className="p-4 space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                <h4 className="font-extrabold text-slate-900">MRP Execution Log & Audit Trail</h4>
                <p className="text-slate-500 font-normal">Complete history of all executed calculation runs and AI executive notes.</p>
              </div>

              <div className="space-y-3">
                {runs.map((r) => (
                  <div key={r._id} className="p-4 bg-white border border-slate-200 rounded-xl space-y-2 shadow-2xs">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-extrabold text-blue-600 text-xs">{r.runNumber}</span>
                        <span className="font-extrabold text-slate-900 text-xs">{r.productId?.name}</span>
                      </div>
                      <span className="text-xs text-slate-400 font-mono">{new Date(r.createdAt).toLocaleString()}</span>
                    </div>

                    {r.summary?.aiExplanation && (
                      <p className="text-xs text-slate-600 bg-indigo-50/50 p-2.5 rounded-lg border border-indigo-100 font-medium">
                        🤖 AI Executive Rationale: {r.summary.aiExplanation}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Modal: EXECUTE MRP RUN CALCULATOR */}
      {isRunModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl space-y-3 border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-sm font-extrabold text-slate-950 flex items-center gap-1.5">
                <Cpu className="h-4 w-4 text-orange-600" /> Execute New MRP Calculation
              </h3>
              <button onClick={() => setIsRunModalOpen(false)} className="rounded-md px-2 py-0.5 text-xs font-bold text-slate-400 hover:bg-slate-100 hover:text-slate-700">✕</button>
            </div>

            <form onSubmit={handleExecuteMRP} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Target Assembly / Finished Good *</label>
                <select
                  required
                  value={runForm.productId}
                  onChange={(e) => setRunForm({ ...runForm, productId: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs font-medium bg-white"
                >
                  <option value="">Select Finished Product</option>
                  {materials.map((m) => (
                    <option key={m._id} value={m._id}>{m.name} ({m.code}) — {m.type}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Target Warehouse Context *</label>
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
                  <label className="block font-bold text-slate-700 mb-1">Target Output Qty *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={runForm.targetQty}
                    onChange={(e) => setRunForm({ ...runForm, targetQty: parseFloat(e.target.value) })}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs font-medium"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Required Delivery Date *</label>
                  <input
                    type="date"
                    required
                    value={runForm.requiredDate}
                    onChange={(e) => setRunForm({ ...runForm, requiredDate: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs font-medium"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setIsRunModalOpen(false)} className="rounded-lg border border-slate-300 px-3 py-1.5 font-bold text-slate-600">Cancel</button>
                <button type="submit" disabled={executing} className="rounded-lg bg-orange-600 hover:bg-orange-700 px-4 py-1.5 font-bold text-white shadow-2xs transition-colors flex items-center gap-1">
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
