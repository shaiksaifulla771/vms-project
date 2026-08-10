import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Dialog } from '../components/ui/Dialog';
import { Cpu, Play, RefreshCw, AlertTriangle, CheckCircle2, ArrowRight, PackageCheck, ShoppingCart, Sparkles } from 'lucide-react';

const MRP = () => {
  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [requirements, setRequirements] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRunModalOpen, setIsRunModalOpen] = useState(false);

  const [runForm, setRunForm] = useState({
    productId: '',
    warehouseId: '',
    targetQty: 100,
    requiredDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0],
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [matsRes, whsRes, runsRes] = await Promise.all([
        api.get('/api/materials'),
        api.get('/api/inventory/warehouses'),
        api.get('/api/mrp/runs'),
      ]);

      if (matsRes.data.success) {
        setMaterials((matsRes.data.data || matsRes.data.materials || []).filter(m => m.type === 'Finished'));
      }
      if (whsRes.data.success) {
        setWarehouses(whsRes.data.data || []);
      }
      if (runsRes.data.success) {
        setRuns(runsRes.data.runs || []);
        if (runsRes.data.runs && runsRes.data.runs.length > 0) {
          inspectRun(runsRes.data.runs[0]._id);
        }
      }
    } catch (err) {
      console.error('Failed to load MRP data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const inspectRun = async (runId) => {
    try {
      const res = await api.get(`/api/mrp/runs/${runId}`);
      if (res.data.success) {
        setSelectedRun(res.data.mrpRun);
        setRequirements(res.data.requirements || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleExecuteMRP = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/api/mrp/run', runForm);
      if (res.data.success) {
        setIsRunModalOpen(false);
        fetchData();
      }
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    }
  };

  const handleConvertRequirement = async (reqId, actionType) => {
    try {
      const res = await api.post(`/api/mrp/requirements/${reqId}/convert`, { targetAction: actionType });
      if (res.data.success) {
        alert(`Successfully converted requirement to ${res.data.convertedType}!`);
        if (selectedRun) inspectRun(selectedRun._id);
      }
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Cpu className="w-6 h-6 text-blue-600" />
            Material Requirements Planning (MRP Engine)
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Deterministic BOM explosion, stock netting against available/reserved balances, and shortage recommendations.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="w-4 h-4 mr-1.5" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setIsRunModalOpen(true)}>
            <Play className="w-4 h-4 mr-1.5" /> Run MRP Calculation
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Recent MRP Runs */}
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-sm font-bold text-slate-900">Recent MRP Executions</CardTitle>
            <CardDescription className="text-xs text-slate-500">Select a run to inspect requirement netting</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {runs.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">No MRP runs recorded yet.</p>
            ) : (
              runs.map((r) => (
                <div
                  key={r._id}
                  onClick={() => inspectRun(r._id)}
                  className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                    selectedRun && selectedRun._id === r._id ? 'border-blue-500 bg-blue-50/40 shadow-xs' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex justify-between font-bold text-slate-800">
                    <span>{r.runNumber}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] ${r.summary?.hasShortage ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                      {r.summary?.hasShortage ? 'Shortages Found' : 'Balanced'}
                    </span>
                  </div>
                  <p className="text-slate-600 mt-1 font-medium">{r.productId?.name || 'Assembly Product'}</p>
                  <div className="flex justify-between text-[11px] text-slate-400 mt-2">
                    <span>Target: <strong>{r.targetQty} units</strong></span>
                    <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Right Column: Selected Run Requirements Table */}
        <div className="lg:col-span-2 space-y-6">
          {selectedRun ? (
            <Card className="border-slate-200">
              <CardHeader className="flex justify-between items-start">
                <div>
                  <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">{selectedRun.runNumber}</span>
                  <CardTitle className="text-base font-bold text-slate-900 mt-1">
                    {selectedRun.productId?.name} — Material Requirements
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    BOM Version {selectedRun.bomVersion || 1} • Target Output: {selectedRun.targetQty} units
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* AI Explanation Box if available */}
                {selectedRun.summary?.aiExplanation && (
                  <div className="p-3 bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-100 rounded-xl flex items-start gap-2.5">
                    <Sparkles className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-indigo-950">AI Executive Rationale</p>
                      <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{selectedRun.summary.aiExplanation}</p>
                    </div>
                  </div>
                )}

                {/* Requirements Table */}
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-3">Material</th>
                        <th className="p-3 text-right">Gross Req</th>
                        <th className="p-3 text-right">Available</th>
                        <th className="p-3 text-right">Shortage</th>
                        <th className="p-3">Status</th>
                        <th className="p-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {requirements.map((req) => (
                        <tr key={req._id} className="hover:bg-slate-50/50">
                          <td className="p-3 font-semibold text-slate-900">
                            {req.materialName}
                            <span className="block text-[10px] text-slate-400 font-normal">{req.materialCode}</span>
                          </td>
                          <td className="p-3 text-right font-medium">{req.requiredQty} {req.unit}</td>
                          <td className="p-3 text-right font-medium text-emerald-600">{req.availableQty} {req.unit}</td>
                          <td className={`p-3 text-right font-bold ${req.shortageQty > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                            {req.shortageQty} {req.unit}
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              req.shortageQty === 0
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}>
                              {req.shortageQty === 0 ? 'Sufficient' : 'Shortage'}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            {req.status !== 'Pending' ? (
                              <span className="text-[10px] font-bold text-slate-400 uppercase">{req.status}</span>
                            ) : req.shortageQty > 0 ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs py-1"
                                onClick={() => handleConvertRequirement(req._id, req.action === 'Produce' ? 'ProductionPlan' : 'PurchaseRequest')}
                              >
                                {req.action === 'Produce' ? <PackageCheck className="w-3.5 h-3.5 mr-1 text-blue-600" /> : <ShoppingCart className="w-3.5 h-3.5 mr-1 text-amber-600" />}
                                Convert to {req.action === 'Produce' ? 'Plan' : 'PO'}
                              </Button>
                            ) : (
                              <span className="text-[10px] text-slate-400 font-medium">Ready</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-slate-400 text-sm">
              Select or execute an MRP run to view requirements calculation.
            </div>
          )}
        </div>
      </div>

      {/* Execute MRP Run Dialog */}
      <Dialog isOpen={isRunModalOpen} onClose={() => setIsRunModalOpen(false)} title="Execute MRP Calculation Run">
        <form onSubmit={handleExecuteMRP} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700">Target Finished Good (Product)</label>
            <Select required value={runForm.productId} onChange={(e) => setRunForm({ ...runForm, productId: e.target.value })}>
              <option value="">Select Finished Product</option>
              {materials.map((m) => (
                <option key={m._id} value={m._id}>{m.name} ({m.code})</option>
              ))}
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700">Target Warehouse Context</label>
            <Select required value={runForm.warehouseId} onChange={(e) => setRunForm({ ...runForm, warehouseId: e.target.value })}>
              <option value="">Select Warehouse</option>
              {warehouses.map((w) => (
                <option key={w._id} value={w._id}>{w.name} ({w.code})</option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Target Quantity</label>
              <Input type="number" required min="1" value={runForm.targetQty} onChange={(e) => setRunForm({ ...runForm, targetQty: parseFloat(e.target.value) })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Required Date</label>
              <Input type="date" required value={runForm.requiredDate} onChange={(e) => setRunForm({ ...runForm, requiredDate: e.target.value })} />
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-2 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setIsRunModalOpen(false)}>Cancel</Button>
            <Button type="submit">Execute MRP Run</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};

export default MRP;
