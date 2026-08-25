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
  ArrowLeft,
  AlertTriangle,
  XCircle,
  UserX,
  UserCheck,
  RotateCcw
} from 'lucide-react';

const UsersAndAccessScope = () => {
  const [users, setUsers] = useState([]);
  const [sites, setSites] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');

  // Edit Scope Modal States (Matching Image 7)
  const [editUserModal, setEditUserModal] = useState(null);
  const [scopeStep, setScopeStep] = useState(1);
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedSiteIds, setSelectedSiteIds] = useState([]);
  const [selectedWarehouseIds, setSelectedWarehouseIds] = useState([]);
  const [mandatoryReason, setMandatoryReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [systemNotice, setSystemNotice] = useState(null);

  // Conflict Resolution Modal State (Matching Image 8)
  const [conflictModal, setConflictModal] = useState(null);

  // Red Warning Banner State (Matching Image 8)
  const [redWarningBanner, setRedWarningBanner] = useState(null);

  // Add User Form State
  const [showAddUserModal, setShowAddUserModal] = useState(false);
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

  // Conflict Detection Logic (Image 8)
  const checkForScopeConflicts = () => {
    if (!editUserModal) return null;
    const currentUserId = String(editUserModal._id);

    for (const wId of selectedWarehouseIds) {
      // Find if another user already holds this warehouse
      const conflictingUser = users.find(u => {
        if (String(u._id) === currentUserId) return false;
        const uWhs = u.warehouseIds ? u.warehouseIds.map(w => String(w._id || w)) : [];
        return uWhs.includes(wId);
      });

      if (conflictingUser) {
        const whObj = warehouses.find(w => String(w._id) === wId);
        return {
          type: 'warehouse',
          resourceName: whObj ? `${whObj.name} (${whObj.code})` : 'Assigned Warehouse',
          resourceId: wId,
          conflictingUser: conflictingUser,
          targetUser: editUserModal
        };
      }
    }
    return null;
  };

  const handleInitiateSaveScope = () => {
    if (!mandatoryReason || !mandatoryReason.trim()) {
      alert('Mandatory audit justification reason is required.');
      return;
    }

    // Run Conflict Detector (Image 8)
    const conflict = checkForScopeConflicts();
    if (conflict) {
      setConflictModal(conflict);
      return;
    }

    // No conflict -> execute direct save
    executeSaveScope(false);
  };

  const executeSaveScope = async (replaceExisting, conflictInfo = null) => {
    setActionLoading(true);
    try {
      if (replaceExisting && conflictInfo) {
        // Remove the conflicting user's scope on this warehouse
        const prevUser = conflictInfo.conflictingUser;
        const updatedPrevWhs = (prevUser.warehouseIds || [])
          .map(w => String(w._id || w))
          .filter(wId => wId !== String(conflictInfo.resourceId));

        await api.put(`/api/admin/users/${prevUser._id}/access`, {
          role: prevUser.role,
          siteIds: prevUser.siteIds ? prevUser.siteIds.map(s => String(s._id || s)) : [],
          warehouseIds: updatedPrevWhs,
          reason: `Scope transferred to ${editUserModal.username || editUserModal.email} by Admin. Justification: ${mandatoryReason.trim()}`
        });

        // Trigger the Prominent Red Warning Banner (Image 8)
        setRedWarningBanner({
          removedUser: prevUser,
          assignedUser: editUserModal,
          resourceName: conflictInfo.resourceName,
          timestamp: new Date()
        });
      }

      // Update target user's scope
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
        title: 'Access Scope Saved & Enforced',
        message: `Updated permissions for ${editUserModal.username || editUserModal.email}.`
      });

      setConflictModal(null);
      setEditUserModal(null);
      setMandatoryReason('');
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || err.response?.data?.message || 'Error updating access scope');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectRequest = async () => {
    if (!editUserModal) return;
    if (!window.confirm(`Are you sure you want to reject the access request for ${editUserModal.username || editUserModal.email}?`)) {
      return;
    }
    setActionLoading(true);
    try {
      await api.put(`/api/users/${editUserModal._id}/reject`, {
        reason: mandatoryReason || 'Rejected by Administrator'
      });
      setSystemNotice({
        type: 'warning',
        title: 'Access Request Rejected',
        message: `Rejected access request for ${editUserModal.username || editUserModal.email}.`
      });
      setEditUserModal(null);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || err.response?.data?.message || 'Error rejecting user request');
    } finally {
      setActionLoading(false);
    }
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = (u.username || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (u.email || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="space-y-6 font-sans">
      {/* Top Banner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl text-white">
        <div>
          <div className="flex items-center space-x-3 mb-1">
            <span className="px-2.5 py-1 text-[10px] font-black uppercase tracking-widest bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-lg">
              Security & Scope
            </span>
            <span className="text-xs text-slate-400">3-Level Granular Location Scope Governance</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight">User Access Scoped Matrix</h1>
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

      {/* RED WARNING ALERT BANNER (Matching Image 8) */}
      {redWarningBanner && (
        <div className="bg-rose-50 border-2 border-rose-400/80 p-5 rounded-2xl shadow-lg text-rose-950 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-slideDown">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-xl bg-rose-200/80 text-rose-700 shrink-0">
              <AlertTriangle className="h-6 w-6 text-rose-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-rose-600 text-white text-[10px] font-black uppercase rounded-md tracking-wider">
                  Access Transferred Warning
                </span>
                <span className="text-xs text-rose-600 font-medium">
                  {new Date(redWarningBanner.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <p className="font-extrabold text-sm text-slate-900 mt-1">
                You have removed <span className="text-rose-700 underline font-black">{redWarningBanner.removedUser.username || redWarningBanner.removedUser.email}</span>'s access and transferred <span className="font-black text-slate-900">{redWarningBanner.resourceName}</span> to <span className="text-emerald-700 underline font-black">{redWarningBanner.assignedUser.username || redWarningBanner.assignedUser.email}</span>.
              </p>
              <p className="text-xs text-slate-600 mt-0.5">
                {redWarningBanner.removedUser.username || redWarningBanner.removedUser.email} can no longer access or approve transactions in this warehouse.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => {
                handleOpenEdit(redWarningBanner.removedUser);
                setRedWarningBanner(null);
              }}
              className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-colors flex items-center gap-1.5"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Give Alternate Scope</span>
            </button>
            <button
              onClick={() => setRedWarningBanner(null)}
              className="p-2 text-slate-400 hover:text-slate-700 text-sm font-bold"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* FILTER & SEARCH BAR */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="relative w-full sm:w-80">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by user name or work email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 font-medium"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="h-4 w-4 text-slate-400" />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 font-bold text-slate-700"
          >
            <option value="ALL">All Roles</option>
            <option value="Admin">Admin</option>
            <option value="Inventory Manager">Inventory Manager</option>
            <option value="Production Manager">Production Manager</option>
            <option value="Warehouse Operator">Warehouse Operator</option>
            <option value="Viewer">Viewer</option>
          </select>
        </div>
      </div>

      {/* SCOPED USER ACCESS TABLE (Matching Image 7 Table Layout) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="p-4">User Name</th>
                <th className="p-4">Work E-Mail</th>
                <th className="p-4">Role</th>
                <th className="p-4">Allowed Sites</th>
                <th className="p-4">Allowed Warehouses</th>
                <th className="p-4 text-right">Manage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400 italic">
                    No users matching criteria.
                  </td>
                </tr>
              ) : (
                filteredUsers.map(user => {
                  const userSiteNames = (user.siteIds || []).map(s => {
                    const sObj = sites.find(site => String(site._id) === String(s._id || s));
                    return sObj ? sObj.name : 'Site';
                  });

                  const userWhNames = (user.warehouseIds || []).map(w => {
                    const wObj = warehouses.find(wh => String(wh._id) === String(w._id || w));
                    return wObj ? wObj.name : 'Warehouse';
                  });

                  const isAdmin = (user.role || '').toLowerCase() === 'admin';

                  return (
                    <tr key={user._id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-4 font-bold text-slate-900 flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center font-black text-slate-700 text-[11px]">
                          {(user.username || user.email || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <span>{user.username || 'Unnamed'}</span>
                          {user.accountStatus === 'PENDING' && (
                            <span className="ml-2 px-1.5 py-0.2 bg-amber-100 text-amber-800 text-[9px] font-black uppercase rounded">
                              Pending
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="p-4 font-mono text-slate-600">{user.email}</td>

                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase ${
                          isAdmin ? 'bg-purple-100 text-purple-800 border border-purple-200' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {user.role}
                        </span>
                      </td>

                      {/* Allowed Sites */}
                      <td className="p-4">
                        {isAdmin ? (
                          <span className="font-extrabold text-purple-700 text-xs">All Sites (Global)</span>
                        ) : userSiteNames.length === 0 ? (
                          <span className="text-slate-400 italic text-[11px]">None assigned</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {userSiteNames.map((name, i) => (
                              <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-[10px] font-bold">
                                {name}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Allowed Warehouses */}
                      <td className="p-4">
                        {isAdmin ? (
                          <span className="font-extrabold text-purple-700 text-xs">All Warehouses (Global)</span>
                        ) : userWhNames.length === 0 ? (
                          <span className="text-slate-400 italic text-[11px]">None assigned</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {userWhNames.map((name, i) => (
                              <span key={i} className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[10px] font-bold">
                                {name}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Manage Button */}
                      <td className="p-4 text-right">
                        <button
                          onClick={() => handleOpenEdit(user)}
                          className="px-3 py-1.5 bg-white border border-slate-200 hover:border-purple-300 hover:bg-purple-50 text-purple-700 font-extrabold rounded-xl shadow-xs transition-colors"
                        >
                          Edit Scope
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* EDIT SCOPE MODAL (Matching Image 7 Modal Blueprint) */}
      {editUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden animate-scaleIn">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="font-black text-slate-900 text-base">Edit User Access Scope</h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  {editUserModal.email} &bull; <span className="font-bold text-purple-700">{editUserModal.role}</span> &bull; <span className="uppercase text-emerald-700 font-bold">{editUserModal.accountStatus}</span>
                </p>
              </div>
              <button onClick={() => setEditUserModal(null)} className="text-slate-400 hover:text-slate-700 text-xl font-bold">✕</button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {/* Role Selection */}
              <div>
                <label className="block font-black uppercase text-[10px] text-slate-500 tracking-wider mb-1.5">Assigned Role</label>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                >
                  <option value="Admin">Admin (Global Platform Oversight)</option>
                  <option value="Inventory Manager">Inventory Manager (Facility Inventory Oversight)</option>
                  <option value="Production Manager">Production Manager (Manufacturing Floor Control)</option>
                  <option value="Warehouse Operator">Warehouse Operator (Stock Movements & Receiving)</option>
                  <option value="QC Inspector">QC Inspector (Quality Gatekeeper)</option>
                  <option value="Planner">Planner (MRP Scheduling)</option>
                  <option value="Viewer">Viewer (Read-Only)</option>
                </select>
              </div>

              {/* Option to Allowed Sites (Matching Image 7) */}
              <div>
                <label className="block font-black uppercase text-[10px] text-slate-500 tracking-wider mb-1.5">Option for Allowed Sites</label>
                <div className="space-y-1.5 max-h-32 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-200">
                  {sites.map(site => {
                    const isChecked = selectedSiteIds.includes(String(site._id));
                    return (
                      <label key={site._id} className="flex items-center gap-2 font-bold text-slate-800 cursor-pointer hover:bg-slate-100 p-1.5 rounded-lg">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleSiteScope(site._id)}
                          className="rounded text-purple-600 focus:ring-purple-500"
                        />
                        <span>{site.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">({site.code})</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Option to Allowed Warehouses (Matching Image 7) */}
              <div>
                <label className="block font-black uppercase text-[10px] text-slate-500 tracking-wider mb-1.5">Option for Allowed Warehouses</label>
                <div className="space-y-1.5 max-h-36 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-200">
                  {warehouses.map(wh => {
                    const isChecked = selectedWarehouseIds.includes(String(wh._id));
                    const parentSite = sites.find(s => String(s._id) === String(wh.siteId?._id || wh.siteId));
                    return (
                      <label key={wh._id} className="flex items-center justify-between font-bold text-slate-800 cursor-pointer hover:bg-slate-100 p-1.5 rounded-lg">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleWarehouseScope(wh._id)}
                            className="rounded text-emerald-600 focus:ring-emerald-500"
                          />
                          <span>{wh.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">({wh.code})</span>
                        </div>
                        {parentSite && (
                          <span className="text-[10px] text-slate-400">{parentSite.name}</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Mandatory Reason (Matching Image 7) */}
              <div>
                <label className="block font-black uppercase text-[10px] text-slate-500 tracking-wider mb-1.5">Audit Justification Reason *</label>
                <textarea
                  rows={2}
                  value={mandatoryReason}
                  onChange={(e) => setMandatoryReason(e.target.value)}
                  placeholder="Explain why this role and scope is being granted or modified..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2.5">
              <div>
                {(editUserModal.accountStatus || '').toUpperCase() === 'PENDING' && (
                  <button
                    onClick={handleRejectRequest}
                    disabled={actionLoading}
                    className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold rounded-xl text-xs transition-colors"
                  >
                    Reject Request
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditUserModal(null)}
                  className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold rounded-xl text-xs"
                >
                  Cancel
                </button>
                <button
                  onClick={handleInitiateSaveScope}
                  disabled={actionLoading}
                  className={`px-5 py-2 text-white font-extrabold rounded-xl shadow-md text-xs transition-colors ${
                    (editUserModal.accountStatus || '').toUpperCase() === 'PENDING'
                      ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/30'
                      : 'bg-purple-600 hover:bg-purple-700 shadow-purple-600/30'
                  }`}
                >
                  {actionLoading
                    ? 'Processing...'
                    : (editUserModal.accountStatus || '').toUpperCase() === 'PENDING'
                    ? '✓ Approve & Grant Role'
                    : 'Save Scope'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CONFLICT RESOLUTION MODAL (Matching Image 8 Blueprint) */}
      {conflictModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl border border-amber-300 max-w-md w-full overflow-hidden animate-scaleIn">
            <div className="p-5 bg-amber-500/10 border-b border-amber-200 flex items-center gap-3">
              <div className="p-2 rounded-xl bg-amber-100 text-amber-800 shrink-0">
                <AlertTriangle className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-sm">Warehouse Assignment Conflict</h3>
                <p className="text-xs text-slate-500 mt-0.5">{conflictModal.resourceName}</p>
              </div>
            </div>

            <div className="p-5 space-y-4 text-xs leading-relaxed text-slate-700">
              <p>
                This facility is already assigned to <strong className="text-slate-900 font-extrabold">{conflictModal.conflictingUser.username || conflictModal.conflictingUser.email}</strong>.
              </p>
              <p className="font-medium text-slate-600">
                How would you like to proceed?
              </p>

              <div className="space-y-2.5">
                {/* Option 1: Co-assignment */}
                <div
                  onClick={() => executeSaveScope(false, conflictModal)}
                  className="p-3.5 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 cursor-pointer transition-all flex items-start gap-3"
                >
                  <UserCheck className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-extrabold text-slate-900">Add Another User (Co-Assignment)</h4>
                    <p className="text-[11px] text-slate-500">Allow both users to manage and access this facility simultaneously.</p>
                  </div>
                </div>

                {/* Option 2: Transfer Ownership */}
                <div
                  onClick={() => executeSaveScope(true, conflictModal)}
                  className="p-3.5 rounded-xl border border-rose-200 bg-rose-50/40 hover:bg-rose-100/50 cursor-pointer transition-all flex items-start gap-3"
                >
                  <UserX className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-extrabold text-rose-900">Transfer Ownership (Remove Existing)</h4>
                    <p className="text-[11px] text-rose-700">Immediately revoke {conflictModal.conflictingUser.username || conflictModal.conflictingUser.email}'s access and assign exclusively to {conflictModal.targetUser.username || conflictModal.targetUser.email}.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
              <button
                onClick={() => setConflictModal(null)}
                className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold rounded-xl text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersAndAccessScope;
