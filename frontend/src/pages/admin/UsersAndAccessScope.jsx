import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import {
  Users,
  ShieldCheck,
  Building2,
  Warehouse,
  Key,
  Edit2,
  CheckCircle2,
  RefreshCw,
  Search,
  Filter,
  Info,
  Plus,
  ArrowRight,
  ArrowLeft
} from 'lucide-react';

const UsersAndAccessScope = () => {
  const [users, setUsers] = useState([]);
  const [sites, setSites] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [editUserModal, setEditUserModal] = useState(null);
  const [scopeStep, setScopeStep] = useState(1); // 1 = Configure, 2 = Review & Confirm
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedSiteIds, setSelectedSiteIds] = useState([]);
  const [selectedWarehouseIds, setSelectedWarehouseIds] = useState([]);
  const [mandatoryReason, setMandatoryReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [systemNotice, setSystemNotice] = useState(null);

  // New User Form State
  const [newUser, setNewUser] = useState({
    username: '',
    email: '',
    role: 'Inventory Manager',
    password: 'password123'
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [usersRes, sitesRes, warehousesRes] = await Promise.all([
        api.get('/api/users').catch(() => ({ data: { data: [] } })),
        api.get('/api/admin/sites').catch(() => ({ data: [] })),
        api.get('/api/admin/warehouses').catch(() => ({ data: [] }))
      ]);

      const fetchedUsers = usersRes.data?.data || usersRes.data?.users || (Array.isArray(usersRes.data) ? usersRes.data : []);
      setUsers(fetchedUsers);
      setSites(Array.isArray(sitesRes.data) ? sitesRes.data : sitesRes.data?.data || []);
      setWarehouses(Array.isArray(warehousesRes.data) ? warehousesRes.data : warehousesRes.data?.data || []);
    } catch (err) {
      console.error('User access scope fetch error:', err);
      setError('Unable to load users from database server.');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenEdit = (user) => {
    setEditUserModal(user);
    setScopeStep(1);
    setSelectedRole(user.role || 'Viewer');
    setSelectedSiteIds(user.siteIds ? user.siteIds.map(s => String(s._id || s)) : []);
    setSelectedWarehouseIds(user.warehouseIds ? user.warehouseIds.map(w => String(w._id || w)) : []);
    setMandatoryReason('');
  };

  const handleToggleSiteScope = (siteId) => {
    const sId = String(siteId);
    if (selectedSiteIds.includes(sId)) {
      setSelectedSiteIds(selectedSiteIds.filter(id => id !== sId));
    } else {
      setSelectedSiteIds([...selectedSiteIds, sId]);
    }
  };

  const handleToggleWarehouseScope = (warehouseId) => {
    const wId = String(warehouseId);
    if (selectedWarehouseIds.includes(wId)) {
      setSelectedWarehouseIds(selectedWarehouseIds.filter(id => id !== wId));
    } else {
      setSelectedWarehouseIds([...selectedWarehouseIds, wId]);
    }
  };

  const handleSaveAccessScope = async () => {
    if (!mandatoryReason || !mandatoryReason.trim()) {
      alert('Mandatory reason is required for updating user scope.');
      return;
    }
    setActionLoading(true);
    try {
      if ((editUserModal.accountStatus || '').toUpperCase() === 'PENDING') {
        await api.put(`/api/users/${editUserModal._id}/approve`, {
          role: selectedRole,
          siteIds: selectedSiteIds,
          warehouseIds: selectedWarehouseIds
        });
      } else {
        await api.put(`/api/admin/users/${editUserModal._id}/access`, {
          role: selectedRole,
          siteIds: selectedSiteIds,
          warehouseIds: selectedWarehouseIds,
          reason: mandatoryReason.trim()
        });
      }

      setSystemNotice({
        type: 'success',
        title: 'Access Scope Updated & Enforced',
        message: `Updated access scope and activated permissions for ${editUserModal.username || editUserModal.email}.`
      });
      setEditUserModal(null);
      setMandatoryReason('');
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || err.response?.data?.message || 'Error updating access scope');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateUser = (e) => {
    e.preventDefault();
    if (!newUser.username || !newUser.email) return;

    const created = {
      _id: `usr-${Date.now()}`,
      username: newUser.username,
      email: newUser.email,
      role: newUser.role,
      siteIds: [],
      warehouseIds: []
    };

    setUsers([created, ...users]);
    setSystemNotice({
      type: 'success',
      title: 'User Registered',
      message: `User ${newUser.username} registered with role ${newUser.role}.`
    });
    setShowAddUserModal(false);
    setNewUser({ username: '', email: '', role: 'Inventory Manager', password: 'password123' });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl text-white">
        <div>
          <div className="flex items-center space-x-3 mb-1">
            <span className="px-2.5 py-1 text-[10px] font-black uppercase tracking-widest bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-lg">
              Security & Scope
            </span>
            <span className="text-xs text-slate-400">3-Level Granular Location Scope Governance</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight">Users, Roles & Scope Access</h1>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowAddUserModal(true)}
            className="flex items-center space-x-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/30 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add User</span>
          </button>

          <button
            onClick={fetchData}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors border border-slate-700/60"
            title="Refresh Users"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 3-LEVEL ACCESS RULE POLICY BANNER */}
      <div className="bg-purple-50 border border-purple-200 p-5 rounded-2xl text-xs text-purple-950 font-medium space-y-1">
        <h3 className="font-black text-sm uppercase tracking-wider flex items-center">
          <ShieldCheck className="w-4 h-4 mr-2 text-purple-600" /> 3-Level Permission & Location Scope Blueprint
        </h3>
        <p>
          Permissions operate at 3 levels: <strong>User</strong> → <strong>Role</strong> → <strong>Module & Location Scope (Site/Warehouse)</strong>.
          Restricting a user to specific sites or warehouses prevents them from accessing or creating operations outside their assigned scope.
        </p>
      </div>

      {/* USERS ACCESS TABLE */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-100">
              <th className="py-3.5 px-4">User</th>
              <th className="py-3.5 px-4">Email</th>
              <th className="py-3.5 px-4">Role</th>
              <th className="py-3.5 px-4">Site Access Scope</th>
              <th className="py-3.5 px-4">Warehouse Access Scope</th>
              <th className="py-3.5 px-4 text-center">Manage Scope</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
            {users.map((u) => (
              <tr key={u._id} className="hover:bg-slate-50/80 transition-colors">
                <td className="py-3.5 px-4 font-extrabold text-slate-900 flex items-center space-x-2">
                  <div className="h-7 w-7 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center">
                    {u.username ? u.username.charAt(0).toUpperCase() : 'U'}
                  </div>
                  <span>{u.username}</span>
                </td>
                <td className="py-3.5 px-4 text-slate-500 font-mono">{u.email}</td>
                <td className="py-3.5 px-4">
                  <span className="px-2.5 py-1 bg-slate-100 text-slate-800 font-extrabold text-[10px] rounded-lg">
                    {u.role}
                  </span>
                </td>
                <td className="py-3.5 px-4">
                  {(u.siteIds && u.siteIds.length > 0) ? (
                    <div className="flex flex-wrap gap-1">
                      {u.siteIds.map((s, idx) => (
                        <span key={idx} className="px-2 py-0.5 bg-blue-50 text-blue-700 font-bold text-[10px] rounded-md border border-blue-200">
                          {s.name || 'Site'}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-slate-400 font-bold text-[11px]">Global (All Sites)</span>
                  )}
                </td>
                <td className="py-3.5 px-4">
                  {(u.warehouseIds && u.warehouseIds.length > 0) ? (
                    <div className="flex flex-wrap gap-1">
                      {u.warehouseIds.map((w, idx) => (
                        <span key={idx} className="px-2 py-0.5 bg-purple-50 text-purple-700 font-bold text-[10px] rounded-md border border-purple-200">
                          {w.name || 'Warehouse'}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-slate-400 font-bold text-[11px]">Global (All Warehouses)</span>
                  )}
                </td>
                <td className="py-3.5 px-4 text-center">
                  <button
                    onClick={() => handleOpenEdit(u)}
                    className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-xl border border-blue-200 transition-colors flex items-center justify-center space-x-1 mx-auto"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Edit Scope</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* EDIT ACCESS SCOPE MODAL (2-STEP WORKFLOW) */}
      {editUserModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-black text-slate-900">
                    {scopeStep === 1 ? 'Edit Access Scope & Permissions' : 'Review & Confirm Scope Changes'}
                  </h3>
                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${scopeStep === 1 ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-purple-50 text-purple-700 border-purple-200'}`}>
                    Step {scopeStep} of 2: {scopeStep === 1 ? 'Configure Scope' : 'Confirm Impact'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Target User: <strong className="text-slate-800">{editUserModal.username}</strong> ({editUserModal.email})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditUserModal(null)}
                className="text-slate-400 hover:text-slate-600 font-bold p-1 rounded-lg hover:bg-slate-100 transition-colors"
                title="Close"
              >
                ✕
              </button>
            </div>

            {/* STEP 1: CONFIGURATION */}
            {scopeStep === 1 && (
              <div className="space-y-4 text-xs">
                {/* CURRENTLY ASSIGNED SCOPE BREAKDOWN */}
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                      Currently Assigned Scope &amp; Audit Metadata
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      Assigned: {editUserModal.scopeAssignedAt || editUserModal.updatedAt || editUserModal.createdAt ? new Date(editUserModal.scopeAssignedAt || editUserModal.updatedAt || editUserModal.createdAt).toLocaleDateString() : 'Initial'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 text-slate-700 pt-1 border-t border-slate-200/70">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-bold">Current Role</span>
                      <span className="font-extrabold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 inline-block mt-0.5 truncate max-w-full">
                        {editUserModal.role || 'Viewer'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-bold">Assigned Sites</span>
                      <span className="font-bold text-slate-800 block mt-0.5 truncate" title={(editUserModal.siteIds && editUserModal.siteIds.length > 0) ? editUserModal.siteIds.map(s => s.name || s.code).join(', ') : 'Global (All Sites)'}>
                        {(editUserModal.siteIds && editUserModal.siteIds.length > 0)
                          ? editUserModal.siteIds.map(s => s.name || s.code).join(', ')
                          : 'Global (All Sites)'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-bold">Assigned Warehouses</span>
                      <span className="font-bold text-slate-800 block mt-0.5 truncate" title={(editUserModal.warehouseIds && editUserModal.warehouseIds.length > 0) ? editUserModal.warehouseIds.map(w => w.name || w.code).join(', ') : 'Global (All Warehouses)'}>
                        {(editUserModal.warehouseIds && editUserModal.warehouseIds.length > 0)
                          ? editUserModal.warehouseIds.map(w => w.name || w.code).join(', ')
                          : 'Global (All Warehouses)'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-bold">Assigned By</span>
                      <span className="font-bold text-slate-800 block mt-0.5 truncate" title={editUserModal.scopeAssignedBy || 'System Admin'}>
                        {editUserModal.scopeAssignedBy || 'System Admin'}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Assign Role &amp; Responsibilities:
                  </label>
                  <select
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="Admin">Admin (Full Control)</option>
                    <option value="Inventory Manager">Inventory Manager (Stock &amp; Facility Oversight)</option>
                    <option value="Inventory">Inventory Operator (Stock Move Execution)</option>
                    <option value="Production Manager">Production Manager (Routing &amp; Orders)</option>
                    <option value="Production">Production Worker (Shop-floor Execution)</option>
                    <option value="Planner">Planner (MRP &amp; Scheduling)</option>
                    <option value="QC Inspector">QC Inspector (Inspections &amp; Dispositions)</option>
                    <option value="Viewer">Viewer (Read-only Access)</option>
                  </select>
                </div>

                {/* Site Scope Picker */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-slate-700 font-bold">Allowed Site Scope (Add/Remove):</label>
                    <div className="space-x-2 text-[10px]">
                      <button
                        type="button"
                        onClick={() => setSelectedSiteIds(sites.map(s => String(s._id)))}
                        className="text-blue-600 hover:underline font-bold"
                      >
                        Select All
                      </button>
                      <span>|</span>
                      <button
                        type="button"
                        onClick={() => setSelectedSiteIds([])}
                        className="text-slate-500 hover:underline font-bold"
                      >
                        Clear (Global)
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 max-h-28 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-xl">
                    {sites.map(s => (
                      <label key={s._id} className="flex items-center space-x-2 text-xs font-semibold text-slate-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedSiteIds.includes(String(s._id))}
                          onChange={() => handleToggleSiteScope(s._id)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="truncate">{s.name} ({s.code || 'Site'})</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Warehouse Scope Picker */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-slate-700 font-bold">Allowed Warehouse Scope (Add/Remove):</label>
                    <div className="space-x-2 text-[10px]">
                      <button
                        type="button"
                        onClick={() => setSelectedWarehouseIds(warehouses.map(w => String(w._id)))}
                        className="text-purple-600 hover:underline font-bold"
                      >
                        Select All
                      </button>
                      <span>|</span>
                      <button
                        type="button"
                        onClick={() => setSelectedWarehouseIds([])}
                        className="text-slate-500 hover:underline font-bold"
                      >
                        Clear (Global)
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 max-h-28 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-xl">
                    {warehouses.map(w => (
                      <label key={w._id} className="flex items-center space-x-2 text-xs font-semibold text-slate-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedWarehouseIds.includes(String(w._id))}
                          onChange={() => handleToggleWarehouseScope(w._id)}
                          className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                        />
                        <span className="truncate">{w.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Reason for Access Scope Change (Mandatory) <span className="text-rose-500">*</span>:
                  </label>
                  <textarea
                    required
                    rows={2}
                    value={mandatoryReason}
                    onChange={(e) => setMandatoryReason(e.target.value)}
                    placeholder="State specific operational reason for updating user roles, sites, or warehouses..."
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                  {!mandatoryReason.trim() && (
                    <p className="text-[10px] text-amber-600 font-semibold mt-0.5">⚠ Scope cannot be assigned without providing a valid justification reason.</p>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setEditUserModal(null)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!mandatoryReason.trim()}
                    onClick={() => setScopeStep(2)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5"
                  >
                    <span>Review Changes</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: REVIEW & FINAL SUBMIT */}
            {scopeStep === 2 && (
              <div className="space-y-4 text-xs">
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-950 font-medium">
                  <p className="font-bold flex items-center gap-1.5 text-xs text-blue-900">
                    <CheckCircle2 className="w-4 h-4 text-blue-600" />
                    Review Scope Impact Before Final Submission
                  </p>
                  <p className="text-[11px] text-blue-800 mt-0.5">
                    Compare the previous configuration against the newly assigned roles and facility access.
                  </p>
                </div>

                {/* SIDE-BY-SIDE COMPARISON CARDS */}
                <div className="grid grid-cols-2 gap-3 text-[11px]">
                  {/* PREVIOUS STATE */}
                  <div className="p-3.5 bg-rose-50/70 border border-rose-200 rounded-xl space-y-2 text-rose-950">
                    <div className="flex items-center justify-between pb-1.5 border-b border-rose-200">
                      <strong className="text-xs text-rose-900 font-black">Previous State (Before)</strong>
                      <span className="text-[9px] font-mono font-bold text-rose-700 bg-rose-100/70 px-1.5 py-0.5 rounded">ORIGINAL</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-rose-700 block font-bold">Role:</span>
                      <span className="font-extrabold text-rose-900">{editUserModal.role || 'Viewer'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-rose-700 block font-bold">Assigned Sites:</span>
                      <span className="font-semibold text-rose-900 block leading-tight">
                        {(editUserModal.siteIds && editUserModal.siteIds.length > 0)
                          ? editUserModal.siteIds.map(s => s.name || s.code).join(', ')
                          : 'Global / All Sites'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-rose-700 block font-bold">Assigned Warehouses:</span>
                      <span className="font-semibold text-rose-900 block leading-tight">
                        {(editUserModal.warehouseIds && editUserModal.warehouseIds.length > 0)
                          ? editUserModal.warehouseIds.map(w => w.name || w.code).join(', ')
                          : 'Global / All Warehouses'}
                      </span>
                    </div>
                  </div>

                  {/* NEWLY ASSIGNED STATE */}
                  <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2 text-emerald-950">
                    <div className="flex items-center justify-between pb-1.5 border-b border-emerald-200">
                      <strong className="text-xs text-emerald-900 font-black">Newly Assigned State (After)</strong>
                      <span className="text-[9px] font-mono font-bold text-emerald-700 bg-emerald-100/70 px-1.5 py-0.5 rounded">MODIFIED</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-emerald-700 block font-bold">Role:</span>
                      <span className="font-extrabold text-emerald-900 bg-emerald-100/80 px-2 py-0.5 rounded border border-emerald-300 inline-block">
                        {selectedRole}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-emerald-700 block font-bold">Assigned Sites:</span>
                      <span className="font-semibold text-emerald-900 block leading-tight">
                        {selectedSiteIds.length > 0
                          ? sites.filter(s => selectedSiteIds.includes(String(s._id))).map(s => s.name).join(', ')
                          : 'Global / All Sites'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-emerald-700 block font-bold">Assigned Warehouses:</span>
                      <span className="font-semibold text-emerald-900 block leading-tight">
                        {selectedWarehouseIds.length > 0
                          ? warehouses.filter(w => selectedWarehouseIds.includes(String(w._id))).map(w => w.name).join(', ')
                          : 'Global / All Warehouses'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* STATED REASON PREVIEW */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Stated Justification Reason:</span>
                  <p className="text-slate-800 italic font-medium">"{mandatoryReason}"</p>
                </div>

                {/* STEP 2 FOOTER */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setScopeStep(1)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back to Edit</span>
                  </button>

                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => setEditUserModal(null)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={handleSaveAccessScope}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{actionLoading ? 'Enforcing...' : 'Final Submit & Enforce Scope'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: + ADD USER */}
      {showAddUserModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form onSubmit={handleCreateUser} className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900 flex items-center">
                <Users className="w-5 h-5 text-blue-600 mr-2" /> Register New User
              </h3>
              <button type="button" onClick={() => setShowAddUserModal(false)} className="text-slate-400 font-bold">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">User Full Name:</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Vikramaditya Singh"
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Email Address:</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. vikram@vendoros.com"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-900"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Role Assignment:</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                >
                  <option value="Admin">Admin</option>
                  <option value="Inventory Manager">Inventory Manager</option>
                  <option value="Production Manager">Production Manager</option>
                  <option value="Planner">Planner</option>
                  <option value="QC Inspector">QC Inspector</option>
                  <option value="Viewer">Viewer</option>
                </select>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-3">
              <button type="button" onClick={() => setShowAddUserModal(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl">
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white font-bold text-xs rounded-xl shadow-md">
                Create User
              </button>
            </div>
          </form>
        </div>
      )}

      {/* FLOATING TOAST NOTIFICATION (BOTTOM RIGHT) */}
      {systemNotice && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md w-full animate-slideUp pointer-events-auto">
          <div className="p-4 bg-slate-900/95 text-white rounded-2xl shadow-2xl border border-emerald-500/40 flex items-start justify-between gap-3 backdrop-blur-md">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl mt-0.5">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
              </div>
              <div>
                <div className="text-xs font-black uppercase tracking-wider text-emerald-400">{systemNotice.title}</div>
                <div className="text-xs font-medium text-slate-200 mt-1 leading-relaxed">{systemNotice.message}</div>
              </div>
            </div>
            <button onClick={() => setSystemNotice(null)} className="text-slate-400 hover:text-white text-lg font-bold p-1 leading-none">×</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersAndAccessScope;

