import React, { useState, useEffect } from 'react';
import axios from 'axios';
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
  Plus
} from 'lucide-react';

const DEFAULT_USERS = [
  {
    _id: 'usr-1',
    username: 'Shaik Saifulla',
    email: 'admin@vendoros.com',
    role: 'Admin',
    siteIds: [],
    warehouseIds: []
  },
  {
    _id: 'usr-2',
    username: 'Rahul Kumar',
    email: 'rahul@vendoros.com',
    role: 'Inventory Manager',
    siteIds: [{ _id: 'site-1', name: 'Hyderabad Plant' }],
    warehouseIds: [{ _id: 'wh-1', name: 'Main Warehouse' }, { _id: 'wh-2', name: 'Raw Material Warehouse' }]
  },
  {
    _id: 'usr-3',
    username: 'Priya Sharma',
    email: 'priya@vendoros.com',
    role: 'Production Manager',
    siteIds: [{ _id: 'site-1', name: 'Hyderabad Plant' }],
    warehouseIds: [{ _id: 'wh-3', name: 'Finished Goods Warehouse' }]
  },
  {
    _id: 'usr-4',
    username: 'Ahmed Khan',
    email: 'ahmed@vendoros.com',
    role: 'Planner',
    siteIds: [{ _id: 'site-1', name: 'Hyderabad Plant' }],
    warehouseIds: []
  },
  {
    _id: 'usr-5',
    username: 'Alex Vance',
    email: 'alex@vendoros.com',
    role: 'QC Inspector',
    siteIds: [{ _id: 'site-2', name: 'Chennai Distribution Center' }],
    warehouseIds: []
  }
];

const UsersAndAccessScope = () => {
  const [users, setUsers] = useState(DEFAULT_USERS);
  const [sites, setSites] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);

  const [editUserModal, setEditUserModal] = useState(null);
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
      const [usersRes, sitesRes, warehousesRes] = await Promise.all([
        axios.get('/api/admin/active-users'),
        axios.get('/api/admin/sites'),
        axios.get('/api/admin/warehouses')
      ]);

      const fetchedUsers = usersRes.data.activeUsers || [];
      if (fetchedUsers.length > 0) {
        setUsers(fetchedUsers);
      } else {
        setUsers(DEFAULT_USERS);
      }

      setSites(sitesRes.data || []);
      setWarehouses(warehousesRes.data || []);
    } catch (err) {
      console.warn('User access scope fetch fallback to default state:', err.message);
      setUsers(DEFAULT_USERS);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenEdit = (user) => {
    setEditUserModal(user);
    setSelectedRole(user.role || 'Viewer');
    setSelectedSiteIds(user.siteIds ? user.siteIds.map(s => s._id || s) : []);
    setSelectedWarehouseIds(user.warehouseIds ? user.warehouseIds.map(w => w._id || w) : []);
    setMandatoryReason('');
  };

  const handleToggleSiteScope = (siteId) => {
    if (selectedSiteIds.includes(siteId)) {
      setSelectedSiteIds(selectedSiteIds.filter(id => id !== siteId));
    } else {
      setSelectedSiteIds([...selectedSiteIds, siteId]);
    }
  };

  const handleToggleWarehouseScope = (warehouseId) => {
    if (selectedWarehouseIds.includes(warehouseId)) {
      setSelectedWarehouseIds(selectedWarehouseIds.filter(id => id !== warehouseId));
    } else {
      setSelectedWarehouseIds([...selectedWarehouseIds, warehouseId]);
    }
  };

  const handleSaveAccessScope = async () => {
    if (!mandatoryReason.trim()) {
      alert('Mandatory reason is required for updating user scope.');
      return;
    }
    setActionLoading(true);
    try {
      if (editUserModal._id && editUserModal._id.startsWith('usr-')) {
        // Local update fallback
        setUsers(users.map(u => u._id === editUserModal._id ? {
          ...u,
          role: selectedRole,
          siteIds: sites.filter(s => selectedSiteIds.includes(s._id)),
          warehouseIds: warehouses.filter(w => selectedWarehouseIds.includes(w._id))
        } : u));
      } else {
        await axios.put(`/api/admin/users/${editUserModal._id}/access`, {
          role: selectedRole,
          siteIds: selectedSiteIds,
          warehouseIds: selectedWarehouseIds,
          reason: mandatoryReason
        });
      }

      setSystemNotice({
        type: 'success',
        title: 'Access Scope Updated',
        message: `Updated access scope for ${editUserModal.username}.`
      });
      setEditUserModal(null);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.message || 'Error updating access scope');
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

      {systemNotice && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-900 rounded-2xl flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <div>
              <h4 className="text-xs font-black uppercase">{systemNotice.title}</h4>
              <p className="text-xs font-medium">{systemNotice.message}</p>
            </div>
          </div>
          <button onClick={() => setSystemNotice(null)} className="text-xs font-bold px-2 py-1 bg-white/50 hover:bg-white rounded-lg">Dismiss</button>
        </div>
      )}

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

      {/* EDIT ACCESS SCOPE MODAL */}
      {editUserModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900">
                Edit Access Scope for {editUserModal.username}
              </h3>
              <button onClick={() => setEditUserModal(null)} className="text-slate-400 font-bold">✕</button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">User Role:</label>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                >
                  <option value="Admin">Admin</option>
                  <option value="Inventory Manager">Inventory Manager</option>
                  <option value="Inventory">Inventory Operator</option>
                  <option value="Production Manager">Production Manager</option>
                  <option value="Production">Production Worker</option>
                  <option value="Planner">Planner</option>
                  <option value="Viewer">Viewer</option>
                </select>
              </div>

              {/* Site Scope Picker */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">Allowed Site Scope:</label>
                <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-xl">
                  {(sites.length > 0 ? sites : [
                    { _id: 'site-1', name: 'Hyderabad Plant' },
                    { _id: 'site-2', name: 'Bangalore Plant' },
                    { _id: 'site-3', name: 'Chennai Distribution Center' }
                  ]).map(s => (
                    <label key={s._id} className="flex items-center space-x-2 text-xs font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedSiteIds.includes(s._id)}
                        onChange={() => handleToggleSiteScope(s._id)}
                        className="rounded border-slate-300 text-blue-600"
                      />
                      <span>{s.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Warehouse Scope Picker */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">Allowed Warehouse Scope:</label>
                <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-xl">
                  {(warehouses.length > 0 ? warehouses : [
                    { _id: 'wh-1', name: 'Main Warehouse' },
                    { _id: 'wh-2', name: 'Raw Material Warehouse' },
                    { _id: 'wh-3', name: 'Finished Goods Warehouse' }
                  ]).map(w => (
                    <label key={w._id} className="flex items-center space-x-2 text-xs font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedWarehouseIds.includes(w._id)}
                        onChange={() => handleToggleWarehouseScope(w._id)}
                        className="rounded border-slate-300 text-purple-600"
                      />
                      <span>{w.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Reason for Access Change (Mandatory):</label>
                <textarea
                  value={mandatoryReason}
                  onChange={(e) => setMandatoryReason(e.target.value)}
                  placeholder="e.g. Admin updated warehouse access scope for plant restructuring..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl h-20 text-xs font-medium text-slate-900"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-3">
              <button onClick={() => setEditUserModal(null)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl">
                Cancel
              </button>
              <button onClick={handleSaveAccessScope} disabled={actionLoading} className="px-4 py-2 bg-blue-600 text-white font-bold text-xs rounded-xl shadow-md">
                {actionLoading ? 'Saving...' : 'Save Scope Changes'}
              </button>
            </div>
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
    </div>
  );
};

export default UsersAndAccessScope;
