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
  XCircle,
  QrCode,
  Printer,
  CheckSquare,
  Square,
  Zap,
  Sliders,
  ShieldAlert,
  Download,
  FileSpreadsheet,
  Mail,
  UserPlus
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

const StatTile = ({ label, value, subtext, icon: Icon, colorClass = "text-blue-600", bgClass = "bg-white" }) => (
  <div className={`rounded-xl border border-slate-200 ${bgClass} p-4 shadow-2xs space-y-2`}>
    <div className="flex items-center justify-between">
      <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">{label}</p>
      <div className={`p-2 rounded-lg ${colorClass.includes('emerald') ? 'bg-emerald-50' : colorClass.includes('amber') ? 'bg-amber-50' : 'bg-blue-50'}`}>
        <Icon className={`h-4 w-4 ${colorClass}`} />
      </div>
    </div>
    <p className="text-3xl font-extrabold tracking-tight text-slate-900">{value}</p>
    {subtext && <p className="text-[11px] text-slate-500 font-medium">{subtext}</p>}
  </div>
);

const StatusBadge = ({ status }) => (
  <span className={`inline-flex rounded-md border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${statusStyles[status] || statusStyles.REGISTERED}`}>
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
  
  // Selection State for Bulk Operations
  const [selectedVisitorIds, setSelectedVisitorIds] = useState([]);
  const [lockdownMode, setLockdownMode] = useState(false);
  const [autoApprovalActive, setAutoApprovalActive] = useState(true);

  // Modals
  const [showVisitorModal, setShowVisitorModal] = useState(false);
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [showGatePassModal, setShowGatePassModal] = useState(false);
  const [selectedGatePassVisitor, setSelectedGatePassVisitor] = useState(null);

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
  const insideVisitors = visitors.filter((visitor) => ['CHECKED_IN', 'IN_VISIT'].includes(visitor.status));
  const overstayVisitors = insideVisitors.filter(v => {
    if (!v.checkInTime) return false;
    const hrs = (new Date() - new Date(v.checkInTime)) / (1000 * 60 * 60);
    return hrs > 4;
  });

  const action = async (callback, message) => {
    setError('');
    setSuccess('');
    try {
      await callback();
      setSuccess(message);
      setSelectedVisitorIds([]);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || err.message || 'Action failed');
    }
  };

  // Bulk Operations
  const handleBulkCheckIn = async () => {
    if (selectedVisitorIds.length === 0) return;
    await action(async () => {
      await api.post('/visitors/bulk-check-in', { visitorIds: selectedVisitorIds });
    }, `Successfully checked in ${selectedVisitorIds.length} visitors simultaneously.`);
  };

  const handleBulkCheckOut = async () => {
    if (selectedVisitorIds.length === 0) return;
    await action(async () => {
      await api.post('/visitors/bulk-check-out', { visitorIds: selectedVisitorIds });
    }, `Successfully checked out ${selectedVisitorIds.length} visitors simultaneously.`);
  };

  const handleAutoApproveAllPending = async () => {
    if (pendingAppointments.length === 0) return;
    await action(async () => {
      await Promise.all(pendingAppointments.map(app => api.post(`/appointments/${app._id}/approve`, { notes: 'Automated Admin VIP Approval Rule' })));
    }, `Automated Rule Engine: Approved all ${pendingAppointments.length} pending appointment requests.`);
  };

  const createVisitor = async (event) => {
    event.preventDefault();
    await action(async () => {
      await api.post('/visitors', visitorForm);
      setVisitorForm({ fullName: '', email: '', phone: '', company: '', siteId: '' });
      setShowVisitorModal(false);
    }, 'Visitor registered successfully');
  };

  const createAppointment = async (event) => {
    event.preventDefault();
    await action(async () => {
      await api.post('/appointments', appointmentForm);
      setAppointmentForm({ visitorId: '', siteId: '', scheduledStartTime: '', scheduledEndTime: '', purpose: '' });
      setShowAppointmentModal(false);
    }, 'Appointment request created successfully');
  };

  const reschedule = (id, minutes) => action(
    () => api.post(`/appointments/${id}/reschedule`, { minutes, notes: `Moved ${minutes} minutes later` }),
    `Appointment moved ${minutes} minutes later`
  );

  const handleOpenGatePass = (visitor) => {
    setSelectedGatePassVisitor(visitor);
    setShowGatePassModal(true);
  };

  const exportGateLogCSV = () => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + ["Visitor Code,Name,Email,Company,Check-In,Check-Out,Status"]
        .concat(visitors.map(v => `"${v.visitorCode || ''}","${v.fullName || ''}","${v.email || ''}","${v.company || ''}","${v.checkInTime || ''}","${v.checkOutTime || ''}","${v.status || ''}"`))
        .join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `VMS_Gate_Log_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4 font-sans text-slate-900 bg-slate-50 min-h-screen p-2">
      {/* EXECUTIVE COMMAND CENTER TOPBAR */}
      <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-orange-600 text-white rounded-md flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5" /> Security & Gate Operations Control Center
              </span>
              {lockdownMode && (
                <span className="px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-rose-600 text-white rounded-md animate-pulse flex items-center gap-1">
                  <ShieldAlert className="h-3.5 w-3.5" /> SECURITY LOCKDOWN ACTIVE
                </span>
              )}
            </div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              VMS Security Workbench & Visitor Command
            </h1>
            <p className="text-xs text-slate-500 font-normal">
              Admin decision dashboard for real-time gate pass generation, automated approvals, and simultaneous batch check-ins.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowVisitorModal(true)}
              className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs rounded-lg shadow-2xs transition-colors flex items-center gap-1.5"
            >
              <UserPlus className="h-4 w-4 text-emerald-400" />
              <span>+ Register Visitor</span>
            </button>

            <button
              onClick={() => setShowAppointmentModal(true)}
              className="px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white font-extrabold text-xs rounded-lg shadow-2xs transition-colors flex items-center gap-1.5"
            >
              <Calendar className="h-4 w-4" />
              <span>+ Schedule Appointment</span>
            </button>

            <button
              onClick={exportGateLogCSV}
              className="px-3 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs rounded-lg shadow-2xs transition-colors flex items-center gap-1.5"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              <span>Export CSV</span>
            </button>

            <button
              onClick={() => setLockdownMode(!lockdownMode)}
              className={`px-3 py-2 font-bold text-xs rounded-lg shadow-2xs transition-colors flex items-center gap-1.5 ${
                lockdownMode ? 'bg-rose-600 text-white hover:bg-rose-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              <ShieldAlert className="h-4 w-4" />
              <span>{lockdownMode ? 'Deactivate Lockdown' : 'Trigger Gate Lockdown'}</span>
            </button>

            <button
              onClick={loadData}
              className="p-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs rounded-lg shadow-2xs transition-colors"
              title="Refresh Live Feed"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* WORKFLOW AUTOMATION ENGINE PANEL */}
        <div className="p-3 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white rounded-xl flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-500/20 text-orange-400 rounded-lg">
              <Zap className="h-5 w-5 animate-bounce" />
            </div>
            <div>
              <p className="font-extrabold text-white flex items-center gap-1.5">
                <span>VMS Workflow & Rules Engine</span>
                <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-[10px] font-mono">AUTOMATION ACTIVE</span>
              </p>
              <p className="text-[11px] text-slate-300">
                VIP auto-approval enabled • Automated email dispatch on visitor check-in • Real-time overstay monitoring
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            {pendingAppointments.length > 0 && (
              <button
                onClick={handleAutoApproveAllPending}
                className="w-full md:w-auto px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs rounded-lg shadow-2xs transition-colors flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="h-4 w-4" /> Auto-Approve All ({pendingAppointments.length})
              </button>
            )}

            <button
              onClick={() => setAutoApprovalActive(!autoApprovalActive)}
              className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-colors ${
                autoApprovalActive ? 'bg-slate-700 text-slate-200 border border-slate-600' : 'bg-slate-800 text-slate-400'
              }`}
            >
              <Sliders className="h-3.5 w-3.5" />
              <span>Rules: {autoApprovalActive ? 'ON' : 'OFF'}</span>
            </button>
          </div>
        </div>
      </section>

      {/* FEEDBACK NOTICES */}
      {error && (
        <div className="flex items-center justify-between p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-bold shadow-2xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-600" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError('')} className="text-rose-900 font-extrabold underline">Dismiss</button>
        </div>
      )}

      {success && (
        <div className="flex items-center justify-between p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs font-bold shadow-2xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess('')} className="text-emerald-900 font-extrabold underline">Dismiss</button>
        </div>
      )}

      {/* EXECUTIVE KPI TILES */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <StatTile label="Visitors Today" value={overview.metrics?.todaysVisitors || 0} subtext="Registered & Arrived" icon={Users} colorClass="text-blue-600" />
        <StatTile label="On-Site Active" value={overview.metrics?.currentlyInside || 0} subtext="Checked-In at Gate" icon={UserCheck} colorClass="text-emerald-600" bgClass="bg-emerald-50/30" />
        <StatTile label="Expected Today" value={overview.metrics?.expected || 0} subtext="Scheduled Arrivals" icon={Clock} colorClass="text-cyan-600" />
        <StatTile label="Checked Out" value={overview.metrics?.checkedOut || 0} subtext="Completed Visits" icon={LogOut} colorClass="text-slate-600" />
        <StatTile label="Pending Approvals" value={pendingAppointments.length} subtext="Awaiting Admin Clearance" icon={Bell} colorClass="text-amber-600" bgClass="bg-amber-50/30" />
      </div>

      {/* MAIN WORKBENCH GRID */}
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        {/* LEFT COLUMN: VISITOR & APPOINTMENT DATA WORKBENCH */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-2xs space-y-3">
          {/* TAB BAR & SEARCH CONTROLS */}
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {[
                ['overview', "Today's Gate Log"],
                ['visitors', 'All Visitors'],
                ['checkin', 'Active On-Site'],
                ['appointments', 'Appointments Queue']
              ].map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => { setActiveView(id); setSelectedVisitorIds([]); }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-extrabold transition-all ${
                    activeView === id ? 'bg-orange-600 text-white shadow-2xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="relative w-full lg:w-72">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search visitor code, name, host..."
                className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-xs outline-none focus:border-orange-500 font-medium shadow-2xs"
              />
            </div>
          </div>

          {/* BULK ACTION SELECTION BANNER (Appears when items selected) */}
          {selectedVisitorIds.length > 0 && (
            <div className="mx-4 p-3 bg-slate-900 text-white rounded-xl flex items-center justify-between text-xs shadow-md animate-fade-in">
              <div className="flex items-center gap-2 font-bold">
                <CheckSquare className="h-4 w-4 text-orange-400" />
                <span>Selected {selectedVisitorIds.length} visitor(s) for bulk action</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleBulkCheckIn}
                  className="px-3 py-1 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs rounded-lg transition-colors flex items-center gap-1"
                >
                  <LogIn className="h-3.5 w-3.5" /> Bulk Check-In ({selectedVisitorIds.length})
                </button>
                <button
                  onClick={handleBulkCheckOut}
                  className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1"
                >
                  <LogOut className="h-3.5 w-3.5" /> Bulk Check-Out ({selectedVisitorIds.length})
                </button>
                <button
                  onClick={() => setSelectedVisitorIds([])}
                  className="px-2 py-1 text-slate-400 hover:text-white underline font-medium"
                >
                  Clear Selection
                </button>
              </div>
            </div>
          )}

          {/* TABLE VIEWS */}
          {activeView === 'overview' && (
            <VisitorTable
              visitors={overview.todaysVisitors || []}
              selectedVisitorIds={selectedVisitorIds}
              setSelectedVisitorIds={setSelectedVisitorIds}
              empty="No visitor activity logged for today."
              onCheckIn={(id) => action(() => api.post(`/visitors/${id}/check-in`), 'Visitor checked in at gate')}
              onCheckOut={(id) => action(() => api.post(`/visitors/${id}/check-out`), 'Visitor checked out')}
              onGatePass={handleOpenGatePass}
            />
          )}

          {activeView === 'visitors' && (
            <VisitorTable
              visitors={filteredVisitors}
              selectedVisitorIds={selectedVisitorIds}
              setSelectedVisitorIds={setSelectedVisitorIds}
              empty="No visitors found matching filter."
              onCheckIn={(id) => action(() => api.post(`/visitors/${id}/check-in`), 'Visitor checked in at gate')}
              onCheckOut={(id) => action(() => api.post(`/visitors/${id}/check-out`), 'Visitor checked out')}
              onGatePass={handleOpenGatePass}
            />
          )}

          {activeView === 'checkin' && (
            <VisitorTable
              visitors={insideVisitors.length ? insideVisitors : filteredVisitors}
              selectedVisitorIds={selectedVisitorIds}
              setSelectedVisitorIds={setSelectedVisitorIds}
              empty="No visitors currently active on-site."
              onCheckIn={(id) => action(() => api.post(`/visitors/${id}/check-in`), 'Visitor checked in at gate')}
              onCheckOut={(id) => action(() => api.post(`/visitors/${id}/check-out`), 'Visitor checked out')}
              onGatePass={handleOpenGatePass}
              compact
            />
          )}

          {activeView === 'appointments' && (
            <AppointmentTable
              appointments={appointments}
              onApprove={(id) => action(() => api.post(`/appointments/${id}/approve`, { notes: 'Approved from VMS dashboard' }), 'Appointment approved')}
              onReject={(id) => action(() => api.post(`/appointments/${id}/reject`, { reason: 'Rejected from VMS dashboard' }), 'Appointment rejected')}
              onReschedule={reschedule}
            />
          )}
        </section>

        {/* RIGHT COLUMN: NOTIFICATIONS & APPROVAL QUEUE */}
        <aside className="space-y-4">
          {/* OVERSTAY SECURITY ALERTS PANEL */}
          {overstayVisitors.length > 0 && (
            <section className="rounded-xl border border-rose-200 bg-rose-50 p-4 shadow-2xs space-y-2">
              <div className="flex items-center gap-2 text-rose-800">
                <ShieldAlert className="h-5 w-5 text-rose-600 animate-pulse" />
                <h2 className="text-xs font-black uppercase tracking-wider">Overstay Alert ({overstayVisitors.length})</h2>
              </div>
              <p className="text-[11px] text-rose-700 font-medium">Visitors on-site for more than 4 hours requiring security check:</p>
              <div className="space-y-2 pt-1">
                {overstayVisitors.map(v => (
                  <div key={v._id} className="p-2.5 bg-white border border-rose-200 rounded-lg flex items-center justify-between text-xs shadow-2xs">
                    <div>
                      <p className="font-extrabold text-slate-900">{v.fullName}</p>
                      <p className="text-[10px] text-slate-500 font-mono">Code: {v.visitorCode}</p>
                    </div>
                    <button
                      onClick={() => action(() => api.post(`/visitors/${v._id}/check-out`), `Security check-out executed for ${v.fullName}`)}
                      className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] rounded"
                    >
                      Force Check-Out
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* PENDING APPROVALS QUEUE */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-orange-600" />
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">Pending Approvals ({pendingAppointments.length})</h2>
              </div>
              {pendingAppointments.length > 0 && (
                <span className="px-2 py-0.5 text-[10px] font-black bg-amber-100 text-amber-800 rounded-full">ACTION REQUIRED</span>
              )}
            </div>

            <div className="space-y-2">
              {pendingAppointments.length === 0 ? (
                <p className="text-xs font-medium text-slate-400 italic p-3 text-center bg-slate-50 rounded-lg border border-slate-100">
                  ✓ No pending approvals. All visitors are authorized.
                </p>
              ) : (
                pendingAppointments.slice(0, 5).map((appointment) => (
                  <div key={appointment._id} className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 space-y-2 shadow-2xs">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-xs font-extrabold text-slate-900">{appointment.visitorId?.fullName || 'Visitor'}</p>
                        <p className="text-[11px] font-medium text-slate-600">Company: {appointment.visitorId?.company || 'N/A'}</p>
                        <p className="text-[10px] text-amber-800 font-mono mt-0.5">Time: {formatDateTime(appointment.scheduledStartTime)}</p>
                      </div>
                      <StatusBadge status={appointment.status} />
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-2 border-t border-amber-200/60">
                      <button
                        onClick={() => action(() => api.post(`/appointments/${appointment._id}/approve`, {}), 'Appointment approved')}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] rounded shadow-2xs flex-1 flex items-center justify-center gap-1"
                      >
                        <CheckCircle2 className="h-3 w-3" /> Approve
                      </button>
                      <button
                        onClick={() => reschedule(appointment._id, 15)}
                        className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold text-[10px] rounded"
                      >
                        +15m
                      </button>
                      <button
                        onClick={() => action(() => api.post(`/appointments/${appointment._id}/reject`, {}), 'Appointment rejected')}
                        className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] rounded"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* REAL-TIME SECURITY AUDIT FEED */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-blue-600" />
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">Security Gate Log Feed</h2>
            </div>
            <div className="space-y-2">
              {(overview.notifications || []).length === 0 ? (
                <p className="rounded-lg bg-slate-50 p-3 text-xs font-medium text-slate-400 italic border border-slate-100">No active security log events.</p>
              ) : (
                overview.notifications.map((item) => (
                  <div key={item.id} className="rounded-lg border border-slate-200 p-2.5 space-y-1 text-xs bg-slate-50/50">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-extrabold text-slate-900">{item.visitorName}</p>
                        <p className="text-[10px] text-slate-500 font-medium">Host: {item.hostName} • {formatTime(item.appointmentTime)}</p>
                      </div>
                      <StatusBadge status={item.status} />
                    </div>
                    {item.purpose && <p className="text-[10px] text-slate-500 italic">Purpose: {item.purpose}</p>}
                  </div>
                ))
              )}
            </div>
          </section>
        </aside>
      </div>

      {/* Modal: REGISTER VISITOR */}
      {showVisitorModal && (
        <Modal title="Register New Visitor" onClose={() => setShowVisitorModal(false)}>
          <form onSubmit={createVisitor} className="space-y-3 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Full Name *</label>
              <input required placeholder="e.g. Rahul Sharma" value={visitorForm.fullName} onChange={(e) => setVisitorForm({ ...visitorForm, fullName: e.target.value })} className="w-full rounded-lg border border-slate-300 p-2 text-xs font-medium" />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Work Email *</label>
              <input required type="email" placeholder="e.g. rahul@vendor.com" value={visitorForm.email} onChange={(e) => setVisitorForm({ ...visitorForm, email: e.target.value })} className="w-full rounded-lg border border-slate-300 p-2 text-xs font-medium" />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Phone Number *</label>
              <input required placeholder="+91 9876543210" value={visitorForm.phone} onChange={(e) => setVisitorForm({ ...visitorForm, phone: e.target.value })} className="w-full rounded-lg border border-slate-300 p-2 text-xs font-medium" />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Company / Organization</label>
              <input placeholder="e.g. Acme Corp" value={visitorForm.company} onChange={(e) => setVisitorForm({ ...visitorForm, company: e.target.value })} className="w-full rounded-lg border border-slate-300 p-2 text-xs font-medium" />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Assigned Gate Site *</label>
              <select required value={visitorForm.siteId} onChange={(e) => setVisitorForm({ ...visitorForm, siteId: e.target.value })} className="w-full rounded-lg border border-slate-300 p-2 text-xs font-medium">
                <option value="">Select site</option>
                {sites.map((site) => <option key={site._id} value={site._id}>{site.name} ({site.code})</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button type="button" onClick={() => setShowVisitorModal(false)} className="rounded-lg border border-slate-300 px-3 py-1.5 font-bold text-slate-600">Cancel</button>
              <button type="submit" className="rounded-lg bg-slate-900 px-4 py-1.5 font-bold text-white shadow-2xs">Register Visitor</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: CREATE APPOINTMENT */}
      {showAppointmentModal && (
        <Modal title="Schedule Appointment Request" onClose={() => setShowAppointmentModal(false)}>
          <form onSubmit={createAppointment} className="space-y-3 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Select Visitor *</label>
              <select required value={appointmentForm.visitorId} onChange={(e) => setAppointmentForm({ ...appointmentForm, visitorId: e.target.value })} className="w-full rounded-lg border border-slate-300 p-2 text-xs font-medium">
                <option value="">Select visitor</option>
                {visitors.map((visitor) => <option key={visitor._id} value={visitor._id}>{visitor.fullName} ({visitor.company || 'Individual'})</option>)}
              </select>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Select Target Site *</label>
              <select required value={appointmentForm.siteId} onChange={(e) => setAppointmentForm({ ...appointmentForm, siteId: e.target.value })} className="w-full rounded-lg border border-slate-300 p-2 text-xs font-medium">
                <option value="">Select site</option>
                {sites.map((site) => <option key={site._id} value={site._id}>{site.name} ({site.code})</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Scheduled Start *</label>
                <input required type="datetime-local" value={appointmentForm.scheduledStartTime} onChange={(e) => setAppointmentForm({ ...appointmentForm, scheduledStartTime: e.target.value })} className="w-full rounded-lg border border-slate-300 p-2 text-xs font-medium" />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Scheduled End *</label>
                <input required type="datetime-local" value={appointmentForm.scheduledEndTime} onChange={(e) => setAppointmentForm({ ...appointmentForm, scheduledEndTime: e.target.value })} className="w-full rounded-lg border border-slate-300 p-2 text-xs font-medium" />
              </div>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Purpose of Visit *</label>
              <input required placeholder="e.g. Vendor Audit & Material Inspection" value={appointmentForm.purpose} onChange={(e) => setAppointmentForm({ ...appointmentForm, purpose: e.target.value })} className="w-full rounded-lg border border-slate-300 p-2 text-xs font-medium" />
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button type="button" onClick={() => setShowAppointmentModal(false)} className="rounded-lg border border-slate-300 px-3 py-1.5 font-bold text-slate-600">Cancel</button>
              <button type="submit" className="rounded-lg bg-orange-600 px-4 py-1.5 font-bold text-white shadow-2xs">Create Appointment</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: DIGITAL GATE PASS BADGE */}
      {showGatePassModal && selectedGatePassVisitor && (
        <Modal title="Digital Security Gate Pass" onClose={() => setShowGatePassModal(false)}>
          <div className="space-y-4">
            <div className="bg-gradient-to-tr from-slate-900 via-slate-800 to-slate-900 text-white p-5 rounded-xl border border-slate-700 shadow-xl space-y-4 font-mono">
              <div className="flex items-center justify-between border-b border-slate-700 pb-3">
                <div>
                  <h4 className="text-xs font-black tracking-wider text-orange-400">VENDOROS GATE PASS</h4>
                  <span className="text-[10px] text-slate-400">SECURITY AUTHORIZATION BADGE</span>
                </div>
                <QrCode className="h-9 w-9 text-cyan-400" />
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between border-b border-slate-800 pb-1">
                  <span className="text-slate-400">Pass Serial Code:</span>
                  <span className="text-emerald-400 font-extrabold">{selectedGatePassVisitor.visitorCode || 'VIS-BADGE-1001'}</span>
                </div>
                <div className="flex justify-between border-b border-slate-800 pb-1">
                  <span className="text-slate-400">Visitor Name:</span>
                  <span className="text-white font-extrabold">{selectedGatePassVisitor.fullName}</span>
                </div>
                <div className="flex justify-between border-b border-slate-800 pb-1">
                  <span className="text-slate-400">Company:</span>
                  <span className="text-slate-300 font-semibold">{selectedGatePassVisitor.company || 'Individual / N/A'}</span>
                </div>
                <div className="flex justify-between border-b border-slate-800 pb-1">
                  <span className="text-slate-400">Host Employee:</span>
                  <span className="text-blue-300 font-bold">{selectedGatePassVisitor.hostEmployeeId?.username || 'Admin Host'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Clearance Status:</span>
                  <span className="text-emerald-400 font-extrabold">{selectedGatePassVisitor.status}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs font-bold text-white transition-colors shadow-2xs"
              >
                <Printer className="h-4 w-4" /> Issue / Print Gate Pass
              </button>
              <button
                onClick={() => setShowGatePassModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function VisitorTable({ visitors, selectedVisitorIds = [], setSelectedVisitorIds, empty, onCheckIn, onCheckOut, onGatePass, compact = false }) {
  const allSelected = visitors.length > 0 && visitors.every(v => selectedVisitorIds.includes(v._id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedVisitorIds([]);
    } else {
      setSelectedVisitorIds(visitors.map(v => v._id));
    }
  };

  const toggleSelectOne = (id) => {
    if (selectedVisitorIds.includes(id)) {
      setSelectedVisitorIds(selectedVisitorIds.filter(item => item !== id));
    } else {
      setSelectedVisitorIds([...selectedVisitorIds, id]);
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
          <tr>
            <th className="p-3 w-10 text-center">
              <button onClick={toggleSelectAll} className="text-slate-600 hover:text-slate-900">
                {allSelected ? <CheckSquare className="h-4 w-4 text-orange-600" /> : <Square className="h-4 w-4 text-slate-400" />}
              </button>
            </th>
            <th className="p-3">Visitor Name & Details</th>
            <th className="p-3">Host Employee</th>
            <th className="p-3">Check-In / Out Time</th>
            <th className="p-3">Status</th>
            <th className="p-3 text-center">Security Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200/70 font-medium text-slate-700">
          {visitors.length === 0 ? (
            <tr><td colSpan="6" className="p-8 text-center font-bold text-slate-400">{empty}</td></tr>
          ) : visitors.map((visitor) => {
            const isSelected = selectedVisitorIds.includes(visitor._id);
            return (
              <tr key={visitor._id} className={`hover:bg-slate-50/80 transition-colors ${isSelected ? 'bg-orange-50/40' : ''}`}>
                <td className="p-3 text-center">
                  <button onClick={() => toggleSelectOne(visitor._id)} className="text-slate-600 hover:text-slate-900">
                    {isSelected ? <CheckSquare className="h-4 w-4 text-orange-600" /> : <Square className="h-4 w-4 text-slate-300" />}
                  </button>
                </td>
                <td className="p-3">
                  <p className="font-extrabold text-slate-900">{visitor.fullName}</p>
                  <p className="text-[10px] text-slate-500 font-mono">Code: {visitor.visitorCode || 'N/A'} • {visitor.company || visitor.email}</p>
                </td>
                <td className="p-3 text-slate-600 font-semibold">{visitor.hostEmployeeId?.username || 'System Host'}</td>
                <td className="p-3 text-slate-600 font-mono text-[11px]">
                  {visitor.checkInTime ? `${formatTime(visitor.checkInTime)}${visitor.checkOutTime ? ` ➔ ${formatTime(visitor.checkOutTime)}` : ''}` : <span className="text-slate-400">Not checked in</span>}
                </td>
                <td className="p-3"><StatusBadge status={visitor.status} /></td>
                <td className="p-3 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <button
                      onClick={() => onGatePass(visitor)}
                      className="px-2 py-1 bg-white hover:bg-blue-50 text-blue-600 border border-slate-200 font-bold text-[10px] rounded-lg shadow-2xs flex items-center gap-1"
                    >
                      <QrCode className="h-3 w-3" /> Pass
                    </button>

                    {!['IN_VISIT', 'CHECKED_IN', 'CHECKED_OUT'].includes(visitor.status) && (
                      <button
                        onClick={() => onCheckIn(visitor._id)}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] rounded-lg shadow-2xs flex items-center gap-1"
                      >
                        <LogIn className="h-3 w-3" /> Check in
                      </button>
                    )}

                    {['IN_VISIT', 'CHECKED_IN'].includes(visitor.status) && (
                      <button
                        onClick={() => onCheckOut(visitor._id)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-900 text-white font-bold text-[10px] rounded-lg shadow-2xs flex items-center gap-1"
                      >
                        <LogOut className="h-3 w-3" /> Check out
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AppointmentTable({ appointments, onApprove, onReject, onReschedule }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
          <tr>
            <th className="p-3">Appointment Code</th>
            <th className="p-3">Visitor Name</th>
            <th className="p-3">Host Employee</th>
            <th className="p-3">Scheduled Slot</th>
            <th className="p-3">Status</th>
            <th className="p-3 text-center">Decision Controls</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200/70 font-medium text-slate-700">
          {appointments.length === 0 ? (
            <tr><td colSpan="6" className="p-8 text-center font-bold text-slate-400">No appointment requests found.</td></tr>
          ) : appointments.map((appointment) => (
            <tr key={appointment._id} className="hover:bg-slate-50/80 transition-colors">
              <td className="p-3 font-mono font-extrabold text-blue-600">{appointment.appointmentNumber}</td>
              <td className="p-3 font-bold text-slate-900">{appointment.visitorId?.fullName || 'Visitor'}</td>
              <td className="p-3 text-slate-600 font-semibold">{appointment.hostUserId?.username || 'Admin Host'}</td>
              <td className="p-3 text-slate-600 font-mono text-[11px]">{formatDateTime(appointment.scheduledStartTime)}</td>
              <td className="p-3"><StatusBadge status={appointment.status} /></td>
              <td className="p-3 text-center">
                {appointment.status === 'REQUESTED' ? (
                  <div className="flex items-center justify-center gap-1 flex-wrap">
                    <button onClick={() => onApprove(appointment._id)} className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] rounded flex items-center gap-1 shadow-2xs">
                      <CheckCircle2 className="h-3 w-3" /> Approve
                    </button>
                    <button onClick={() => onReschedule(appointment._id, 15)} className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold text-[10px] rounded">
                      +15m
                    </button>
                    <button onClick={() => onReject(appointment._id)} className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] rounded flex items-center gap-1">
                      <XCircle className="h-3 w-3" /> Reject
                    </button>
                  </div>
                ) : (
                  <span className="text-[10px] font-bold text-slate-400">No Action Required</span>
                )}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl space-y-3 border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <h3 className="text-sm font-extrabold text-slate-950">{title}</h3>
          <button onClick={onClose} className="rounded-md px-2 py-0.5 text-xs font-bold text-slate-400 hover:bg-slate-100 hover:text-slate-700">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
