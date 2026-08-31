import React, { useState, useEffect, useMemo } from 'react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import {
  Users,
  Search,
  Plus,
  RefreshCw,
  Edit2,
  UserCheck,
  UserX,
  Shield,
  Building2,
  Warehouse,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet
} from 'lucide-react';

const ROLE_OPTIONS = [
  'Admin',
  'Inventory Manager',
  'Production Manager',
  'Warehouse Operator',
  'QC Inspector',
  'Planner',
  'Viewer'
];

export default function UsersAndAccessScope() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [sites, setSites] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals & Dialogs
  const [editUserModal, setEditUserModal] = useState(null);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [confirmToggleUser, setConfirmToggleUser] = useState(null);
  const [conflictModal, setConflictModal] = useState(null);
  const [toastNotice, setToastNotice] = useState(null);

  // Edit Scope form state
  const [selectedRole, setSelectedRole] = useState('Viewer');
  const [selectedSiteIds, setSelectedSiteIds] = useState([]);
  const [selectedWarehouseIds, setSelectedWarehouseIds] = useState([]);
  const [mandatoryReason, setMandatoryReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Add User form state
  const [newUserForm, setNewUserForm] = useState({
    username: '',
    email: '',
    role: 'Inventory Manager',
    password: 'password123',
    siteIds: [],
    warehouseIds: []
  });
  const [addUserLoading, setAddUserLoading] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
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
      setToastNotice({ type: 'error', text: 'Unable to load user registry.' });
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Summary Metrics
  const metrics = useMemo(() => {
    const total = users.length;
    const active = users.filter(u => {
      const st = (u.accountStatus || 'ACTIVE').toUpperCase();
      return (st === 'ACTIVE' || u.isActive) && st !== 'DEACTIVATED' && st !== 'INACTIVE';
    }).length;
    const pending = users.filter(u => (u.accountStatus || '').toUpperCase() === 'PENDING').length;
    const deactivated = total - active - pending;
    const adminCount = users.filter(u => u.role === 'Admin' && ((u.accountStatus || 'ACTIVE').toUpperCase() === 'ACTIVE' || u.isActive)).length;
    return { total, active, pending, deactivated, adminCount };
  }, [users]);

  // Lookup maps for fast lookup
  const siteMap = useMemo(() => {
    const m = new Map();
    sites.forEach(s => m.set(String(s._id), s.name || s.code || 'Site'));
    return m;
  }, [sites]);

  const warehouseMap = useMemo(() => {
    const m = new Map();
    warehouses.forEach(w => m.set(String(w._id), w.name || w.code || 'Warehouse'));
    return m;
  }, [warehouses]);

  // Filtered Flat Users List (Excel-style)
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q ||
        (u.username || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q);

      const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;

      const status = (u.accountStatus || 'ACTIVE').toUpperCase();
      const isPending = status === 'PENDING';
      const isDeactivated = status === 'DEACTIVATED' || status === 'INACTIVE' || u.isActive === false;
      const isActive = !isPending && !isDeactivated;

      const matchesStatus = statusFilter === 'ALL' ? true :
        statusFilter === 'ACTIVE' ? isActive :
        statusFilter === 'PENDING' ? isPending :
        statusFilter === 'DEACTIVATED' ? isDeactivated : true;

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, searchQuery, roleFilter, statusFilter]);

  // Scope Handlers
  const handleOpenEdit = (user) => {
    setEditUserModal(user);
    setSelectedRole(user.role || 'Viewer');
    setSelectedSiteIds(user.siteIds ? user.siteIds.map(s => String(s._id || s)) : []);
    setSelectedWarehouseIds(user.warehouseIds ? user.warehouseIds.map(w => String(w._id || w)) : []);
    setMandatoryReason('');
  };

  const handleToggleSiteScope = (siteId) => {
    const sId = String(siteId);
    setSelectedSiteIds(prev => prev.includes(sId) ? prev.filter(id => id !== sId) : [...prev, sId]);
  };

  const handleToggleWarehouseScope = (warehouseId) => {
    const wId = String(warehouseId);
    setSelectedWarehouseIds(prev => prev.includes(wId) ? prev.filter(id => id !== wId) : [...prev, wId]);
  };

  const checkForScopeConflicts = () => {
    if (!editUserModal) return null;
    const currentUserId = String(editUserModal._id);

    for (const wId of selectedWarehouseIds) {
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
          conflictingUser,
          targetUser: editUserModal
        };
      }
    }
    return null;
  };

  const handleInitiateSaveScope = () => {
    if (!mandatoryReason.trim()) {
      alert('Audit justification reason is required.');
      return;
    }
    const conflict = checkForScopeConflicts();
    if (conflict) {
      setConflictModal(conflict);
      return;
    }
    executeSaveScope(false);
  };

  const executeSaveScope = async (replaceExisting, conflictInfo = null) => {
    setActionLoading(true);
    try {
      if (replaceExisting && conflictInfo) {
        const prevUser = conflictInfo.conflictingUser;
        const updatedPrevWhs = (prevUser.warehouseIds || [])
          .map(w => String(w._id || w))
          .filter(wId => wId !== String(conflictInfo.resourceId));

        await api.put(`/api/admin/users/${prevUser._id}/access`, {
          role: prevUser.role,
          siteIds: prevUser.siteIds ? prevUser.siteIds.map(s => String(s._id || s)) : [],
          warehouseIds: updatedPrevWhs,
          reason: `Scope transferred to ${editUserModal.username || editUserModal.email} by Admin.`
        });
      }

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

      setToastNotice({
        type: 'success',
        text: `✓ Permissions saved for ${editUserModal.username || editUserModal.email}.`
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

  // Toggle User Status
  const handleToggleUserStatus = async () => {
    if (!confirmToggleUser) return;
    try {
      await api.put(`/api/admin/users/${confirmToggleUser._id}/toggle-status`);
      setToastNotice({
        type: 'success',
        text: `✓ User ${confirmToggleUser.username || confirmToggleUser.email} status updated.`
      });
      setConfirmToggleUser(null);
      fetchData();
    } catch (err) {
      setToastNotice({
        type: 'error',
        text: err.response?.data?.message || 'Failed to update user status.'
      });
    }
  };

  // Create User
  const handleCreateNewUser = async (e) => {
    e.preventDefault();
    setAddUserLoading(true);
    try {
      const res = await api.post('/api/auth/register-sync', {
        username: newUserForm.username.trim(),
        email: newUserForm.email.trim().toLowerCase(),
        password: newUserForm.password,
        role: newUserForm.role,
        siteIds: newUserForm.siteIds,
        warehouseIds: newUserForm.warehouseIds
      });

      if (res.data?.success || res.status === 201 || res.status === 200) {
        setToastNotice({
          type: 'success',
          text: `✓ User account created for ${newUserForm.email}.`
        });
        setShowAddUserModal(false);
        setNewUserForm({
          username: '',
          email: '',
          role: 'Inventory Manager',
          password: 'password123',
          siteIds: [],
          warehouseIds: []
        });
        fetchData();
      }
    } catch (err) {
      alert(err.response?.data?.error || err.response?.data?.message || 'Failed to create user');
    } finally {
      setAddUserLoading(false);
    }
  };

  // Export User Table to CSV
  const exportUsersCSV = () => {
    if (!filteredUsers.length) {
      alert('No user records to export.');
      return;
    }
    const headers = ['#', 'Username', 'Email', 'Role', 'Allowed Sites', 'Allowed Warehouses', 'Status', 'Created At'];
    const rows = filteredUsers.map((u, i) => {
      const sNames = (u.siteIds || []).map(s => siteMap.get(String(s._id || s)) || 'Site').join('; ') || 'Global';
      const wNames = (u.warehouseIds || []).map(w => warehouseMap.get(String(w._id || w)) || 'Warehouse').join('; ') || 'Global';
      const st = (u.accountStatus || 'ACTIVE').toUpperCase();
      return [
        i + 1,
        `"${u.username || ''}"`,
        `"${u.email || ''}"`,
        `"${u.role || ''}"`,
        `"${sNames}"`,
        `"${wNames}"`,
        `"${st}"`,
        `"${u.createdAt ? new Date(u.createdAt).toISOString().split('T')[0] : ''}"`
      ].join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Users_Master_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-2 font-sans text-slate-900 w-full">
      {/* 1-ROW COMPACT SUMMARY & CONTROLS */}
      <div className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 flex flex-wrap items-center justify-between gap-3 text-xs shadow-2xs">
        {/* Left Metric Strip */}
        <div className="flex flex-wrap items-center gap-4 text-slate-600 font-medium">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase text-slate-500">Users:</span>
            <span className="font-extrabold text-slate-900">{metrics.total}</span>
          </div>
          <div className="h-3 w-px bg-slate-200" />
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase text-slate-500">Active:</span>
            <span className="font-extrabold text-slate-900">{metrics.active}</span>
          </div>
          {metrics.pending > 0 && (
            <>
              <div className="h-3 w-px bg-slate-200" />
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase text-slate-500">Pending:</span>
                <span className="font-extrabold text-slate-900">{metrics.pending}</span>
              </div>
            </>
          )}
          {metrics.deactivated > 0 && (
            <>
              <div className="h-3 w-px bg-slate-200" />
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase text-slate-500">Deactivated:</span>
                <span className="font-extrabold text-slate-900">{metrics.deactivated}</span>
              </div>
            </>
          )}
        </div>

        {/* Right Search, Filters & Actions */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="relative w-44 sm:w-56">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search user or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-2.5 py-1 bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-400 font-medium text-xs text-slate-900"
            />
          </div>

          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="py-1 px-2 border border-slate-200 rounded-md text-xs bg-white font-bold text-slate-700 focus:outline-none"
          >
            <option value="ALL">All Roles</option>
            {ROLE_OPTIONS.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="py-1 px-2 border border-slate-200 rounded-md text-xs bg-white font-bold text-slate-700 focus:outline-none"
          >
            <option value="ALL">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="PENDING">Pending</option>
            <option value="DEACTIVATED">Deactivated</option>
          </select>

          <button
            onClick={exportUsersCSV}
            className="px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-md shadow-2xs transition-colors flex items-center gap-1"
            title="Export CSV"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Export</span>
          </button>

          <button
            onClick={() => setShowAddUserModal(true)}
            className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-md shadow-2xs transition-all flex items-center gap-1"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add User</span>
          </button>

          <button
            onClick={fetchData}
            className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors"
            title="Refresh"
            aria-label="Refresh user registry"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* SPREADSHEET-STYLE EXCEL DATA GRID */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-2xs overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-xs border-collapse min-w-[950px]">
            <thead className="bg-slate-100/90 text-slate-700 font-bold uppercase text-[10px] tracking-tight border-b border-slate-300 select-none">
              <tr>
                <th className="px-3 py-2 w-10 text-center border-r border-slate-200">#</th>
                <th className="px-3 py-2 border-r border-slate-200">User / Username</th>
                <th className="px-3 py-2 border-r border-slate-200">Work Email</th>
                <th className="px-3 py-2 border-r border-slate-200">Role</th>
                <th className="px-3 py-2 border-r border-slate-200">Allowed Sites</th>
                <th className="px-3 py-2 border-r border-slate-200">Allowed Warehouses</th>
                <th className="px-3 py-2 text-center border-r border-slate-200 whitespace-nowrap">Status</th>
                <th className="px-3 py-2 text-center border-r border-slate-200 whitespace-nowrap">Created</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-medium">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400 italic text-xs">
                    {loading ? 'Loading user data...' : 'No users match the specified search or filter criteria.'}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u, index) => {
                  const status = (u.accountStatus || 'ACTIVE').toUpperCase();
                  const isPending = status === 'PENDING';
                  const isDeactivated = status === 'DEACTIVATED' || status === 'INACTIVE' || u.isActive === false;
                  const isSelf = String(u._id) === String(currentUser?._id);
                  const isLastAdmin = u.role === 'Admin' && metrics.adminCount <= 1;

                  let disabledToggleReason = null;
                  if (isSelf) disabledToggleReason = 'Cannot deactivate own account';
                  else if (isLastAdmin && !isDeactivated) disabledToggleReason = 'Cannot deactivate last remaining Administrator';

                  // Site names
                  const siteList = (u.siteIds || []).map(s => siteMap.get(String(s._id || s)) || 'Site');
                  // Warehouse names
                  const whList = (u.warehouseIds || []).map(w => warehouseMap.get(String(w._id || w)) || 'Warehouse');

                  const formattedDate = u.createdAt
                    ? new Date(u.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                    : '—';

                  return (
                    <tr key={u._id} className="hover:bg-slate-50/90 transition-colors">
                      {/* Index */}
                      <td className="px-3 py-1.5 text-center font-mono text-[11px] text-slate-400 border-r border-slate-200 select-none">
                        {index + 1}
                      </td>

                      {/* Username */}
                      <td className="px-3 py-1.5 font-bold text-slate-900 border-r border-slate-200 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-[10px] uppercase shrink-0">
                            {(u.username || u.email || 'U').charAt(0)}
                          </span>
                          <span className="truncate">{u.username || 'Unnamed'}</span>
                          {isSelf && (
                            <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-slate-200 text-slate-700">
                              You
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Email */}
                      <td className="px-3 py-1.5 font-mono text-slate-700 border-r border-slate-200 whitespace-nowrap text-[11px]">
                        {u.email}
                      </td>

                      {/* Role */}
                      <td className="px-3 py-1.5 border-r border-slate-200 whitespace-nowrap font-bold text-slate-800">
                        {u.role}
                      </td>

                      {/* Allowed Sites */}
                      <td className="px-3 py-1.5 border-r border-slate-200 text-[11px] text-slate-700 max-w-[200px] truncate" title={siteList.join(', ') || 'All Sites'}>
                        {siteList.length === 0 ? (
                          <span className="text-slate-400 italic">All Sites</span>
                        ) : (
                          siteList.join(', ')
                        )}
                      </td>

                      {/* Allowed Warehouses */}
                      <td className="px-3 py-1.5 border-r border-slate-200 text-[11px] text-slate-700 max-w-[220px] truncate" title={whList.join(', ') || 'All Warehouses'}>
                        {whList.length === 0 ? (
                          <span className="text-slate-400 italic">All Warehouses</span>
                        ) : (
                          whList.join(', ')
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-3 py-1.5 text-center border-r border-slate-200 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-extrabold uppercase border ${
                          isPending
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : isDeactivated
                              ? 'bg-rose-50 text-rose-800 border-rose-200'
                              : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        }`}>
                          {isPending ? 'Pending' : isDeactivated ? 'Deactivated' : 'Active'}
                        </span>
                      </td>

                      {/* Created */}
                      <td className="px-3 py-1.5 text-center font-mono text-[11px] text-slate-500 border-r border-slate-200 whitespace-nowrap">
                        {formattedDate}
                      </td>

                      {/* Inline Actions */}
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1 select-none">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(u)}
                            className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded text-[10px] flex items-center gap-1 transition-colors"
                            title={`Edit scope for ${u.username || u.email}`}
                          >
                            <Edit2 className="h-3 w-3" />
                            <span>Edit</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setConfirmToggleUser(u)}
                            disabled={!!disabledToggleReason}
                            title={disabledToggleReason || (isDeactivated ? 'Activate User' : 'Deactivate User')}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 transition-colors ${
                              disabledToggleReason
                                ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                                : isDeactivated
                                  ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800'
                                  : 'bg-rose-100 hover:bg-rose-200 text-rose-800'
                            }`}
                          >
                            {isDeactivated ? <UserCheck className="h-3 w-3" /> : <UserX className="h-3 w-3" />}
                            <span>{isDeactivated ? 'Activate' : 'Deactivate'}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CONFIRM STATUS TOGGLE DIALOG */}
      <ConfirmDialog
        isOpen={!!confirmToggleUser}
        onClose={() => setConfirmToggleUser(null)}
        onConfirm={handleToggleUserStatus}
        title={((confirmToggleUser?.accountStatus || 'ACTIVE').toUpperCase() === 'ACTIVE' || confirmToggleUser?.isActive) ? 'Deactivate User Account' : 'Activate User Account'}
        message={`Are you sure you want to change the status of "${confirmToggleUser?.username || confirmToggleUser?.email}"? All audit logs and historical transactions remain intact.`}
        confirmText="Confirm Change"
        isDestructive={((confirmToggleUser?.accountStatus || 'ACTIVE').toUpperCase() === 'ACTIVE' || confirmToggleUser?.isActive)}
      />

      {/* MODAL: EDIT USER ACCESS SCOPE */}
      {editUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden animate-scaleIn">
            <div className="p-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-900 text-xs">Edit User Permissions &amp; Scope</h3>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">{editUserModal.email}</p>
              </div>
              <button onClick={() => setEditUserModal(null)} className="text-slate-400 hover:text-slate-700 text-sm font-bold">✕</button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold uppercase text-[9px] text-slate-500 tracking-wider mb-1">Role</label>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md font-bold text-slate-900"
                >
                  {ROLE_OPTIONS.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold uppercase text-[9px] text-slate-500 tracking-wider mb-1">Allowed Sites (Empty = Global / All Sites)</label>
                <div className="space-y-1 max-h-28 overflow-y-auto p-1.5 bg-slate-50 rounded border border-slate-200">
                  {sites.map(site => (
                    <label key={site._id} className="flex items-center gap-2 font-bold text-slate-800 cursor-pointer p-1 rounded hover:bg-slate-100">
                      <input
                        type="checkbox"
                        checked={selectedSiteIds.includes(String(site._id))}
                        onChange={() => handleToggleSiteScope(site._id)}
                        className="rounded text-slate-900"
                      />
                      <span>{site.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-bold uppercase text-[9px] text-slate-500 tracking-wider mb-1">Allowed Warehouses (Empty = Global / All Warehouses)</label>
                <div className="space-y-1 max-h-28 overflow-y-auto p-1.5 bg-slate-50 rounded border border-slate-200">
                  {warehouses.map(wh => (
                    <label key={wh._id} className="flex items-center justify-between font-bold text-slate-800 cursor-pointer p-1 rounded hover:bg-slate-100">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedWarehouseIds.includes(String(wh._id))}
                          onChange={() => handleToggleWarehouseScope(wh._id)}
                          className="rounded text-slate-900"
                        />
                        <span>{wh.name}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-bold uppercase text-[9px] text-slate-500 tracking-wider mb-1">Justification Reason *</label>
                <input
                  type="text"
                  value={mandatoryReason}
                  onChange={(e) => setMandatoryReason(e.target.value)}
                  placeholder="Reason for modifying permissions..."
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md font-medium"
                  required
                />
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setEditUserModal(null)}
                className="px-3 py-1 bg-white border border-slate-200 text-slate-700 font-bold rounded text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleInitiateSaveScope}
                disabled={actionLoading}
                className="px-3.5 py-1 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded text-xs shadow-xs"
              >
                {actionLoading ? 'Saving...' : 'Save Scope'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD USER */}
      {showAddUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden animate-scaleIn">
            <div className="p-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-900 text-xs">Create New User</h3>
              <button onClick={() => setShowAddUserModal(false)} className="text-slate-400 hover:text-slate-700 text-sm font-bold">✕</button>
            </div>

            <form onSubmit={handleCreateNewUser} className="p-4 space-y-2.5 text-xs">
              <div>
                <label className="block font-bold uppercase text-[9px] text-slate-500 tracking-wider mb-1">Full Name *</label>
                <input
                  type="text"
                  value={newUserForm.username}
                  onChange={(e) => setNewUserForm({ ...newUserForm, username: e.target.value })}
                  placeholder="e.g. John Doe"
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md font-medium"
                  required
                />
              </div>

              <div>
                <label className="block font-bold uppercase text-[9px] text-slate-500 tracking-wider mb-1">Work Email *</label>
                <input
                  type="email"
                  value={newUserForm.email}
                  onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                  placeholder="e.g. jdoe@company.com"
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md font-medium"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold uppercase text-[9px] text-slate-500 tracking-wider mb-1">Role *</label>
                  <select
                    value={newUserForm.role}
                    onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md font-bold text-slate-800"
                  >
                    {ROLE_OPTIONS.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold uppercase text-[9px] text-slate-500 tracking-wider mb-1">Temporary Password *</label>
                  <input
                    type="password"
                    value={newUserForm.password}
                    onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md font-mono"
                    required
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="px-3 py-1 bg-white border border-slate-200 text-slate-700 font-bold rounded text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addUserLoading}
                  className="px-3.5 py-1 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded text-xs shadow-xs"
                >
                  {addUserLoading ? 'Creating...' : '+ Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FLOATING TOAST */}
      {toastNotice && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm w-full">
          <div className="p-3 bg-slate-900 text-white rounded-lg shadow-xl border border-slate-700 flex items-center justify-between gap-2.5 text-xs">
            <div>{toastNotice.text}</div>
            <button onClick={() => setToastNotice(null)} className="text-slate-400 hover:text-white font-bold text-sm">✕</button>
          </div>
        </div>
      )}
    </div>
  );
}
