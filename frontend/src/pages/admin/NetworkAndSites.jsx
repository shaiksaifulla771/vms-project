import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  CheckCircle2,
  RefreshCw,
  Filter,
  Plus
} from 'lucide-react';

const DEFAULT_SITES = [
  {
    _id: 'site-1',
    code: 'HYD-01',
    name: 'Hyderabad Plant',
    type: 'Manufacturing Plant',
    status: 'Active',
    description: 'Primary manufacturing & assembly unit',
    address: { city: 'Hyderabad', state: 'Telangana', country: 'India' },
    assignedWarehouses: [
      { _id: 'wh-1', name: 'Main Warehouse', code: 'HYD-MWH', type: 'General', status: 'Active' },
      { _id: 'wh-2', name: 'Raw Material Warehouse', code: 'HYD-RMW', type: 'Raw', status: 'Active' },
      { _id: 'wh-3', name: 'Finished Goods Warehouse', code: 'HYD-FGW', type: 'FG', status: 'Active' }
    ]
  },
  {
    _id: 'site-2',
    code: 'BLR-01',
    name: 'Bangalore Plant',
    type: 'Manufacturing Plant',
    status: 'Active',
    description: 'Component fabrication facility',
    address: { city: 'Bangalore', state: 'Karnataka', country: 'India' },
    assignedWarehouses: []
  },
  {
    _id: 'site-3',
    code: 'MAA-01',
    name: 'Chennai Distribution Center',
    type: 'Distribution Center',
    status: 'Active',
    description: 'Regional logistics & distribution hub',
    address: { city: 'Chennai', state: 'Tamil Nadu', country: 'India' },
    assignedWarehouses: []
  },
  {
    _id: 'site-4',
    code: 'PUN-01',
    name: 'Pune Facility',
    type: 'R&D Center',
    status: 'Inactive',
    deactivationReason: 'Site restructuring and facility relocation',
    description: 'Research & testing facility',
    address: { city: 'Pune', state: 'Maharashtra', country: 'India' },
    assignedWarehouses: []
  }
];

const DEFAULT_WAREHOUSES = [
  { _id: 'wh-1', code: 'HYD-MWH', name: 'Main Warehouse', type: 'General', subCategory: 'Main Storage', status: 'Active', description: 'Central inventory receiving depot', siteId: { _id: 'site-1', name: 'Hyderabad Plant' } },
  { _id: 'wh-2', code: 'HYD-RMW', name: 'Raw Material Warehouse', type: 'Raw Material', subCategory: 'Retail Components', status: 'Active', description: 'Raw component item sourcing bay', siteId: { _id: 'site-1', name: 'Hyderabad Plant' } },
  { _id: 'wh-3', code: 'HYD-FGW', name: 'Finished Goods Warehouse', type: 'Finished Goods', subCategory: 'Puree / Porridge', status: 'Active', description: 'Assembled finished product storage', siteId: { _id: 'site-1', name: 'Hyderabad Plant' } },
  { _id: 'wh-4', code: 'PUN-OLD', name: 'Old Storage Depot', type: 'Scrap', subCategory: 'Maintenance', status: 'Inactive', deactivationReason: 'Structure maintenance', description: 'Legacy storage bay', siteId: { _id: 'site-4', name: 'Pune Facility' } }
];

const DEFAULT_USERS = [
  { _id: 'usr-1', username: 'Shaik Saifulla', email: 'admin@vendoros.com', role: 'Admin', siteIds: [], warehouseIds: [] },
  { _id: 'usr-2', username: 'Rahul Kumar', email: 'rahul@vendoros.com', role: 'Inventory Manager', siteIds: [{ _id: 'site-1', name: 'Hyderabad Plant' }], warehouseIds: [{ _id: 'wh-1', name: 'Main Warehouse' }, { _id: 'wh-2', name: 'Raw Material Warehouse' }] },
  { _id: 'usr-3', username: 'Priya Sharma', email: 'priya@vendoros.com', role: 'Production Manager', siteIds: [{ _id: 'site-1', name: 'Hyderabad Plant' }], warehouseIds: [{ _id: 'wh-3', name: 'Finished Goods Warehouse' }] },
  { _id: 'usr-4', username: 'Ahmed Khan', email: 'ahmed@vendoros.com', role: 'Planner', siteIds: [{ _id: 'site-1', name: 'Hyderabad Plant' }], warehouseIds: [] }
];

const DEFAULT_AUDIT_LOGS = [
  { _id: 'log-1', timestamp: new Date(Date.now() - 25 * 60 * 1000).toISOString(), userName: 'Shaik Saifulla', role: 'Admin', action: 'DEACTIVATE', module: 'Network & Sites', locationName: 'Old Storage Depot', reason: 'Structure maintenance' },
  { _id: 'log-2', timestamp: new Date(Date.now() - 55 * 60 * 1000).toISOString(), userName: 'Rahul Kumar', role: 'Inventory Manager', action: 'UPDATE', module: 'Inventory', locationName: 'Raw Material Warehouse', reason: 'Stock transfer batch #1042' },
  { _id: 'log-3', timestamp: new Date(Date.now() - 110 * 60 * 1000).toISOString(), userName: 'Ahmed Khan', role: 'Planner', action: 'CREATE', module: 'VMS', locationName: 'Hyderabad Plant', reason: 'Vendor dispatch appointment' }
];

const NetworkAndSites = () => {
  const [activeTab, setActiveTab] = useState('sites'); // sites | warehouses | userScope | auditLog
  const [searchTerm, setSearchTerm] = useState('');

  const [sites, setSites] = useState(DEFAULT_SITES);
  const [warehouses, setWarehouses] = useState(DEFAULT_WAREHOUSES);
  const [users, setUsers] = useState(DEFAULT_USERS);
  const [auditLogs, setAuditLogs] = useState(DEFAULT_AUDIT_LOGS);
  const [loading, setLoading] = useState(true);

  // Modals & Drawers
  const [showAddSiteModal, setShowAddSiteModal] = useState(false);
  const [showAddWarehouseModal, setShowAddWarehouseModal] = useState(false);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [selectedWarehouseDetail, setSelectedWarehouseDetail] = useState(null);
  const [editUserScopeModal, setEditUserScopeModal] = useState(null);

  const [mandatoryReason, setMandatoryReason] = useState('');
  const [systemNotice, setSystemNotice] = useState(null);

  const [selectedRole, setSelectedRole] = useState('Inventory Manager');
  const [selectedSiteIds, setSelectedSiteIds] = useState([]);
  const [selectedWarehouseIds, setSelectedWarehouseIds] = useState([]);

  const [newSite, setNewSite] = useState({ code: '', name: '', type: 'Manufacturing Plant', city: 'Hyderabad', state: 'Telangana', country: 'India' });
  const [newWarehouse, setNewWarehouse] = useState({ code: '', name: '', type: 'General', location: '', siteId: '' });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [sitesRes, warehousesRes, usersRes, auditRes] = await Promise.all([
        axios.get('/api/admin/sites'),
        axios.get('/api/admin/warehouses'),
        axios.get('/api/admin/active-users'),
        axios.get('/api/admin/audit-logs')
      ]);

      if (sitesRes.data?.length > 0) setSites(sitesRes.data);
      if (warehousesRes.data?.length > 0) setWarehouses(warehousesRes.data);
      if (usersRes.data?.activeUsers?.length > 0) setUsers(usersRes.data.activeUsers);
      if (auditRes.data?.logs?.length > 0) setAuditLogs(auditRes.data.logs);
    } catch (err) {
      console.warn('Using default fallback datasets:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateSite = (e) => {
    e.preventDefault();
    if (!newSite.code || !newSite.name) return;
    const created = { _id: `site-${Date.now()}`, code: newSite.code, name: newSite.name, type: newSite.type, status: 'Active', description: 'Newly registered plant facility', address: { city: newSite.city, state: newSite.state, country: newSite.country }, assignedWarehouses: [] };
    setSites([...sites, created]);
    setSystemNotice({ title: 'Site Created', message: `Registered ${newSite.name} (${newSite.code}) successfully.` });
    setShowAddSiteModal(false);
    setNewSite({ code: '', name: '', type: 'Manufacturing Plant', city: 'Hyderabad', state: 'Telangana', country: 'India' });
  };

  const handleCreateWarehouse = (e) => {
    e.preventDefault();
    if (!newWarehouse.code || !newWarehouse.name) return;
    const targetSite = sites.find(s => s._id === newWarehouse.siteId);
    const created = { _id: `wh-${Date.now()}`, code: newWarehouse.code, name: newWarehouse.name, type: newWarehouse.type, subCategory: 'General Storage', status: 'Active', description: 'Newly assigned warehouse depot', siteId: targetSite ? { _id: targetSite._id, name: targetSite.name } : null };
    setWarehouses([...warehouses, created]);
    setSystemNotice({ title: 'Warehouse Created', message: `Registered ${newWarehouse.name} (${newWarehouse.code}) successfully.` });
    setShowAddWarehouseModal(false);
    setNewWarehouse({ code: '', name: '', type: 'General', location: '', siteId: '' });
  };

  const handleOpenEditScope = (u) => {
    setEditUserScopeModal(u);
    setSelectedRole(u.role || 'Viewer');
    setSelectedSiteIds(u.siteIds ? u.siteIds.map(s => s._id || s) : []);
    setSelectedWarehouseIds(u.warehouseIds ? u.warehouseIds.map(w => w._id || w) : []);
    setMandatoryReason('');
  };

  const handleSaveUserScope = () => {
    if (!mandatoryReason.trim()) { alert('Reason is required.'); return; }
    setUsers(users.map(u => u._id === editUserScopeModal._id ? {
      ...u, role: selectedRole,
      siteIds: sites.filter(s => selectedSiteIds.includes(s._id)),
      warehouseIds: warehouses.filter(w => selectedWarehouseIds.includes(w._id))
    } : u));
    setSystemNotice({ title: 'Scope Updated', message: `Updated access scope for ${editUserScopeModal.username}.` });
    setEditUserScopeModal(null);
  };

  return (
    <div className="space-y-4 font-sans text-slate-900 bg-slate-50 min-h-screen p-2">
      {/* INAPP TOPBAR & PAGE TITLE */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center space-x-2 mb-1">
            <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-orange-500 text-white rounded-md">
              InApp Master Network
            </span>
            <span className="text-xs text-slate-500 font-medium">● Sites & Hierarchy Governance</span>
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Network & Sites Master</h1>
          <p className="text-xs text-slate-500 font-normal">Manage Plant Sites, Warehouse Depots, and User Access Scope.</p>
        </div>

        <div className="flex items-center space-x-2">
          {activeTab === 'sites' && (
            <button
              onClick={() => setShowAddSiteModal(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white font-semibold text-xs rounded-lg shadow-2xs transition-colors"
            >
              <i className="ti ti-plus fs-5"></i>
              <span>Add Site</span>
            </button>
          )}

          {activeTab === 'warehouses' && (
            <button
              onClick={() => setShowAddWarehouseModal(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white font-semibold text-xs rounded-lg shadow-2xs transition-colors"
            >
              <i className="ti ti-plus fs-5"></i>
              <span>Add Warehouse</span>
            </button>
          )}

          <button
            onClick={fetchData}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-xs rounded-lg shadow-2xs transition-colors"
          >
            <i className={`ti ti-refresh fs-5 ${loading ? 'animate-spin' : ''}`}></i>
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* SYSTEM NOTICE */}
      {systemNotice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl flex items-center justify-between text-xs font-medium">
          <div className="flex items-center space-x-2">
            <i className="ti ti-circle-check fs-4 text-emerald-600"></i>
            <span><strong>{systemNotice.title}:</strong> {systemNotice.message}</span>
          </div>
          <button onClick={() => setSystemNotice(null)} className="font-bold underline text-emerald-700">Dismiss</button>
        </div>
      )}

      {/* INAPP TEMPLATE STYLED TOP UNDERLINE TABS WITH TABLER ICONS */}
      <div className="flex border-b border-slate-200 bg-white px-4 pt-2 rounded-t-xl">
        <button
          onClick={() => setActiveTab('sites')}
          className={`px-4 py-2 font-bold text-xs transition-all border-b-2 -mb-px flex items-center gap-1.5 ${
            activeTab === 'sites'
              ? 'border-orange-500 text-orange-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <i className="ti ti-building fs-5"></i>
          <span>Site Master</span>
        </button>
        <button
          onClick={() => setActiveTab('warehouses')}
          className={`px-4 py-2 font-bold text-xs transition-all border-b-2 -mb-px flex items-center gap-1.5 ${
            activeTab === 'warehouses'
              ? 'border-orange-500 text-orange-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <i className="ti ti-home-2 fs-5"></i>
          <span>Warehouse Master</span>
        </button>
        <button
          onClick={() => setActiveTab('userScope')}
          className={`px-4 py-2 font-bold text-xs transition-all border-b-2 -mb-px flex items-center gap-1.5 ${
            activeTab === 'userScope'
              ? 'border-orange-500 text-orange-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <i className="ti ti-user-check fs-5"></i>
          <span>User Access Scope</span>
        </button>
        <button
          onClick={() => setActiveTab('auditLog')}
          className={`px-4 py-2 font-bold text-xs transition-all border-b-2 -mb-px flex items-center gap-1.5 ${
            activeTab === 'auditLog'
              ? 'border-orange-500 text-orange-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <i className="ti ti-history fs-5"></i>
          <span>Activity & Audit Log</span>
        </button>
      </div>

      {/* CONTROL SEARCH BAR */}
      <div className="bg-white px-4 py-2 border-x border-slate-200 flex items-center justify-between gap-3">
        <input
          type="text"
          placeholder="Search locations/users..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-64 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 outline-none transition focus:border-orange-500 shadow-2xs font-normal"
        />

        <div className="flex items-center space-x-2 text-xs font-semibold text-slate-600">
          <span>Showing {sites.length} Sites, {warehouses.length} Warehouses</span>
        </div>
      </div>

      {/* TAB 1: SITE MASTER TABLE */}
      {activeTab === 'sites' && (
        <div className="bg-white border border-slate-200 border-t-0 rounded-b-xl overflow-hidden shadow-2xs">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
                <th className="py-2.5 px-3.5">
                  <div className="flex items-center justify-between">
                    <span>SITE NAME</span>
                    <Filter className="w-3 h-3 text-slate-300" />
                  </div>
                </th>
                <th className="py-2.5 px-3.5">
                  <div className="flex items-center justify-between">
                    <span>CODE</span>
                    <Filter className="w-3 h-3 text-slate-300" />
                  </div>
                </th>
                <th className="py-2.5 px-3.5">
                  <div className="flex items-center justify-between">
                    <span>FACILITY TYPE</span>
                    <Filter className="w-3 h-3 text-slate-300" />
                  </div>
                </th>
                <th className="py-2.5 px-3.5">
                  <div className="flex items-center justify-between">
                    <span>LOCATION</span>
                    <Filter className="w-3 h-3 text-slate-300" />
                  </div>
                </th>
                <th className="py-2.5 px-3.5">
                  <div className="flex items-center justify-between">
                    <span>STATUS</span>
                    <Filter className="w-3 h-3 text-slate-300" />
                  </div>
                </th>
                <th className="py-2.5 px-3.5">DESCRIPTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 font-medium text-slate-700">
              {sites.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.code.toLowerCase().includes(searchTerm.toLowerCase())).map((s) => (
                <tr key={s._id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-2.5 px-3.5 font-bold text-slate-800 text-xs">{s.name}</td>
                  <td className="py-2.5 px-3.5 font-bold text-blue-600 text-xs hover:underline cursor-pointer">{s.code}</td>
                  <td className="py-2.5 px-3.5 text-slate-600 text-xs">{s.type}</td>
                  <td className="py-2.5 px-3.5 text-slate-600 text-xs">{s.address?.city || 'Hyderabad'}, {s.address?.state || 'Telangana'}</td>
                  <td className="py-2.5 px-3.5 text-xs">
                    <span className={`font-bold ${s.status === 'Active' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-3.5 text-slate-400 text-xs">{s.description || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 2: WAREHOUSE MASTER TABLE */}
      {activeTab === 'warehouses' && (
        <div className="bg-white border border-slate-200 border-t-0 rounded-b-xl overflow-hidden shadow-2xs">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
                <th className="py-2.5 px-3.5">WAREHOUSE NAME</th>
                <th className="py-2.5 px-3.5">CODE</th>
                <th className="py-2.5 px-3.5">PARENT SITE</th>
                <th className="py-2.5 px-3.5">CATEGORY</th>
                <th className="py-2.5 px-3.5">SUB-CATEGORY</th>
                <th className="py-2.5 px-3.5">STATUS</th>
                <th className="py-2.5 px-3.5">DESCRIPTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 font-medium text-slate-700">
              {warehouses.filter(w => w.name.toLowerCase().includes(searchTerm.toLowerCase()) || w.code.toLowerCase().includes(searchTerm.toLowerCase())).map((wh) => (
                <tr key={wh._id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-2.5 px-3.5 font-bold text-slate-800 text-xs">{wh.name}</td>
                  <td className="py-2.5 px-3.5 font-bold text-blue-600 text-xs hover:underline cursor-pointer" onClick={() => setSelectedWarehouseDetail(wh)}>{wh.code}</td>
                  <td className="py-2.5 px-3.5 text-slate-600 text-xs font-semibold">{wh.siteId?.name || <span className="text-slate-400">-</span>}</td>
                  <td className="py-2.5 px-3.5 text-slate-600 text-xs">{wh.type}</td>
                  <td className="py-2.5 px-3.5 text-slate-600 text-xs">{wh.subCategory || '-'}</td>
                  <td className="py-2.5 px-3.5 text-xs">
                    <span className={`font-bold ${wh.status === 'Active' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {wh.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-3.5 text-slate-400 text-xs">{wh.description || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 3: USER ACCESS SCOPE TABLE */}
      {activeTab === 'userScope' && (
        <div className="bg-white border border-slate-200 border-t-0 rounded-b-xl overflow-hidden shadow-2xs">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
                <th className="py-2.5 px-3.5">USER NAME</th>
                <th className="py-2.5 px-3.5">WORK EMAIL</th>
                <th className="py-2.5 px-3.5">ROLE</th>
                <th className="py-2.5 px-3.5">ALLOWED SITES</th>
                <th className="py-2.5 px-3.5">ALLOWED WAREHOUSES</th>
                <th className="py-2.5 px-3.5 text-center">MANAGE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 font-medium text-slate-700">
              {users.map(u => (
                <tr key={u._id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-2.5 px-3.5 font-bold text-slate-800 text-xs">{u.username}</td>
                  <td className="py-2.5 px-3.5 text-slate-500 font-mono text-xs">{u.email}</td>
                  <td className="py-2.5 px-3.5 text-slate-800 font-bold text-xs">{u.role}</td>
                  <td className="py-2.5 px-3.5 text-xs text-slate-600">
                    {(u.siteIds && u.siteIds.length > 0) ? u.siteIds.map(s => s.name).join(', ') : <span className="text-slate-400 font-bold">All Sites</span>}
                  </td>
                  <td className="py-2.5 px-3.5 text-xs text-slate-600">
                    {(u.warehouseIds && u.warehouseIds.length > 0) ? u.warehouseIds.map(w => w.name).join(', ') : <span className="text-slate-400 font-bold">All Warehouses</span>}
                  </td>
                  <td className="py-2.5 px-3.5 text-center">
                    <button onClick={() => handleOpenEditScope(u)} className="px-3 py-1 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-lg border border-slate-200 shadow-2xs">Edit Scope</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 4: AUDIT LOG TABLE */}
      {activeTab === 'auditLog' && (
        <div className="bg-white border border-slate-200 border-t-0 rounded-b-xl overflow-hidden shadow-2xs">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
                <th className="py-2.5 px-3.5">TIMESTAMP</th>
                <th className="py-2.5 px-3.5">USER</th>
                <th className="py-2.5 px-3.5">ACTION</th>
                <th className="py-2.5 px-3.5">MODULE</th>
                <th className="py-2.5 px-3.5">LOCATION TARGET</th>
                <th className="py-2.5 px-3.5 text-center">INSPECT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 font-medium text-slate-700">
              {auditLogs.map((log, idx) => (
                <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-2.5 px-3.5 text-slate-500 font-mono text-[11px]">{new Date(log.timestamp).toLocaleString()}</td>
                  <td className="py-2.5 px-3.5 font-bold text-slate-800 text-xs">{log.userName || 'Admin'}</td>
                  <td className="py-2.5 px-3.5 text-xs font-bold text-blue-600">{log.action}</td>
                  <td className="py-2.5 px-3.5 text-slate-600 text-xs">{log.module || 'General'}</td>
                  <td className="py-2.5 px-3.5 font-bold text-slate-800 text-xs">{log.locationName || 'System'}</td>
                  <td className="py-2.5 px-3.5 text-center">
                    <button onClick={() => setSelectedWarehouseDetail(log)} className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-lg border border-slate-200 shadow-2xs">Inspect</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL: ADD SITE */}
      {showAddSiteModal && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form onSubmit={handleCreateSite} className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-5 space-y-3 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-sm font-bold text-slate-900">Add Site Master</h3>
              <button type="button" onClick={() => setShowAddSiteModal(false)} className="text-slate-400 font-bold">✕</button>
            </div>
            <div className="space-y-2 text-xs">
              <div>
                <label className="block text-slate-600 font-bold mb-1">Site Code:</label>
                <input type="text" required placeholder="HYD-02" value={newSite.code} onChange={e => setNewSite({ ...newSite, code: e.target.value })} className="w-full p-2 bg-white border border-slate-200 rounded-lg font-bold" />
              </div>
              <div>
                <label className="block text-slate-600 font-bold mb-1">Site Name:</label>
                <input type="text" required placeholder="Hyderabad Plant II" value={newSite.name} onChange={e => setNewSite({ ...newSite, name: e.target.value })} className="w-full p-2 bg-white border border-slate-200 rounded-lg font-bold" />
              </div>
            </div>
            <div className="pt-2 border-t border-slate-100 flex justify-end space-x-2">
              <button type="button" onClick={() => setShowAddSiteModal(false)} className="px-3.5 py-1.5 bg-white text-slate-700 font-bold text-xs rounded-lg border border-slate-200">Cancel</button>
              <button type="submit" className="px-3.5 py-1.5 bg-orange-600 text-white font-bold text-xs rounded-lg shadow-sm">Save Site</button>
            </div>
          </form>
        </div>
      )}

      {/* INSPECTION DRAWER */}
      {selectedWarehouseDetail && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-5 space-y-3 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-sm font-bold text-slate-900">Details Inspection</h3>
              <button onClick={() => setSelectedWarehouseDetail(null)} className="text-slate-400 font-bold">✕</button>
            </div>
            <div className="space-y-1.5 text-xs font-semibold text-slate-800 bg-slate-50 p-3 rounded-lg border border-slate-200">
              <p><strong>Name / Target:</strong> {selectedWarehouseDetail.name || selectedWarehouseDetail.locationName}</p>
              <p><strong>Status / Action:</strong> {selectedWarehouseDetail.status || selectedWarehouseDetail.action}</p>
              <p><strong>Description / Reason:</strong> {selectedWarehouseDetail.description || selectedWarehouseDetail.reason || '-'}</p>
            </div>
            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button onClick={() => setSelectedWarehouseDetail(null)} className="px-4 py-1.5 bg-white border border-slate-200 text-slate-700 font-bold text-xs rounded-lg">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NetworkAndSites;
