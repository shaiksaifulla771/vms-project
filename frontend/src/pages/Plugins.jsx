import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Cpu, CheckCircle2, Power, Terminal, RefreshCw, AlertCircle, ShieldCheck } from 'lucide-react';

export default function Plugins() {
  const [plugins, setPlugins] = useState([]);
  const [mcpTools, setMcpTools] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [pRes, tRes] = await Promise.all([
        api.get('/plugins'),
        api.get('/mcp/tools')
      ]);
      setPlugins(pRes.data.data || []);
      setMcpTools(tRes.data.data || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load plugin/MCP data');
    } finally {
      setLoading(false);
    }
  };

  const togglePlugin = async (code, currentStatus) => {
    try {
      const action = currentStatus === 'Active' ? 'disable' : 'enable';
      await api.post(`/plugins/${code}/${action}`);
      setSuccess(`Plugin ${code} ${action}d successfully`);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to toggle plugin');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center bg-slate-900 text-white p-6 rounded-2xl shadow-xl">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-3">
            <Cpu className="w-7 h-7 text-purple-400" />
            Plugin Architecture & Antigravity MCP Integration
          </h1>
          <p className="text-slate-400 text-sm mt-1">Modular Plugin Management & Secure Authorized MCP Tools Gateway</p>
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

      {/* Installed VMS Plugins */}
      <div className="space-y-4">
        <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-blue-600" /> Installed VMS System Plugins
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {plugins.map(p => (
            <div key={p._id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-start">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold bg-purple-50 text-purple-700 px-2.5 py-0.5 rounded-lg border border-purple-200">{p.code}</span>
                  <span className="text-xs font-bold text-slate-400">v{p.version}</span>
                </div>
                <h4 className="font-bold text-slate-800 text-base">{p.name}</h4>
                <p className="text-xs text-slate-500">{p.description}</p>
                <div className="flex items-center gap-2 pt-1">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${p.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                    {p.status}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-400">Health: {p.healthStatus}</span>
                </div>
              </div>

              <button
                onClick={() => togglePlugin(p.code, p.status)}
                className={`p-2.5 rounded-xl border transition-all ${p.status === 'Active' ? 'bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-100' : 'bg-slate-100 border-slate-200 text-slate-400 hover:bg-slate-200'}`}
              >
                <Power className="w-5 h-5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Exposed Safe MCP Tools */}
      <div className="space-y-4 pt-4">
        <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
          <Terminal className="w-5 h-5 text-purple-600" /> Antigravity MCP Authorized Tools ({mcpTools.length})
        </h3>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase">
                <th className="p-4">Tool Name</th>
                <th className="p-4">Category</th>
                <th className="p-4">Description</th>
                <th className="p-4">Security Level</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {mcpTools.map(t => (
                <tr key={t.name} className="hover:bg-slate-50">
                  <td className="p-4 font-mono font-bold text-purple-700">{t.name}</td>
                  <td className="p-4">
                    <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg text-xs font-bold">{t.category}</span>
                  </td>
                  <td className="p-4 text-slate-600 text-xs">{t.description}</td>
                  <td className="p-4">
                    <span className="bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit">
                      <ShieldCheck className="w-3.5 h-3.5" /> JWT + RBAC Secured
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
