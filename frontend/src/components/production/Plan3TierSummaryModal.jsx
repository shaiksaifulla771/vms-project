import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import {
  X,
  Layers,
  Calendar,
  Play,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Building2,
  FileSpreadsheet,
  Package,
  TrendingDown,
  TrendingUp,
  Download,
  ShieldAlert
} from 'lucide-react';
import * as XLSX from 'xlsx';
import BatchExecutionModal from './BatchExecutionModal';

export default function Plan3TierSummaryModal({
  isOpen,
  onClose,
  planId,
  onPlanUpdated
}) {
  const [summaryData, setSummaryData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  // Trigger Sheet 1 Batch Execution from Tier 2
  const [selectedBatchForExec, setSelectedBatchForExec] = useState(null);
  const [isBatchExecModalOpen, setIsBatchExecModalOpen] = useState(false);

  useEffect(() => {
    if (!isOpen || !planId) return;

    const fetchSummary = async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await api.get(`/api/production-plans/${planId}/summary`);
        if (res.data?.success) {
          setSummaryData(res.data.data);
        } else {
          setErrorMsg('Failed to load plan summary data');
        }
      } catch (err) {
        console.error('Failed to load 3-tier summary:', err);
        setErrorMsg(err.response?.data?.error || err.message || 'Error fetching 3-tier summary');
      } finally {
        setLoading(false);
      }
    };

    fetchSummary();
  }, [isOpen, planId]);

  if (!isOpen) return null;

  const planSum = summaryData?.planSummary?.[0] || null;
  const batchSum = summaryData?.batchSummary || [];
  const matSum = summaryData?.materialSummary || [];

  // Export Sheet 3 to Excel
  const exportToExcel = () => {
    if (!summaryData) return;
    const wb = XLSX.utils.book_new();

    // 1. Plan Summary Sheet
    const ws1 = XLSX.utils.json_to_sheet(summaryData.planSummary || []);
    XLSX.utils.book_append_sheet(wb, ws1, 'Plan_Summary');

    // 2. Batch Summary Sheet
    const ws2 = XLSX.utils.json_to_sheet(batchSum.map(b => ({
      'Batch Index': b.batchIndex,
      'Batch No': b.batchNo,
      'Product': b.product,
      'Mfg Date': b.mfgDate ? new Date(b.mfgDate).toLocaleDateString() : '',
      'Expiry Date': b.expDate ? new Date(b.expDate).toLocaleDateString() : '',
      'Batch Qty': b.qty,
      'Status': b.status
    })));
    XLSX.utils.book_append_sheet(wb, ws2, 'Batch_Summary');

    // 3. Material Summary Sheet
    const ws3 = XLSX.utils.json_to_sheet(matSum.map(m => ({
      'Material': m.material,
      'Code': m.materialCode,
      'MPN': m.mpn,
      'Vendor': m.vendor,
      'Qty Required': m.qtyReq,
      'Qty Available': m.qtyAvail,
      'Net Difference': m.diff,
      'Status': m.status,
      'UOM': m.uom
    })));
    XLSX.utils.book_append_sheet(wb, ws3, 'Material_Summary');

    XLSX.writeFile(wb, `Plan_3Tier_Summary_${summaryData.planId || 'Plan'}.xlsx`);
  };

  const handleOpenBatchExecution = (batch) => {
    setSelectedBatchForExec(batch);
    setIsBatchExecModalOpen(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 backdrop-blur-xs p-3 overflow-y-auto animate-fadeIn">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-5xl w-full max-h-[94vh] flex flex-col overflow-hidden">
        
        {/* HEADER */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-xs">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-black text-slate-900 tracking-tight">
                  Production Planning 3-Tier Summary (Blueprint Sheet 3)
                </h3>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 uppercase tracking-wider">
                  Plan #{summaryData?.planId || '...'} &bull; {summaryData?.location || 'All Sites'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">
                Integrated multi-tier rollout: Plan Target &rarr; Discrete Batch Schedule &rarr; Raw Material Netting (Short/Long).
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={exportToExcel}
              disabled={loading || !summaryData}
              className="px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-lg flex items-center space-x-1 transition-colors"
              title="Export Sheet 3"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Export</span>
            </button>

            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* BODY */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs">
          {loading && (
            <div className="p-12 text-center text-slate-400 font-semibold flex flex-col items-center justify-center space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
              <span>Calculating 3-tier MRP requirements and inventory netting...</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-800 flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {!loading && summaryData && (
            <>
              {/* TIER 1: PLAN SUMMARY (Sheet 3 Top Table) */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <div className="bg-slate-100/90 px-3.5 py-2 flex items-center justify-between border-b border-slate-200">
                  <h4 className="font-black text-slate-800 uppercase tracking-tight flex items-center space-x-1.5">
                    <Package className="w-3.5 h-3.5 text-blue-600" />
                    <span>Tier 1: Master Plan Summary</span>
                  </h4>
                  <span className="text-[10px] font-bold text-slate-500">Plan Target Rollup</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px] border-collapse">
                    <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-2.5">Product Name</th>
                        <th className="p-2.5">Product Code</th>
                        <th className="p-2.5 text-center">No. of Batches</th>
                        <th className="p-2.5 text-right">Target Output Qty</th>
                        <th className="p-2.5 text-center text-emerald-700">Executed Qty</th>
                        <th className="p-2.5 text-center text-amber-700">Remaining Qty</th>
                        <th className="p-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {planSum ? (
                        <tr className="hover:bg-blue-50/30">
                          <td className="p-2.5 font-bold text-slate-900">{planSum.product}</td>
                          <td className="p-2.5 font-mono text-slate-600">{planSum.productCode || '-'}</td>
                          <td className="p-2.5 text-center font-bold text-blue-600">
                            <span className="px-2 py-0.5 bg-blue-50 border border-blue-200 rounded-full font-mono">
                              {planSum.noOfBatches}
                            </span>
                          </td>
                          <td className="p-2.5 text-right font-mono font-black text-slate-900">
                            {(planSum.targetOutputQty ?? 0).toLocaleString()} {planSum.uom}
                          </td>
                          <td className="p-2.5 text-center font-bold text-emerald-700 font-mono">
                            {(planSum.executedQty ?? 0).toLocaleString()} {planSum.uom}
                            <span className="block text-[10px] text-slate-400 font-normal">{planSum.noOfExecuted} batch(es)</span>
                          </td>
                          <td className="p-2.5 text-center font-bold text-amber-700 font-mono">
                            {(planSum.remainingQty ?? 0).toLocaleString()} {planSum.uom}
                            <span className="block text-[10px] text-slate-400 font-normal">{planSum.noToBeExecuted} batch(es)</span>
                          </td>
                          <td className="p-2.5">
                            <span className="px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 text-[10px] font-bold border border-teal-200">
                              {planSum.status}
                            </span>
                          </td>
                        </tr>
                      ) : (
                        <tr><td colSpan={7} className="p-4 text-center text-slate-400">No plan record</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* TIER 2: BATCH SUMMARY (Sheet 3 Middle Table) */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <div className="bg-slate-100/90 px-3.5 py-2 flex items-center justify-between border-b border-slate-200">
                  <h4 className="font-black text-slate-800 uppercase tracking-tight flex items-center space-x-1.5">
                    <Calendar className="w-3.5 h-3.5 text-blue-600" />
                    <span>Tier 2: Discrete Batch Schedule &amp; Execution</span>
                  </h4>
                  <span className="text-[10px] font-bold text-slate-500">{batchSum.length} Discrete Batches</span>
                </div>

                <div className="overflow-x-auto max-h-52">
                  <table className="w-full text-left text-[11px] border-collapse">
                    <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 sticky top-0">
                      <tr>
                        <th className="p-2 text-center w-12">Batch #</th>
                        <th className="p-2 font-mono">Batch Number</th>
                        <th className="p-2">Product</th>
                        <th className="p-2">Mfg Date</th>
                        <th className="p-2">Expiry Date</th>
                        <th className="p-2 text-right">Batch Qty</th>
                        <th className="p-2">Execution Status</th>
                        <th className="p-2 text-right">Floor Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {batchSum.map((b) => (
                        <tr key={b.batchIndex} className="hover:bg-blue-50/30">
                          <td className="p-2 text-center font-bold text-slate-500">{b.batchIndex}</td>
                          <td className="p-2 font-mono font-bold text-slate-900">{b.batchNo}</td>
                          <td className="p-2 text-slate-700">{b.product}</td>
                          <td className="p-2 text-slate-500 font-mono">
                            {b.mfgDate ? new Date(b.mfgDate).toLocaleDateString() : 'TBD'}
                          </td>
                          <td className="p-2 text-slate-500 font-mono">
                            {b.expDate ? new Date(b.expDate).toLocaleDateString() : 'TBD'}
                          </td>
                          <td className="p-2 text-right font-mono font-bold text-slate-900">
                            {b.qty.toLocaleString()}
                          </td>
                          <td className="p-2">
                            <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                              b.isExecuted 
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                                : 'bg-blue-50 text-blue-800 border-blue-200'
                            }`}>
                              {b.isExecuted ? '✓ Executed' : 'Scheduled'}
                            </span>
                          </td>
                          <td className="p-2 text-right">
                            <button
                              onClick={() => handleOpenBatchExecution(b)}
                              className="px-2 py-0.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px] rounded flex items-center space-x-1 ml-auto shadow-2xs transition-colors"
                              title="Execute this discrete batch (Sheet 1)"
                            >
                              <Play className="w-2.5 h-2.5 fill-current" />
                              <span>{b.isExecuted ? 'Adjust IP/OP' : 'Execute'}</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* TIER 3: MATERIAL SUMMARY (Sheet 3 Bottom Table) */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <div className="bg-slate-100/90 px-3.5 py-2 flex items-center justify-between border-b border-slate-200">
                  <h4 className="font-black text-slate-800 uppercase tracking-tight flex items-center space-x-1.5">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
                    <span>Tier 3: Raw Material Requirements vs Available Stock (Short/Long)</span>
                  </h4>
                  <span className="text-[10px] font-bold text-slate-500">{matSum.length} BOM Components</span>
                </div>

                <div className="overflow-x-auto max-h-60">
                  <table className="w-full text-left text-[11px] border-collapse">
                    <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 sticky top-0">
                      <tr>
                        <th className="p-2">Material</th>
                        <th className="p-2 font-mono">Material Code</th>
                        <th className="p-2 font-mono">MPN</th>
                        <th className="p-2">Primary Vendor</th>
                        <th className="p-2 text-right">Qty Required</th>
                        <th className="p-2 text-right">Qty Available</th>
                        <th className="p-2 text-right">Net Difference</th>
                        <th className="p-2 text-center">Netting Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {matSum.map((m, idx) => {
                        const isShort = m.diff < 0;
                        return (
                          <tr key={idx} className={`hover:bg-slate-50 ${isShort ? 'bg-rose-50/20' : ''}`}>
                            <td className="p-2 font-bold text-slate-900">{m.material}</td>
                            <td className="p-2 font-mono text-slate-500 text-[10px]">{m.materialCode}</td>
                            <td className="p-2 font-mono font-bold text-blue-700 text-[10px]">{m.mpn}</td>
                            <td className="p-2 text-slate-600">{m.vendor}</td>
                            <td className="p-2 text-right font-mono font-semibold text-slate-800">
                              {m.qtyReq.toLocaleString()} {m.uom}
                            </td>
                            <td className="p-2 text-right font-mono font-semibold text-slate-800">
                              {m.qtyAvail.toLocaleString()} {m.uom}
                            </td>
                            <td className={`p-2 text-right font-mono font-black ${
                              isShort ? 'text-rose-600' : 'text-emerald-700'
                            }`}>
                              {m.diff > 0 ? `+${m.diff.toLocaleString()}` : m.diff.toLocaleString()} {m.uom}
                            </td>
                            <td className="p-2 text-center">
                              <span className={`px-2 py-0.5 text-[10px] font-black rounded-full border ${
                                isShort 
                                  ? 'bg-rose-100 text-rose-800 border-rose-300' 
                                  : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              }`}>
                                {isShort ? 'Short' : 'Long'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                      {matSum.length === 0 && (
                        <tr>
                          <td colSpan={8} className="p-6 text-center text-slate-400">
                            No BOM recipe ingredients found for this plan.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        {/* FOOTER */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="text-[10px] text-slate-400 font-semibold">
            Blueprint Sheet 3 &bull; 3-Tier Production Summary &amp; Floor Execution Trigger
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-colors"
          >
            Close
          </button>
        </div>

      </div>

      {/* BATCH EXECUTION MODAL (SHEET 1) TRIGGERED FROM TIER 2 */}
      {selectedBatchForExec && (
        <BatchExecutionModal
          isOpen={isBatchExecModalOpen}
          onClose={() => setIsBatchExecModalOpen(false)}
          initialPlan={{
            _id: planId,
            planNumber: summaryData?.planId,
            quantity: planSum?.targetOutputQty,
            bomId: summaryData?.planSummary?.[0]?.bomId,
            siteId: summaryData?.siteId,
            warehouseId: summaryData?.warehouseId,
          }}
          initialBatch={selectedBatchForExec}
          onExecutionComplete={() => {
            setIsBatchExecModalOpen(false);
            if (onPlanUpdated) onPlanUpdated();
            // Re-fetch summary
            api.get(`/api/production-plans/${planId}/summary`).then(res => {
              if (res.data?.success) setSummaryData(res.data.data);
            });
          }}
        />
      )}
    </div>
  );
}

