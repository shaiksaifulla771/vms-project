import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Mail, RefreshCw, Send, ListFilter, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function EmailTemplates() {
  const [activeTab, setActiveTab] = useState('templates');
  const [templates, setTemplates] = useState([]);
  const [queue, setQueue] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [testEmail, setTestEmail] = useState({ templateCode: 'VISITOR_REGISTRATION', recipient: '' });

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      if (activeTab === 'templates') {
        const res = await api.get('/email/templates');
        setTemplates(res.data.data || []);
      } else if (activeTab === 'queue') {
        const res = await api.get('/email/queue');
        setQueue(res.data.data || []);
      } else {
        const res = await api.get('/email/logs');
        setLogs(res.data.logs || []);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load email data');
    } finally {
      setLoading(false);
    }
  };

  const handleSendTestEmail = async (e) => {
    e.preventDefault();
    try {
      await api.post('/email/send-template', {
        templateCode: testEmail.templateCode,
        recipient: testEmail.recipient,
        data: { visitorName: 'John Visitor', employeeName: 'Host Manager', appointmentDate: '2026-08-15', appointmentTime: '10:00 AM', status: 'Approved' }
      });
      setSuccess(`Test email sent successfully to ${testEmail.recipient}`);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Send email failed');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center bg-slate-900 text-white p-6 rounded-2xl shadow-xl">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-3">
            <Mail className="w-7 h-7 text-blue-400" />
            Email Management & Template Center
          </h1>
          <p className="text-slate-400 text-sm mt-1">Manage Email Templates, Asynchronous Queue Dispatches & Delivery Logs</p>
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
        <button onClick={() => setActiveTab('templates')} className={`px-4 py-2 rounded-xl font-bold text-sm ${activeTab === 'templates' ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
          Email Templates ({templates.length})
        </button>
        <button onClick={() => setActiveTab('queue')} className={`px-4 py-2 rounded-xl font-bold text-sm ${activeTab === 'queue' ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
          Email Queue ({queue.length})
        </button>
        <button onClick={() => setActiveTab('logs')} className={`px-4 py-2 rounded-xl font-bold text-sm ${activeTab === 'logs' ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
          Dispatch Logs ({logs.length})
        </button>
      </div>

      {/* Quick Test Email Dispatch */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2">
          <Send className="w-4 h-4 text-blue-600" /> Send Test Templated Email
        </h3>
        <form onSubmit={handleSendTestEmail} className="flex gap-3">
          <select value={testEmail.templateCode} onChange={e => setTestEmail({...testEmail, templateCode: e.target.value})} className="p-2 border border-slate-300 rounded-xl text-sm font-medium">
            <option value="VISITOR_REGISTRATION">VISITOR_REGISTRATION</option>
            <option value="APPOINTMENT_APPROVED">APPOINTMENT_APPROVED</option>
            <option value="APPOINTMENT_REJECTED">APPOINTMENT_REJECTED</option>
            <option value="VISITOR_CHECK_IN">VISITOR_CHECK_IN</option>
          </select>
          <input type="email" placeholder="Recipient Email Address" required value={testEmail.recipient} onChange={e => setTestEmail({...testEmail, recipient: e.target.value})} className="flex-1 p-2 border border-slate-300 rounded-xl text-sm" />
          <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-bold text-sm">Send Email</button>
        </form>
      </div>

      {/* Templates List */}
      {activeTab === 'templates' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map(t => (
            <div key={t._id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
              <div className="flex justify-between items-start">
                <span className="font-mono text-xs font-bold bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg border border-blue-200">{t.templateCode}</span>
                <span className="text-xs font-bold text-slate-400">{t.category}</span>
              </div>
              <h4 className="font-bold text-slate-800 text-base">{t.name}</h4>
              <p className="text-xs text-slate-500 font-medium">Subject: {t.subject}</p>
              <div className="flex flex-wrap gap-1 pt-2">
                {t.variables?.map(v => <span key={v} className="bg-slate-100 text-slate-600 text-[10px] font-mono font-bold px-2 py-0.5 rounded">{`{{${v}}}`}</span>)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Queue & Logs Lists */}
      {(activeTab === 'queue' || activeTab === 'logs') && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase">
                <th className="p-4">Recipient</th>
                <th className="p-4">Subject</th>
                <th className="p-4">Template</th>
                <th className="p-4">Status</th>
                <th className="p-4">Date & Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(activeTab === 'queue' ? queue : logs).map(item => (
                <tr key={item._id} className="hover:bg-slate-50">
                  <td className="p-4 font-semibold text-slate-800">{item.recipient}</td>
                  <td className="p-4 text-slate-600">{item.subject}</td>
                  <td className="p-4 font-mono text-xs text-blue-600">{item.templateCode || 'MANUAL'}</td>
                  <td className="p-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${item.status === 'Sent' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="p-4 text-xs text-slate-500">{new Date(item.sentAt || item.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
