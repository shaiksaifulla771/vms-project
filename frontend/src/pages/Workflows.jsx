import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { GitBranch, Play, CheckCircle2, XCircle, Clock, RefreshCw, AlertCircle } from 'lucide-react';

export default function Workflows() {
  const [activeTab, setActiveTab] = useState('workflows');
  const [workflows, setWorkflows] = useState([]);
  const [executions, setExecutions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      if (activeTab === 'workflows') {
        const res = await api.get('/workflows');
        setWorkflows(res.data.data || []);
      } else {
        const res = await api.get('/workflows/executions/all');
        setExecutions(res.data.data || []);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load workflow data');
    } finally {
      setLoading(false);
    }
  };

  const handleTestTrigger = async (code) => {
    try {
      await api.post('/workflows/execute', {
        triggerEvent: 'appointment.created',
        payload: { appointmentId: 'APTEST-1001', visitorName: 'Alice Smith', purpose: 'VIP', status: 'Approved' }
      });
      setSuccess(`Workflow execution triggered!`);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Trigger failed');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center bg-slate-900 text-white p-6 rounded-2xl shadow-xl">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-3">
            <GitBranch className="w-7 h-7 text-emerald-400" />
            VMS Workflow Engine & Automation
          </h1>
          <p className="text-slate-400 text-sm mt-1">Configurable Trigger → Condition → Action Execution Pipelines & Audit Logs</p>
        </div>
        <button onClick={fetchData} className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-2.5 rounded-xl border border-slate-700">
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5" />
          <span>{success}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-4 border-b border-slate-200 pb-2">
        <button onClick={() => setActiveTab('workflows')} className={`px-4 py-2 rounded-xl font-bold text-sm ${activeTab === 'workflows' ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
          Active Workflows ({workflows.length})
        </button>
        <button onClick={() => setActiveTab('executions')} className={`px-4 py-2 rounded-xl font-bold text-sm ${activeTab === 'executions' ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
          Execution History ({executions.length})
        </button>
      </div>

      {/* Workflows List */}
      {activeTab === 'workflows' && (
        <div className="space-y-4">
          {workflows.map(wf => (
            <div key={wf._id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <span className="font-mono text-xs font-bold bg-emerald-50 text-emerald-700 px-3 py-1 rounded-lg border border-emerald-200">{wf.code}</span>
                  <h3 className="text-lg font-black text-slate-800 mt-2">{wf.name}</h3>
                  <p className="text-xs text-slate-500">{wf.description}</p>
                </div>
                <button onClick={() => handleTestTrigger(wf.code)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-2">
                  <Play className="w-4 h-4" /> Trigger Execution
                </button>
              </div>

              {/* Steps Pipeline */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Execution Pipeline Steps:</div>
                <div className="flex items-center gap-3 overflow-x-auto pb-2">
                  {wf.steps?.map((step, sIdx) => (
                    <React.Fragment key={sIdx}>
                      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex-1 min-w-[200px]">
                        <div className="text-[10px] font-bold text-emerald-600 uppercase">Step {step.stepOrder}: {step.type}</div>
                        <div className="font-bold text-xs text-slate-800 mt-1">{step.name}</div>
                      </div>
                      {sIdx < wf.steps.length - 1 && <span className="text-slate-300 font-bold">→</span>}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Executions List */}
      {activeTab === 'executions' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase">
                <th className="p-4">Trigger Event</th>
                <th className="p-4">Workflow</th>
                <th className="p-4">Entity</th>
                <th className="p-4">Status</th>
                <th className="p-4">Started At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {executions.map(ex => (
                <tr key={ex._id} className="hover:bg-slate-50">
                  <td className="p-4 font-mono text-xs font-bold text-emerald-600">{ex.triggerEvent}</td>
                  <td className="p-4 font-semibold text-slate-800">{ex.workflowId?.name || 'Workflow'}</td>
                  <td className="p-4 text-xs text-slate-600">{ex.entityType} ({ex.entityId})</td>
                  <td className="p-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${ex.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {ex.status}
                    </span>
                  </td>
                  <td className="p-4 text-xs text-slate-500">{new Date(ex.startedAt || ex.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
