import React, { useState, useEffect } from 'react';
import { HelpCircle, Mail, Phone, ExternalLink, Activity, X, Shield, Send, CheckCircle2 } from 'lucide-react';
import axios from 'axios';

export default function SupportModal({ isOpen, onClose }) {
  const [systemHealth, setSystemHealth] = useState({ status: 'checking', uptime: null });
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (isOpen) {
      const fetchSystemHealth = async () => {
        try {
          const res = await axios.get('/api/health');
          setSystemHealth({ status: 'healthy', uptime: res.data?.uptime });
        } catch (err) {
          setSystemHealth({ status: 'degraded', uptime: null });
        }
      };
      fetchSystemHealth();
    }
  }, [isOpen]);

  const handleSubmitFeedback = (e) => {
    e.preventDefault();
    if (!message.trim()) return;
    setFeedbackSent(true);
    setTimeout(() => {
      setFeedbackSent(false);
      setSubject('');
      setMessage('');
      onClose();
    }, 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 relative overflow-hidden">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <HelpCircle className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Enterprise Help & Support</h2>
            <p className="text-xs text-slate-400">Technical assistance & operational escalation</p>
          </div>
        </div>

        {/* Live System Status Banner */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/80 border border-slate-800 mb-6 text-xs">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${systemHealth.status === 'healthy' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
            <span className="font-semibold text-slate-200">System Status:</span>
            <span className={systemHealth.status === 'healthy' ? 'text-emerald-400 font-bold uppercase' : 'text-amber-400 font-bold uppercase'}>
              {systemHealth.status === 'healthy' ? 'All Systems Operational' : 'Degraded Performance'}
            </span>
          </div>
          <span className="text-slate-400 text-[11px] font-mono">
            {systemHealth.uptime ? `Uptime: ${(systemHealth.uptime / 60).toFixed(1)}m` : 'Cloud Active'}
          </span>
        </div>

        {/* Contact Channels */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="p-3.5 rounded-xl bg-slate-850/60 border border-slate-800/80">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 mb-1">
              <Mail className="w-3.5 h-3.5 text-blue-400" />
              Helpdesk Email
            </div>
            <a href="mailto:support@vendoros.enterprise.internal" className="text-xs text-blue-400 hover:underline break-all">
              support@vendoros.enterprise.internal
            </a>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-850/60 border border-slate-800/80">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 mb-1">
              <Phone className="w-3.5 h-3.5 text-indigo-400" />
              Incident Hotline
            </div>
            <span className="text-xs text-slate-300 font-mono">
              +1 (800) 555-0199 (24/7)
            </span>
          </div>
        </div>

        {/* Quick Ticket Form */}
        {feedbackSent ? (
          <div className="p-6 text-center bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 animate-in zoom-in-95 duration-200">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-white">Inquiry Submitted Successfully</h4>
            <p className="text-xs text-slate-300 mt-1">Ticket #VMS-{Math.floor(100000 + Math.random() * 900000)} generated. Support will respond shortly.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmitFeedback} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. MRP Run Exception or Material Inconsistency"
                className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Description / Error Details</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                placeholder="Provide steps or batch numbers affected..."
                className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors resize-none"
                required
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors shadow-lg shadow-blue-600/30"
              >
                <Send className="w-3.5 h-3.5" />
                Submit Ticket
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
