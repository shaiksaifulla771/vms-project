import React, { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import {
  AlertCircle,
  Bell,
  Calendar,
  CheckCircle2,
  Clock,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  Users,
  XCircle
} from 'lucide-react';

const statusStyles = {
  REQUESTED: 'bg-amber-50 text-amber-700 border-amber-200',
  APPROVED: 'bg-blue-50 text-blue-700 border-blue-200',
  SCHEDULED: 'bg-blue-50 text-blue-700 border-blue-200',
  EXPECTED: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  RESCHEDULED: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  CHECKED_IN: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  IN_VISIT: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CHECKED_OUT: 'bg-slate-100 text-slate-700 border-slate-200',
  REJECTED: 'bg-rose-50 text-rose-700 border-rose-200',
  NO_SHOW: 'bg-orange-50 text-orange-700 border-orange-200',
  CANCELLED: 'bg-slate-100 text-slate-500 border-slate-200',
  REGISTERED: 'bg-slate-50 text-slate-700 border-slate-200'
};

const formatStatus = (status = '') => status.replaceAll('_', ' ');
const formatTime = (value) => value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-';
const formatDateTime = (value) => value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '-';

const StatTile = ({ label, value, icon: Icon }) => (
  <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-center justify-between">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <Icon className="h-4 w-4 text-blue-600" />
    </div>
    <p className="mt-3 text-3xl font-black tracking-normal text-slate-950">{value}</p>
  </div>
);

const StatusBadge = ({ status }) => (
  <span className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${statusStyles[status] || statusStyles.REGISTERED}`}>
    {formatStatus(status)}
  </span>
);

export default function VMSWorkbench() {
  const [activeView, setActiveView] = useState('overview');
  const [visitors, setVisitors] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [overview, setOverview] = useState({ metrics: {}, notifications: [], todaysVisitors: [], appointments: [] });
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showVisitorModal, setShowVisitorModal] = useState(false);
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);

  const [visitorForm, setVisitorForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    company: '',
    siteId: ''
  });

  const [appointmentForm, setAppointmentForm] = useState({
    visitorId: '',
    siteId: '',
    scheduledStartTime: '',
    scheduledEndTime: '',
    purpose: ''
  });

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [overviewRes, visitorRes, appointmentRes, siteRes] = await Promise.all([
        api.get('/appointments/overview/today'),
        api.get('/visitors'),
        api.get('/appointments'),
        api.get('/sites')
      ]);
      setOverview(overviewRes.data.data || { metrics: {}, notifications: [], todaysVisitors: [], appointments: [] });
      setVisitors(visitorRes.data.visitors || visitorRes.data.data || []);
      setAppointments(appointmentRes.data.appointments || appointmentRes.data.data || []);
      setSites(siteRes.data.sites || siteRes.data.data || []);
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to load VMS workspace');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredVisitors = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return visitors;
    return visitors.filter((visitor) =>
      [visitor.fullName, visitor.email, visitor.company, visitor.visitorCode, visitor.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [query, visitors]);

  const pendingAppointments = appointments.filter((appointment) => appointment.status === 'REQUESTED');
  const upcomingAppointments = appointments.filter((appointment) => ['SCHEDULED', 'EXPECTED', 'RESCHEDULED'].includes(appointment.status));
  const insideVisitors = visitors.filter((visitor) => ['CHECKED_IN', 'IN_VISIT'].includes(visitor.status));

  const action = async (callback, message) => {
    setError('');
    setSuccess('');
    try {
      await callback();
      setSuccess(message);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || err.message || 'Action failed');
    }
  };

  const createVisitor = async (event) => {
    event.preventDefault();
    await action(async () => {
      await api.post('/visitors', visitorForm);
      setVisitorForm({ fullName: '', email: '', phone: '', company: '', siteId: '' });
      setShowVisitorModal(false);
    }, 'Visitor registered');
  };

  const createAppointment = async (event) => {
    event.preventDefault();
    await action(async () => {
      await api.post('/appointments', appointmentForm);
      setAppointmentForm({ visitorId: '', siteId: '', scheduledStartTime: '', scheduledEndTime: '', purpose: '' });
      setShowAppointmentModal(false);
    }, 'Appointment request created');
  };

  const reschedule = (id, minutes) => action(
    () => api.post(`/appointments/${id}/reschedule`, { minutes, notes: `Moved ${minutes} minutes later` }),
    `Appointment moved ${minutes} minutes later`
  );

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-700">
              <ShieldCheck className="h-4 w-4" />
              Visitor Management System
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-normal text-slate-950">Visitor Overview</h1>
            <p className="mt-1 text-sm text-slate-500">Admin command center for today, with operations handled by departments and hosts.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setShowVisitorModal(true)} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white hover:bg-slate-800">
              <Plus className="h-4 w-4" /> Visitor
            </button>
            <button onClick={() => setShowAppointmentModal(true)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-700">
              <Calendar className="h-4 w-4" /> Appointment
            </button>
            <button onClick={loadData} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </div>
      </section>

      {error && <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800"><AlertCircle className="h-4 w-4" />{error}</div>}
      {success && <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800"><CheckCircle2 className="h-4 w-4" />{success}</div>}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <StatTile label="Today's Visitors" value={overview.metrics?.todaysVisitors || 0} icon={Users} />
        <StatTile label="Currently Inside" value={overview.metrics?.currentlyInside || 0} icon={UserCheck} />
        <StatTile label="Expected" value={overview.metrics?.expected || 0} icon={Clock} />
        <StatTile label="Checked Out" value={overview.metrics?.checkedOut || 0} icon={LogOut} />
        <StatTile label="Pending Requests" value={overview.metrics?.pendingRequests || 0} icon={Bell} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex gap-2">
              {[
                ['overview', 'Today'],
                ['appointments', 'Appointments'],
                ['visitors', 'Visitors'],
                ['checkin', 'Check-in/out']
              ].map(([id, label]) => (
                <button key={id} onClick={() => setActiveView(id)} className={`rounded-lg px-3 py-2 text-sm font-bold ${activeView === id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="relative w-full lg:w-64">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search visitors" className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
            </div>
          </div>

          {activeView === 'overview' && (
            <VisitorTable visitors={overview.todaysVisitors || []} empty="No visitor activity for today." onCheckIn={(id) => action(() => api.post(`/visitors/${id}/check-in`), 'Visitor checked in')} onCheckOut={(id) => action(() => api.post(`/visitors/${id}/check-out`), 'Visitor checked out')} />
          )}

          {activeView === 'visitors' && (
            <VisitorTable visitors={filteredVisitors} empty="No visitors found." onCheckIn={(id) => action(() => api.post(`/visitors/${id}/check-in`), 'Visitor checked in')} onCheckOut={(id) => action(() => api.post(`/visitors/${id}/check-out`), 'Visitor checked out')} />
          )}

          {activeView === 'checkin' && (
            <VisitorTable visitors={insideVisitors.length ? insideVisitors : filteredVisitors} empty="No active visitors." onCheckIn={(id) => action(() => api.post(`/visitors/${id}/check-in`), 'Visitor checked in')} onCheckOut={(id) => action(() => api.post(`/visitors/${id}/check-out`), 'Visitor checked out')} compact />
          )}

          {activeView === 'appointments' && (
            <AppointmentTable appointments={appointments} onApprove={(id) => action(() => api.post(`/appointments/${id}/approve`, { notes: 'Approved from VMS dashboard' }), 'Appointment approved')} onReject={(id) => action(() => api.post(`/appointments/${id}/reject`, { reason: 'Rejected from VMS dashboard' }), 'Appointment rejected')} onReschedule={reschedule} />
          )}
        </section>

        <aside className="space-y-5">
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Bell className="h-4 w-4 text-blue-600" />
              <h2 className="text-sm font-black uppercase tracking-wider text-slate-800">Notifications</h2>
            </div>
            <div className="space-y-2">
              {(overview.notifications || []).length === 0 ? (
                <p className="rounded-lg bg-slate-50 p-3 text-sm font-semibold text-slate-500">No active notifications.</p>
              ) : overview.notifications.map((item) => (
                <div key={item.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-slate-900">{item.visitorName}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">with {item.hostName} at {formatTime(item.appointmentTime)}</p>
                    </div>
                    <StatusBadge status={item.status} />
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{item.purpose}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-black uppercase tracking-wider text-slate-800">Pending Requests</h2>
            <div className="space-y-2">
              {pendingAppointments.length === 0 ? <p className="text-sm font-semibold text-slate-500">No approvals waiting.</p> : pendingAppointments.slice(0, 5).map((appointment) => (
                <div key={appointment._id} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-sm font-black text-slate-900">{appointment.visitorId?.fullName || 'Visitor'}</p>
                  <p className="text-xs font-semibold text-amber-800">{formatDateTime(appointment.scheduledStartTime)}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => action(() => api.post(`/appointments/${appointment._id}/approve`, {}), 'Appointment approved')} className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white">Approve</button>
                    <button onClick={() => reschedule(appointment._id, 10)} className="rounded-md bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 ring-1 ring-slate-200">+10 min</button>
                    <button onClick={() => action(() => api.post(`/appointments/${appointment._id}/reject`, {}), 'Appointment rejected')} className="rounded-md bg-rose-600 px-2.5 py-1.5 text-xs font-bold text-white">Reject</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>

      {showVisitorModal && (
        <Modal title="Register Visitor" onClose={() => setShowVisitorModal(false)}>
          <form onSubmit={createVisitor} className="space-y-3">
            <input required placeholder="Full name" value={visitorForm.fullName} onChange={(e) => setVisitorForm({ ...visitorForm, fullName: e.target.value })} className="w-full rounded-lg border border-slate-300 p-2.5 text-sm" />
            <input required type="email" placeholder="Email" value={visitorForm.email} onChange={(e) => setVisitorForm({ ...visitorForm, email: e.target.value })} className="w-full rounded-lg border border-slate-300 p-2.5 text-sm" />
            <input required placeholder="Phone" value={visitorForm.phone} onChange={(e) => setVisitorForm({ ...visitorForm, phone: e.target.value })} className="w-full rounded-lg border border-slate-300 p-2.5 text-sm" />
            <input placeholder="Company" value={visitorForm.company} onChange={(e) => setVisitorForm({ ...visitorForm, company: e.target.value })} className="w-full rounded-lg border border-slate-300 p-2.5 text-sm" />
            <select required value={visitorForm.siteId} onChange={(e) => setVisitorForm({ ...visitorForm, siteId: e.target.value })} className="w-full rounded-lg border border-slate-300 p-2.5 text-sm">
              <option value="">Select site</option>
              {sites.map((site) => <option key={site._id} value={site._id}>{site.name} ({site.code})</option>)}
            </select>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowVisitorModal(false)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-600">Cancel</button>
              <button type="submit" className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white">Save</button>
            </div>
          </form>
        </Modal>
      )}

      {showAppointmentModal && (
        <Modal title="Create Appointment" onClose={() => setShowAppointmentModal(false)}>
          <form onSubmit={createAppointment} className="space-y-3">
            <select required value={appointmentForm.visitorId} onChange={(e) => setAppointmentForm({ ...appointmentForm, visitorId: e.target.value })} className="w-full rounded-lg border border-slate-300 p-2.5 text-sm">
              <option value="">Select visitor</option>
              {visitors.map((visitor) => <option key={visitor._id} value={visitor._id}>{visitor.fullName} ({visitor.company || 'Individual'})</option>)}
            </select>
            <select required value={appointmentForm.siteId} onChange={(e) => setAppointmentForm({ ...appointmentForm, siteId: e.target.value })} className="w-full rounded-lg border border-slate-300 p-2.5 text-sm">
              <option value="">Select site</option>
              {sites.map((site) => <option key={site._id} value={site._id}>{site.name} ({site.code})</option>)}
            </select>
            <input required type="datetime-local" value={appointmentForm.scheduledStartTime} onChange={(e) => setAppointmentForm({ ...appointmentForm, scheduledStartTime: e.target.value })} className="w-full rounded-lg border border-slate-300 p-2.5 text-sm" />
            <input required type="datetime-local" value={appointmentForm.scheduledEndTime} onChange={(e) => setAppointmentForm({ ...appointmentForm, scheduledEndTime: e.target.value })} className="w-full rounded-lg border border-slate-300 p-2.5 text-sm" />
            <input required placeholder="Purpose" value={appointmentForm.purpose} onChange={(e) => setAppointmentForm({ ...appointmentForm, purpose: e.target.value })} className="w-full rounded-lg border border-slate-300 p-2.5 text-sm" />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowAppointmentModal(false)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-600">Cancel</button>
              <button type="submit" className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white">Create</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function VisitorTable({ visitors, empty, onCheckIn, onCheckOut, compact = false }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500">
          <tr>
            <th className="p-4">Visitor</th>
            <th className="p-4">Host</th>
            <th className="p-4">Time</th>
            <th className="p-4">Status</th>
            <th className="p-4">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {visitors.length === 0 ? (
            <tr><td colSpan="5" className="p-8 text-center font-semibold text-slate-400">{empty}</td></tr>
          ) : visitors.map((visitor) => (
            <tr key={visitor._id} className="hover:bg-slate-50">
              <td className="p-4">
                <p className="font-black text-slate-900">{visitor.fullName}</p>
                {!compact && <p className="text-xs text-slate-500">{visitor.company || visitor.email}</p>}
              </td>
              <td className="p-4 text-slate-600">{visitor.hostEmployeeId?.username || 'Host'}</td>
              <td className="p-4 text-slate-600">{visitor.checkInTime ? `${formatTime(visitor.checkInTime)}${visitor.checkOutTime ? ` -> ${formatTime(visitor.checkOutTime)}` : ''}` : '-'}</td>
              <td className="p-4"><StatusBadge status={visitor.status} /></td>
              <td className="p-4">
                <div className="flex gap-2">
                  {!['IN_VISIT', 'CHECKED_IN', 'CHECKED_OUT'].includes(visitor.status) && (
                    <button onClick={() => onCheckIn(visitor._id)} className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white">
                      <LogIn className="h-3.5 w-3.5" /> Check in
                    </button>
                  )}
                  {['IN_VISIT', 'CHECKED_IN'].includes(visitor.status) && (
                    <button onClick={() => onCheckOut(visitor._id)} className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2.5 py-1.5 text-xs font-bold text-white">
                      <LogOut className="h-3.5 w-3.5" /> Check out
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AppointmentTable({ appointments, onApprove, onReject, onReschedule }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500">
          <tr>
            <th className="p-4">Appointment</th>
            <th className="p-4">Visitor</th>
            <th className="p-4">Host</th>
            <th className="p-4">Scheduled</th>
            <th className="p-4">Status</th>
            <th className="p-4">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {appointments.length === 0 ? (
            <tr><td colSpan="6" className="p-8 text-center font-semibold text-slate-400">No appointments found.</td></tr>
          ) : appointments.map((appointment) => (
            <tr key={appointment._id} className="hover:bg-slate-50">
              <td className="p-4 font-mono font-black text-blue-700">{appointment.appointmentNumber}</td>
              <td className="p-4 font-bold text-slate-900">{appointment.visitorId?.fullName || 'Visitor'}</td>
              <td className="p-4 text-slate-600">{appointment.hostUserId?.username || 'Host'}</td>
              <td className="p-4 text-slate-600">{formatDateTime(appointment.scheduledStartTime)}</td>
              <td className="p-4"><StatusBadge status={appointment.status} /></td>
              <td className="p-4">
                {appointment.status === 'REQUESTED' ? (
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => onApprove(appointment._id)} className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white"><CheckCircle2 className="h-3.5 w-3.5" />Approve</button>
                    <button onClick={() => onReschedule(appointment._id, 10)} className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700">+10</button>
                    <button onClick={() => onReschedule(appointment._id, 30)} className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700">+30</button>
                    <button onClick={() => onReschedule(appointment._id, 60)} className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700">+1h</button>
                    <button onClick={() => onReject(appointment._id)} className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-2.5 py-1.5 text-xs font-bold text-white"><XCircle className="h-3.5 w-3.5" />Reject</button>
                  </div>
                ) : <span className="text-xs font-semibold text-slate-400">No action</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-black text-slate-950">{title}</h3>
          <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">x</button>
        </div>
        {children}
      </div>
    </div>
  );
}
