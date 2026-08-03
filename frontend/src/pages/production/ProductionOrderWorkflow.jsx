import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, PlayCircle, Settings, ClipboardList, AlertTriangle, Info, LogOut } from 'lucide-react';
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
  const [qcNotes, setQcNotes] = useState('');
  const [componentsActuals, setComponentsActuals] = useState([]);

  useEffect(() => {
    fetchOrder();
  }, [id]);

  const fetchOrder = async () => {
    try {
      const res = await api.get(`/api/productions/${id}`);
      const data = res.data.data;
      setOrder(data);
      if (data.status === 'In Production') {
        setActualQuantity(data.targetQuantity);
        setComponentsActuals(data.components.map(c => ({ mpnId: c.mpnId._id, actualQuantity: c.expectedQuantity })));
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
      await api.post(`/api/productions/${id}/${actionPath}`, payload);
      await fetchOrder();
    } catch (err) {
      setError(err.response?.data?.error || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  // Because some transitions might be PATCH or POST based on standard REST design in our controller:
  // Submit: POST /submit
  // Approve: POST /approve
  // Allocate: POST /allocate
  // Start: PATCH /start
  // QC: POST /qc
  // Complete: PATCH /complete
  const handleTransitionPatch = async (actionPath, payload = {}) => {
    setActionLoading(true);
    setError(null);
    try {
      await api.patch(`/api/productions/${id}/${actionPath}`, payload);
      await fetchOrder();
    } catch (err) {
      setError(err.response?.data?.error || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Loading workflow...</div>;
  if (!order) return <div className="p-8 text-center text-red-500">Order not found</div>;

  const currentStepIndex = STEPS.indexOf(order.status);
  
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link to="/production" className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{order.prdNumber}</h1>
            <p className="text-sm text-slate-500">Product: {order.productId?.name} | Batch: {order.batchNumber}</p>
          </div>
        </div>
        <div>
          <span className="px-3 py-1 bg-slate-100 text-slate-800 rounded-full text-sm font-semibold border border-slate-200 shadow-sm">
            Status: {order.status}
          </span>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-lg flex items-center border border-red-200 shadow-sm">
          <AlertTriangle className="w-5 h-5 mr-3 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Workflow Progress Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center justify-between relative">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-slate-100 z-0 rounded-full"></div>
          {STEPS.map((step, idx) => {
            const isCompleted = idx <= currentStepIndex;
            const isCurrent = idx === currentStepIndex;
            return (
              <div key={step} className="relative z-10 flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 shadow-sm
                  ${isCurrent ? 'bg-blue-600 text-white ring-4 ring-blue-100 scale-110' : 
                    isCompleted ? 'bg-emerald-500 text-white' : 'bg-white text-slate-400 border-2 border-slate-200'}`}
                >
                  {isCompleted && !isCurrent ? <CheckCircle2 className="w-5 h-5" /> : idx + 1}
                </div>
                <span className={`mt-2 text-xs font-medium whitespace-nowrap ${isCurrent ? 'text-blue-700' : isCompleted ? 'text-emerald-700' : 'text-slate-400'}`}>
                  {step}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Details */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
              <Settings className="w-5 h-5 mr-2 text-slate-500" />
              Production Details
            </h3>
            <div className="grid grid-cols-2 gap-y-4 text-sm">
              <div>
                <p className="text-slate-500">Target Quantity</p>
                <p className="font-semibold text-slate-900">{order.targetQuantity}</p>
              </div>
              <div>
                <p className="text-slate-500">Actual Quantity</p>
                <p className="font-semibold text-slate-900">{order.actualQuantity || '-'}</p>
              </div>
              <div>
                <p className="text-slate-500">Source Warehouse</p>
                <p className="font-semibold text-slate-900">{order.sourceWarehouseId?.name || '-'}</p>
              </div>
              <div>
                <p className="text-slate-500">Destination Warehouse</p>
                <p className="font-semibold text-slate-900">{order.destinationWarehouseId?.name || '-'}</p>
              </div>
            </div>

            <div className="mt-6">
              <h4 className="font-semibold text-slate-800 mb-3 border-b pb-2">Component Requirements</h4>
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="text-slate-500 font-medium">
                  <tr>
                    <th className="py-2">MPN</th>
                    <th className="py-2 text-right">Expected Qty</th>
                    <th className="py-2 text-right">Actual Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {order.components.map(comp => (
                    <tr key={comp._id}>
                      <td className="py-2">{comp.mpnId?.mpnCode}</td>
                      <td className="py-2 text-right">{comp.expectedQuantity}</td>
                      <td className="py-2 text-right font-medium text-blue-700">{comp.actualQuantity || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* QC Form when In Production */}
          {order.status === 'In Production' && (
            <div className="bg-indigo-50 rounded-xl shadow-sm border border-indigo-100 p-6">
              <h3 className="text-lg font-bold text-indigo-900 mb-4 flex items-center">
                <ClipboardList className="w-5 h-5 mr-2" />
                Log Actuals (Send to QC)
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-indigo-900 mb-1">Actual FG Produced</label>
                  <input 
                    type="number" 
                    className="w-full px-3 py-2 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white"
                    value={actualQuantity}
                    onChange={(e) => setActualQuantity(e.target.value)}
                  />
                </div>
                <div className="border-t border-indigo-100 pt-4 mt-4">
                  <h4 className="text-sm font-semibold text-indigo-800 mb-2">Raw Material Consumption</h4>
                  {componentsActuals.map((ca, idx) => {
                    const compMeta = order.components.find(c => c.mpnId._id === ca.mpnId);
                    return (
                      <div key={ca.mpnId} className="flex justify-between items-center mb-2">
                        <span className="text-sm text-indigo-900">{compMeta?.mpnId?.mpnCode} (Expected: {compMeta?.expectedQuantity})</span>
                        <input 
                          type="number" 
                          className="w-32 px-2 py-1 border border-indigo-200 rounded bg-white text-sm"
                          value={ca.actualQuantity}
                          onChange={(e) => {
                            const newActuals = [...componentsActuals];
                            newActuals[idx].actualQuantity = e.target.value;
                            setComponentsActuals(newActuals);
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
                <button 
                  onClick={() => handleTransition('qc', { actualQuantity, componentsActuals })}
                  disabled={actionLoading}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 rounded-lg transition-colors shadow-sm"
                >
                  {actionLoading ? 'Saving...' : 'Submit to Quality Check'}
                </button>
              </div>
            </div>
          )}

          {/* QC Review when in Quality Check */}
          {order.status === 'Quality Check' && (
            <div className="bg-orange-50 rounded-xl shadow-sm border border-orange-100 p-6">
              <h3 className="text-lg font-bold text-orange-900 mb-4 flex items-center">
                <AlertTriangle className="w-5 h-5 mr-2" />
                Quality Control Review
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-orange-900 mb-1">Inspector Notes</label>
                  <textarea 
                    className="w-full px-3 py-2 border border-orange-200 rounded-lg focus:ring-2 focus:ring-orange-500 bg-white h-24"
                    value={qcNotes}
                    onChange={(e) => setQcNotes(e.target.value)}
                    placeholder="Enter inspection results, deviations..."
                  />
                </div>
                <div className="flex space-x-4">
                  <button 
                    onClick={() => handleTransitionPatch('complete', { qcStatus: 'Rejected', qcNotes })}
                    disabled={actionLoading}
                    className="flex-1 bg-white border border-red-200 text-red-700 hover:bg-red-50 font-medium py-2 rounded-lg transition-colors shadow-sm"
                  >
                    Reject (Scrap)
                  </button>
                  <button 
                    onClick={() => handleTransitionPatch('complete', { qcStatus: 'Passed', qcNotes })}
                    disabled={actionLoading}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 rounded-lg transition-colors shadow-sm"
                  >
                    Approve (Complete Order)
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Actions */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Actions</h3>
            
            {order.status === 'Draft' && (
              <div className="space-y-3">
                <p className="text-sm text-slate-500 mb-2">Review BOM and expected quantities before submitting.</p>
                <button onClick={() => handleTransition('submit')} disabled={actionLoading} className="w-full btn-primary justify-center">
                  Submit for Approval
                </button>
              </div>
            )}

            {order.status === 'Pending Approval' && (
              <div className="space-y-3">
                <p className="text-sm text-slate-500 mb-2">Approving will automatically soft-reserve inventory.</p>
                <button onClick={() => handleTransition('approve')} disabled={actionLoading} className="w-full btn-primary justify-center bg-blue-600 hover:bg-blue-700 text-white">
                  Approve & Reserve
                </button>
              </div>
            )}

            {order.status === 'Approved' && (
              <div className="space-y-3">
                <p className="text-sm text-slate-500 mb-2">Allocate raw materials from reserved stock.</p>
                <button onClick={() => handleTransition('allocate')} disabled={actionLoading} className="w-full btn-primary justify-center bg-indigo-600 hover:bg-indigo-700 text-white">
                  Allocate Material
                </button>
              </div>
            )}

            {order.status === 'Material Allocated' && (
              <div className="space-y-3">
                <p className="text-sm text-slate-500 mb-2">Start the shop floor production run.</p>
                <button onClick={() => handleTransitionPatch('start')} disabled={actionLoading} className="w-full btn-primary justify-center bg-purple-600 hover:bg-purple-700 text-white">
                  <PlayCircle className="w-4 h-4 mr-2" />
                  Start Production
                </button>
              </div>
            )}

            {['Completed', 'Closed', 'Rejected'].includes(order.status) && (
              <div className="text-center p-4 bg-slate-50 rounded-lg border border-slate-100">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-700">Workflow Finished</p>
                <p className="text-xs text-slate-500 mt-1">No further actions required.</p>
              </div>
            )}
          </div>

          <div className="bg-slate-50 rounded-xl border border-slate-200 p-6">
             <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center">
              <Info className="w-4 h-4 mr-2 text-slate-500" /> System Note
             </h3>
             <p className="text-xs text-slate-600">
               Inventory levels are updated automatically upon workflow completion. ACID transactions ensure consistency across materials ledger.
             </p>
          </div>
        </div>
      </div>
    </div>
  );
}
