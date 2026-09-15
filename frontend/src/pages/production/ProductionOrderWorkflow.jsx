import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle2, PlayCircle, Settings, ClipboardList,
  AlertTriangle, Info, LogOut, Cpu, Boxes, Check, ArrowRight
} from 'lucide-react';
import api from '../../services/api';

const STEPS = [
  'Draft',
  'Pending Approval',
  'Approved',
  'Material Allocated',
  'In Production',
  'Quality Check',
  'Completed',
  'Closed'
];

export default function ProductionOrderWorkflow() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);

  // Form states for QC
  const [actualQuantity, setActualQuantity] = useState('');
  const [scrapQuantity, setScrapQuantity] = useState(0);
  const [wasteQuantity, setWasteQuantity] = useState(0);
  const [qcNotes, setQcNotes] = useState('');
  const [componentsActuals, setComponentsActuals] = useState([]);

  useEffect(() => {
    fetchOrder();
  }, [id]);

  const fetchOrder = async () => {
    try {
      const res = await api.get(`/productions/${id}`);
      const data = res.data.data;
      setOrder(data);
      const statusUpper = (data.status || '').toUpperCase();
      if (['IN PRODUCTION', 'IN PROGRESS', 'IN_PROGRESS'].includes(statusUpper)) {
        setActualQuantity(data.targetQuantity || data.plannedQuantity);
        setComponentsActuals((data.components || []).map(c => ({
          materialId: c.materialId?._id || c.materialId,
          mpnId: c.mpnId?._id || c.mpnId,
          actualQuantity: c.expectedQuantity,
          scrapQuantity: 0
        })));
      }
    } catch (err) {
      console.error(err);
      setError('Failed to load order');
    } finally {
      setLoading(false);
    }
  };

  const handleTransition = async (actionPath, payload = {}) => {
    setActionLoading(true);
    setError(null);
    try {
      await api.post(`/productions/${id}/${actionPath}`, payload);
      await fetchOrder();
    } catch (err) {
      setError(err.response?.data?.error || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleTransitionPatch = async (actionPath, payload = {}) => {
    setActionLoading(true);
    setError(null);
    try {
      await api.patch(`/productions/${id}/${actionPath}`, payload);
      await fetchOrder();
    } catch (err) {
      setError(err.response?.data?.error || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500 font-medium">Loading production workflow...</div>;
  if (!order) return <div className="p-8 text-center text-red-500 font-bold">Production order not found</div>;

  const getStepIndex = (status) => {
    const s = (status || '').toUpperCase();
    if (s === 'DRAFT') return 0;
    if (s === 'PENDING APPROVAL' || s === 'SUBMITTED') return 1;
    if (s === 'APPROVED') return 2;
    if (s === 'MATERIAL ALLOCATED') return 3;
    if (s === 'IN PRODUCTION' || s === 'IN PROGRESS' || s === 'IN_PROGRESS') return 4;
    if (s === 'QUALITY CHECK' || s === 'QC') return 5;
    if (s === 'COMPLETED') return 6;
    if (s === 'CLOSED') return 7;
    return 0;
  };

  const currentStepIndex = getStepIndex(order.status);
  const statusUpper = (order.status || '').toUpperCase();
  const isInProduction = ['IN PRODUCTION', 'IN PROGRESS', 'IN_PROGRESS'].includes(statusUpper);
  const isQC = ['QUALITY CHECK', 'QC'].includes(statusUpper);

  return (
    <div className="max-w-6xl mx-auto space-y-6 font-sans text-slate-900 p-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-4">
          <Link to="/production" className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">{order.prdNumber || order.orderNumber}</h1>
              {order.sourcePlanNumber && (
                <Link
                  to={`/mrp`}
                  className="px-2.5 py-0.5 bg-amber-50 border border-amber-200 rounded-lg text-xs font-bold text-amber-800 hover:bg-amber-100 flex items-center gap-1"
                  title="Source MRP Plan"
                >
                  <Cpu className="w-3.5 h-3.5 text-amber-600" />
                  MRP: {order.sourcePlanNumber}
                </Link>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Product: <span className="font-bold text-slate-700">{order.productId?.name || 'Finished Product'}</span> ({order.productId?.code}) | Batch: {order.batchNumber || 'BATCH-AUTO'}
            </p>
          </div>
        </div>

        <div>
          <span className="px-3.5 py-1.5 bg-slate-900 text-white rounded-xl text-xs font-bold shadow-sm">
            Status: {order.status}
          </span>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-xl flex items-center border border-red-200 shadow-sm text-xs font-bold">
          <AlertTriangle className="w-5 h-5 mr-3 flex-shrink-0 text-red-600" />
          {error}
        </div>
      )}

      {/* Workflow Stepper */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center justify-between relative">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-slate-100 z-0 rounded-full"></div>
          {STEPS.map((step, idx) => {
            const isCompleted = idx <= currentStepIndex;
            const isCurrent = idx === currentStepIndex;
            return (
              <div key={step} className="relative z-10 flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-all duration-300 shadow-sm
                  ${isCurrent ? 'bg-blue-600 text-white ring-4 ring-blue-100 scale-110' : 
                    isCompleted ? 'bg-emerald-500 text-white' : 'bg-white text-slate-400 border-2 border-slate-200'}`}
                >
                  {isCompleted && !isCurrent ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                </div>
                <span className={`mt-2 text-[11px] font-bold whitespace-nowrap ${isCurrent ? 'text-blue-700' : isCompleted ? 'text-emerald-700' : 'text-slate-400'}`}>
                  {step}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Details & Components */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Settings className="w-4 h-4 text-slate-500" />
              Production Order Parameters
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl">
                <p className="text-slate-400 font-bold uppercase text-[10px]">Target Quantity</p>
                <p className="font-black text-slate-900 text-base mt-0.5">{order.targetQuantity || order.plannedQuantity} pcs</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <p className="text-slate-400 font-bold uppercase text-[10px]">Actual Produced</p>
                <p className="font-black text-blue-700 text-base mt-0.5">{order.actualQuantity !== undefined ? `${order.actualQuantity} pcs` : '-'}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <p className="text-slate-400 font-bold uppercase text-[10px]">Scrap Quantity</p>
                <p className="font-black text-rose-600 text-base mt-0.5">{order.scrapQuantity || 0} pcs</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <p className="text-slate-400 font-bold uppercase text-[10px]">Yield Percentage</p>
                <p className="font-black text-emerald-600 text-base mt-0.5">{order.yieldPercent ? `${order.yieldPercent.toFixed(1)}%` : '-'}</p>
              </div>
            </div>

            <div className="mt-6">
              <h4 className="text-xs font-bold text-slate-800 mb-3 border-b pb-2 uppercase tracking-wider">
                BOM Component Issue & Consumption Tracking
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-slate-50 text-slate-500 font-bold">
                    <tr>
                      <th className="py-2.5 px-3">Component Material</th>
                      <th className="py-2.5 px-3 text-right">Expected Qty</th>
                      <th className="py-2.5 px-3 text-right">Actual Consumed</th>
                      <th className="py-2.5 px-3 text-right">Variance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(order.components || []).map(comp => (
                      <tr key={comp._id}>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-800">{comp.materialId?.name || comp.mpnId?.mpnCode || 'Component'}</div>
                          <div className="text-[10px] text-slate-400">{comp.materialId?.code || comp.mpnId?.mpnCode}</div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold">{comp.expectedQuantity}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-blue-700">{comp.actualQuantity !== undefined ? comp.actualQuantity : (comp.consumedQuantity || '-')}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-700">
                          {comp.varianceQuantity !== undefined ? (
                            <span className={comp.varianceQuantity > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                              {comp.varianceQuantity > 0 ? `+${comp.varianceQuantity}` : comp.varianceQuantity}
                            </span>
                          ) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* QC Form when In Production */}
          {isInProduction && (
            <div className="bg-indigo-50/70 rounded-2xl shadow-sm border border-indigo-100 p-6 space-y-4">
              <h3 className="text-sm font-bold text-indigo-950 flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-indigo-600" />
                Log Shop Floor Actuals & Send to QC
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-indigo-900 mb-1">Actual FG Produced *</label>
                  <input 
                    type="number" 
                    className="w-full text-xs px-3 py-2 border border-indigo-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={actualQuantity}
                    onChange={(e) => setActualQuantity(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-indigo-900 mb-1">Scrap / Defect Quantity</label>
                  <input 
                    type="number" 
                    className="w-full text-xs px-3 py-2 border border-indigo-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={scrapQuantity}
                    onChange={(e) => setScrapQuantity(e.target.value)}
                  />
                </div>
              </div>

              <div className="border-t border-indigo-100 pt-3">
                <h4 className="text-xs font-bold text-indigo-900 mb-2">Component Actuals</h4>
                <div className="space-y-2">
                  {componentsActuals.map((ca, idx) => {
                    const compMeta = (order.components || []).find(c => (c.materialId?._id || c.materialId) === ca.materialId || (c.mpnId?._id || c.mpnId) === ca.mpnId);
                    return (
                      <div key={idx} className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-indigo-100 text-xs">
                        <span className="font-bold text-slate-800">
                          {compMeta?.materialId?.name || compMeta?.mpnId?.mpnCode || 'Component'} (Expected: {compMeta?.expectedQuantity})
                        </span>
                        <input 
                          type="number" 
                          className="w-28 px-2 py-1 border border-indigo-200 rounded-lg text-xs font-bold text-right"
                          value={ca.actualQuantity}
                          onChange={(e) => {
                            const updated = [...componentsActuals];
                            updated[idx].actualQuantity = e.target.value;
                            setComponentsActuals(updated);
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={() => handleTransition('qc', { actualQuantity: Number(actualQuantity), scrapQuantity: Number(scrapQuantity), componentsActuals })}
                disabled={actionLoading}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm flex items-center justify-center gap-2"
              >
                <ClipboardList className="w-4 h-4" />
                <span>Submit Actuals & Send to Quality Inspection</span>
              </button>
            </div>
          )}

          {/* QC Resolution when in Quality Check */}
          {isQC && (
            <div className="bg-emerald-50/70 rounded-2xl shadow-sm border border-emerald-100 p-6 space-y-4">
              <h3 className="text-sm font-bold text-emerald-950 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Quality Inspection Clearance
              </h3>
              <p className="text-xs text-emerald-800">
                Inspect produced batch ({order.actualQuantity || order.targetQuantity} units). Passing QC will complete the order and post inventory receipts.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => handleTransitionPatch('complete', { qcStatus: 'Passed', qcNotes: 'Passed QA inspection' })}
                  disabled={actionLoading}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>Pass QC & Complete Production</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Workflow Actions */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-800 border-b pb-2 uppercase tracking-wider">
              Workflow Stage Actions
            </h3>

            {/* DRAFT */}
            {statusUpper === 'DRAFT' && (
              <button
                onClick={() => handleTransition('submit')}
                disabled={actionLoading}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm flex items-center justify-center gap-2"
              >
                <PlayCircle className="w-4 h-4" /> Submit for Approval
              </button>
            )}

            {/* PENDING APPROVAL */}
            {statusUpper === 'PENDING APPROVAL' && (
              <button
                onClick={() => handleTransition('approve')}
                disabled={actionLoading}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" /> Approve Production Order
              </button>
            )}

            {/* APPROVED */}
            {statusUpper === 'APPROVED' && (
              <div className="space-y-2">
                <button
                  onClick={() => handleTransition('allocate')}
                  disabled={actionLoading}
                  className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-sm flex items-center justify-center gap-2"
                >
                  <Boxes className="w-4 h-4" /> Allocate Materials
                </button>
                <button
                  onClick={() => handleTransitionPatch('start')}
                  disabled={actionLoading}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm flex items-center justify-center gap-2"
                >
                  <PlayCircle className="w-4 h-4" /> Start Production Direct
                </button>
              </div>
            )}

            {/* MATERIAL ALLOCATED */}
            {statusUpper === 'MATERIAL ALLOCATED' && (
              <button
                onClick={() => handleTransitionPatch('start')}
                disabled={actionLoading}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm flex items-center justify-center gap-2"
              >
                <PlayCircle className="w-4 h-4" /> Start Production
              </button>
            )}

            {/* COMPLETED */}
            {statusUpper === 'COMPLETED' && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-1" />
                <p className="text-xs font-bold text-emerald-900">Production Order Completed</p>
                <p className="text-[11px] text-emerald-700 mt-1">
                  Finished goods posted to warehouse ledger. Consumed components deducted.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
