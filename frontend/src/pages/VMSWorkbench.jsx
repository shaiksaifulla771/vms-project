import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Users, Calendar, CheckCircle2, XCircle, LogIn, LogOut, Plus, RefreshCw, AlertCircle } from 'lucide-react';

export default function VMSWorkbench() {
  const [activeTab, setActiveTab] = useState('visitors');
  const [visitors, setVisitors] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form states
  const [showVisitorModal, setShowVisitorModal] = useState(false);
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);

  const [visitorForm, setVisitorForm] = useState({
    fullName: '', email: '', phone: '', company: '', hostEmployeeId: '', siteId: ''
  });

  const [appointmentForm, setAppointmentForm] = useState({
    visitorId: '', siteId: '', scheduledStartTime: '', scheduledEndTime: '', purpose: ''
  });

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [vRes, aRes, sRes] = await Promise.all([
        api.get('/visitors'),
        api.get('/appointments'),
        api.get('/sites')
      ]);
      setVisitors(vRes.data.visitors || []);
      setAppointments(aRes.data.appointments || []);
      setSites(sRes.data.data || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load VMS data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateVisitor = async (e) => {
    e.preventDefault();
    try {
      await api.post('/visitors', visitorForm);
      setSuccess('Visitor registered successfully!');
      setShowVisitorModal(false);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create visitor');
    }
  };

  const handleCreateAppointment = async (e) => {
    e.preventDefault();
    try {
      await api.post('/appointments', appointmentForm);
      setSuccess('Appointment created successfully!');
      setShowAppointmentModal(false);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create appointment');
    }
  };

  const handleCheckIn = async (id) => {
    try {
      await api.post(`/visitors/${id}/check-in`);
      setSuccess('Visitor checked in successfully');
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Check-in failed');
    }
  };

  const handleCheckOut = async (id) => {
    try {
      await api.post(`/visitors/${id}/check-out`);
      setSuccess('Visitor checked out successfully');
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Check-out failed');
    }
  };

  const handleApprove = async (id) => {
    try {
      await api.post(`/appointments/${id}/approve`, { notes: 'Approved via VMS Workbench' });
      setSuccess('Appointment approved');
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Approval failed');
    }
  };

  const handleReject = async (id) => {
    try {
      await api.post(`/appointments/${id}/reject`, { reason: 'Rejected via VMS Workbench' });
      setSuccess('Appointment rejected');
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Rejection failed');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center bg-slate-900 text-white p-6 rounded-2xl shadow-xl">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-3">
            <Users className="w-7 h-7 text-blue-400" />
            VMS Workbench & Visitor Operations
          </h1>
          <p className="text-slate-400 text-sm mt-1">Manage Visitor Registrations, Host Appointments, Check-ins & Approvals</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setShowVisitorModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-xl flex items-center gap-2 transition-all">
            <Plus className="w-4 h-4" /> New Visitor
          </button>
          <button onClick={() => setShowAppointmentModal(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl flex items-center gap-2 transition-all">
            <Calendar className="w-4 h-4" /> New Appointment
          </button>
          <button onClick={fetchData} className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-2 rounded-xl border border-slate-700">
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-4 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('visitors')}
          className={`px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 ${activeTab === 'visitors' ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
        >
          <Users className="w-4 h-4" /> Visitors ({visitors.length})
        </button>
        <button
          onClick={() => setActiveTab('appointments')}
          className={`px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 ${activeTab === 'appointments' ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
        >
          <Calendar className="w-4 h-4" /> Appointments ({appointments.length})
        </button>
      </div>

      {/* Visitors List */}
      {activeTab === 'visitors' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th className="p-4">Visitor Code</th>
                <th className="p-4">Full Name & Email</th>
                <th className="p-4">Company</th>
                <th className="p-4">Site</th>
                <th className="p-4">Status</th>
                <th className="p-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {visitors.length === 0 ? (
                <tr><td colSpan="6" className="p-6 text-center text-slate-400">No visitors registered yet.</td></tr>
              ) : visitors.map(v => (
                <tr key={v._id} className="hover:bg-slate-50">
                  <td className="p-4 font-mono font-bold text-blue-600">{v.visitorCode}</td>
                  <td className="p-4">
                    <div className="font-bold text-slate-800">{v.fullName}</div>
                    <div className="text-xs text-slate-500">{v.email}</div>
                  </td>
                  <td className="p-4 text-slate-600">{v.company || '-'}</td>
                  <td className="p-4 text-slate-600">{v.siteId?.name || '-'}</td>
                  <td className="p-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                      v.status === 'Checked In' ? 'bg-emerald-100 text-emerald-700' :
                      v.status === 'Checked Out' ? 'bg-slate-100 text-slate-600' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {v.status}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex gap-2">
                      {v.status !== 'Checked In' && v.status !== 'Checked Out' && (
                        <button onClick={() => handleCheckIn(v._id)} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1 rounded-lg flex items-center gap-1">
                          <LogIn className="w-3.5 h-3.5" /> Check In
                        </button>
                      )}
                      {v.status === 'Checked In' && (
                        <button onClick={() => handleCheckOut(v._id)} className="bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold px-3 py-1 rounded-lg flex items-center gap-1">
                          <LogOut className="w-3.5 h-3.5" /> Check Out
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Appointments List */}
      {activeTab === 'appointments' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th className="p-4">Apt Number</th>
                <th className="p-4">Visitor</th>
                <th className="p-4">Host Employee</th>
                <th className="p-4">Scheduled Time</th>
                <th className="p-4">Status</th>
                <th className="p-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {appointments.length === 0 ? (
                <tr><td colSpan="6" className="p-6 text-center text-slate-400">No appointments scheduled yet.</td></tr>
              ) : appointments.map(a => (
                <tr key={a._id} className="hover:bg-slate-50">
                  <td className="p-4 font-mono font-bold text-emerald-600">{a.appointmentNumber}</td>
                  <td className="p-4 font-semibold text-slate-800">{a.visitorId?.fullName || 'Visitor'}</td>
                  <td className="p-4 text-slate-600">{a.hostUserId?.username || 'Host'}</td>
                  <td className="p-4 text-slate-600">{new Date(a.scheduledStartTime).toLocaleString()}</td>
                  <td className="p-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                      a.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' :
                      a.status === 'Rejected' ? 'bg-red-100 text-red-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                      {a.status}
                    </span>
                  </td>
                  <td className="p-4">
                    {a.status === 'Pending Approval' && (
                      <div className="flex gap-2">
                        <button onClick={() => handleApprove(a._id)} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1 rounded-lg flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                        </button>
                        <button onClick={() => handleReject(a._id)} className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-1 rounded-lg flex items-center gap-1">
                          <XCircle className="w-3.5 h-3.5" /> Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New Visitor Modal */}
      {showVisitorModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-black text-slate-900">Register New Visitor</h3>
            <form onSubmit={handleCreateVisitor} className="space-y-3">
              <input type="text" placeholder="Full Name" required value={visitorForm.fullName} onChange={e => setVisitorForm({...visitorForm, fullName: e.target.value})} className="w-full p-2.5 border border-slate-300 rounded-xl text-sm" />
              <input type="email" placeholder="Email Address" required value={visitorForm.email} onChange={e => setVisitorForm({...visitorForm, email: e.target.value})} className="w-full p-2.5 border border-slate-300 rounded-xl text-sm" />
              <input type="text" placeholder="Phone Number" required value={visitorForm.phone} onChange={e => setVisitorForm({...visitorForm, phone: e.target.value})} className="w-full p-2.5 border border-slate-300 rounded-xl text-sm" />
              <input type="text" placeholder="Company / Organization" value={visitorForm.company} onChange={e => setVisitorForm({...visitorForm, company: e.target.value})} className="w-full p-2.5 border border-slate-300 rounded-xl text-sm" />
              <select required value={visitorForm.siteId} onChange={e => setVisitorForm({...visitorForm, siteId: e.target.value})} className="w-full p-2.5 border border-slate-300 rounded-xl text-sm">
                <option value="">Select Facility Site...</option>
                {sites.map(s => <option key={s._id} value={s._id}>{s.name} ({s.code})</option>)}
              </select>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowVisitorModal(false)} className="px-4 py-2 border border-slate-300 rounded-xl text-sm font-bold text-slate-600">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700">Save Visitor</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Appointment Modal */}
      {showAppointmentModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-black text-slate-900">Schedule New Appointment</h3>
            <form onSubmit={handleCreateAppointment} className="space-y-3">
              <select required value={appointmentForm.visitorId} onChange={e => setAppointmentForm({...appointmentForm, visitorId: e.target.value})} className="w-full p-2.5 border border-slate-300 rounded-xl text-sm">
                <option value="">Select Visitor...</option>
                {visitors.map(v => <option key={v._id} value={v._id}>{v.fullName} ({v.company || 'Individual'})</option>)}
              </select>
              <select required value={appointmentForm.siteId} onChange={e => setAppointmentForm({...appointmentForm, siteId: e.target.value})} className="w-full p-2.5 border border-slate-300 rounded-xl text-sm">
                <option value="">Select Facility Site...</option>
                {sites.map(s => <option key={s._id} value={s._id}>{s.name} ({s.code})</option>)}
              </select>
              <div>
                <label className="text-xs font-bold text-slate-500">Scheduled Start Time</label>
                <input type="datetime-local" required value={appointmentForm.scheduledStartTime} onChange={e => setAppointmentForm({...appointmentForm, scheduledStartTime: e.target.value})} className="w-full p-2.5 border border-slate-300 rounded-xl text-sm" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500">Scheduled End Time</label>
                <input type="datetime-local" required value={appointmentForm.scheduledEndTime} onChange={e => setAppointmentForm({...appointmentForm, scheduledEndTime: e.target.value})} className="w-full p-2.5 border border-slate-300 rounded-xl text-sm" />
              </div>
              <input type="text" placeholder="Purpose of Visit" required value={appointmentForm.purpose} onChange={e => setAppointmentForm({...appointmentForm, purpose: e.target.value})} className="w-full p-2.5 border border-slate-300 rounded-xl text-sm" />
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAppointmentModal(false)} className="px-4 py-2 border border-slate-300 rounded-xl text-sm font-bold text-slate-600">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700">Create Appointment</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
