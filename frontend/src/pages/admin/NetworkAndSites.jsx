import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Building2,
  Warehouse,
  Plus,
  ArrowRightLeft,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Eye,
  RefreshCw,
  Search,
  Filter,
  Layers,
  ShieldAlert,
  Info,
  Unlink,
  ExternalLink,
  Users,
  ShieldCheck,
  FileText,
  Activity,
  Key,
  Edit2
} from 'lucide-react';

const DEFAULT_SITES = [
  {
    _id: 'site-1',
    code: 'HYD-01',
    name: 'Hyderabad Plant',
    type: 'Manufacturing Plant',
    status: 'Active',
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
    address: { city: 'Bangalore', state: 'Karnataka', country: 'India' },
    assignedWarehouses: []
  },
  {
    _id: 'site-3',
    code: 'MAA-01',
    name: 'Chennai Distribution Center',
    type: 'Distribution Center',
    status: 'Active',
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
    address: { city: 'Pune', state: 'Maharashtra', country: 'India' },
    assignedWarehouses: []
  }
];

const DEFAULT_WAREHOUSES = [
  { _id: 'wh-1', code: 'HYD-MWH', name: 'Main Warehouse', type: 'General', status: 'Active', siteId: { _id: 'site-1', name: 'Hyderabad Plant' } },
  { _id: 'wh-2', code: 'HYD-RMW', name: 'Raw Material Warehouse', type: 'Raw', status: 'Active', siteId: { _id: 'site-1', name: 'Hyderabad Plant' } },
  { _id: 'wh-3', code: 'HYD-FGW', name: 'Finished Goods Warehouse', type: 'FG', status: 'Active', siteId: { _id: 'site-1', name: 'Hyderabad Plant' } },
  { _id: 'wh-4', code: 'PUN-OLD', name: 'Old Storage Depot', type: 'Scrap', status: 'Inactive', deactivationReason: 'Structure maintenance', siteId: { _id: 'site-4', name: 'Pune Facility' } }
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
  // Main Section Tabs: 'hierarchy' | 'scope' | 'control'
  const [mainTab, setMainTab] = useState('hierarchy');
  // Sub Tab inside Hierarchy: 'sites' | 'warehouses' | 'assignments' | 'inactive'
  const [hierarchyTab, setHierarchyTab] = useState('sites');

  const [sites, setSites] = useState(DEFAULT_SITES);
  const [warehouses, setWarehouses] = useState(DEFAULT_WAREHOUSES);
  const [users, setUsers] = useState(DEFAULT_USERS);
  const [auditLogs, setAuditLogs] = useState(DEFAULT_AUDIT_LOGS);
  const [loading, setLoading] = useState(true);

  // Modals & Drawers
  const [showAddSiteModal, setShowAddSiteModal] = useState(false);
  const [showAddWarehouseModal, setShowAddWarehouseModal] = useState(false);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [assignWarehouseSiteModal, setAssignWarehouseSiteModal] = useState(null);
  const [selectedWarehouseDetail, setSelectedWarehouseDetail] = useState(null);
  const [transferModal, setTransferModal] = useState(null);
  const [unlinkModal, setUnlinkModal] = useState(null);
  const [deactivateModal, setDeactivateModal] = useState(null);
  const [editUserScopeModal, setEditUserScopeModal] = useState(null);
  const [selectedAuditDetail, setSelectedAuditDetail] = useState(null);

  const [impactData, setImpactData] = useState(null);
  const [mandatoryReason, setMandatoryReason] = useState('');
  const [selectedTargetSiteId, setSelectedTargetSiteId] = useState('');
  const [selectedAssignWarehouseId, setSelectedAssignWarehouseId] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [systemNotice, setSystemNotice] = useState(null);

  // Scope picker state
  const [selectedRole, setSelectedRole] = useState('Inventory Manager');
  const [selectedSiteIds, setSelectedSiteIds] = useState([]);
  const [selectedWarehouseIds, setSelectedWarehouseIds] = useState([]);

  // Forms State
  const [newSite, setNewSite] = useState({ code: '', name: '', type: 'Manufacturing Plant', city: 'Hyderabad', state: 'Telangana', country: 'India' });
  const [newWarehouse, setNewWarehouse] = useState({ code: '', name: '', type: 'General', location: '', siteId: '' });
  const [newUser, setNewUser] = useState({ username: '', email: '', role: 'Inventory Manager' });

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

  // Handlers
  const handleCreateSite = async (e) => {
    e.preventDefault();
    if (!newSite.code || !newSite.name) return;
    const created = { _id: `site-${Date.now()}`, code: newSite.code, name: newSite.name, type: newSite.type, status: 'Active', address: { city: newSite.city, state: newSite.state, country: newSite.country }, assignedWarehouses: [] };
    setSites([...sites, created]);
    setSystemNotice({ title: 'Site Created', message: `Registered ${newSite.name} (${newSite.code}) successfully.` });
    setShowAddSiteModal(false);
    setNewSite({ code: '', name: '', type: 'Manufacturing Plant', city: 'Hyderabad', state: 'Telangana', country: 'India' });
  };

  const handleCreateWarehouse = async (e) => {
    e.preventDefault();
    if (!newWarehouse.code || !newWarehouse.name) return;
    const targetSite = sites.find(s => s._id === newWarehouse.siteId);
    const created = { _id: `wh-${Date.now()}`, code: newWarehouse.code, name: newWarehouse.name, type: newWarehouse.type, status: 'Active', siteId: targetSite ? { _id: targetSite._id, name: targetSite.name } : null };
    setWarehouses([...warehouses, created]);
    setSystemNotice({ title: 'Warehouse Created', message: `Registered ${newWarehouse.name} (${newWarehouse.code}) successfully.` });
    setShowAddWarehouseModal(false);
    setNewWarehouse({ code: '', name: '', type: 'General', location: '', siteId: '' });
  };

  const handleUnlinkWarehouse = (wh) => {
    setWarehouses(warehouses.map(w => w._id === wh._id ? { ...w, siteId: null } : w));
    setSystemNotice({ title: 'Warehouse Unlinked', message: `Detached ${wh.name} from its site.` });
    setUnlinkModal(null);
  };

  const handleTransferSite = (wh) => {
    if (!selectedTargetSiteId) return;
    const targetSite = sites.find(s => s._id === selectedTargetSiteId);
    setWarehouses(warehouses.map(w => w._id === wh._id ? { ...w, siteId: targetSite ? { _id: targetSite._id, name: targetSite.name } : null } : w));
    setSystemNotice({ title: 'Site Transferred', message: `Transferred ${wh.name} to ${targetSite?.name}.` });
    setTransferModal(null);
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

  // Stats Counters
  const activeSitesCount = sites.filter(s => s.status === 'Active').length;
  const activeWarehousesCount = warehouses.filter(w => w.status === 'Active').length;
  const inactiveCount = sites.filter(s => s.status === 'Inactive').length + warehouses.filter(w => w.status === 'Inactive').length;

  return (
    <div className="space-y-4">
      {/* COMPACT LIGHT HEADER WITH INTEGRATED CONTROLS */}
      <div className="bg-white border border-slate-200/80 p-4 rounded-2xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center space-x-2.5 mb-1">
            <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 rounded-md">
              Master Structure
            </span>
            <span className="text-xs text-slate-500 font-medium">Network, Locations & Governance Hub</span>
          </div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight">Network & Sites Master Governance</h1>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            onClick={() => setShowAddSiteModal(true)}
            className="flex items-center space-x-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-md transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add Site</span>
          </button>

          <button
            onClick={() => setShowAddWarehouseModal(true)}
            className="flex items-center space-x-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-md transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add Warehouse</span>
          </button>

          <button
            onClick={fetchData}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-colors border border-slate-200"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* SYSTEM NOTICE NOTIFICATION */}
      {systemNotice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <div>
              <span className="font-bold uppercase tracking-wider">{systemNotice.title}:</span>{' '}
              <span>{systemNotice.message}</span>
            </div>
          </div>
          <button onClick={() => setSystemNotice(null)} className="font-bold text-emerald-700 hover:underline">Dismiss</button>
        </div>
      )}

      {/* MASTER TOP TABS NAVIGATION */}
      <div className="flex items-center space-x-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setMainTab('hierarchy')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            mainTab === 'hierarchy'
              ? 'bg-blue-600 text-white shadow-md font-extrabold'
              : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>1. Sites & Hierarchy ({sites.length} Sites, {warehouses.length} Warehouses)</span>
        </button>

        <button
          onClick={() => setMainTab('scope')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            mainTab === 'scope'
              ? 'bg-blue-600 text-white shadow-md font-extrabold'
              : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>2. User Scope & Access ({users.length} Users)</span>
        </button>

        <button
          onClick={() => setMainTab('control')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            mainTab === 'control'
              ? 'bg-blue-600 text-white shadow-md font-extrabold'
              : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>3. Control Dashboard & Audit ({auditLogs.length} Logs)</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: SITES & HIERARCHY TAB                                         */}
      {/* ========================================================================= */}
      {mainTab === 'hierarchy' && (
        <div className="space-y-4">
          {/* Sub Navigation inside Hierarchy */}
          <div className="flex items-center space-x-2">
            {['sites', 'warehouses', 'assignments', 'inactive'].map((t) => (
              <button
                key={t}
                onClick={() => setHierarchyTab(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                  hierarchyTab === t
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                }`}
              >
                {t === 'sites' && `Sites (${activeSitesCount})`}
                {t === 'warehouses' && `Warehouses (${activeWarehousesCount})`}
                {t === 'assignments' && 'Site ↔ Warehouse Assignment Tree'}
                {t === 'inactive' && `Inactive Locations (${inactiveCount})`}
              </button>
            ))}
          </div>

          {/* HIERARCHY SUB-TAB 1: SITES */}
          {hierarchyTab === 'sites' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {sites.filter(s => s.status === 'Active').map((s) => (
                <div key={s._id} className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm hover:border-blue-300 transition-all space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2.5">
                      <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-extrabold text-slate-900">{s.name}</h3>
                        <span className="text-[10px] text-slate-400 font-mono font-bold">{s.code} • {s.type}</span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 font-extrabold text-[10px] rounded-md">
                      ● Active
                    </span>
                  </div>

                  <div className="text-xs text-slate-600 font-medium">
                    📍 {s.address?.city || 'Hyderabad'}, {s.address?.state || 'Telangana'}
                  </div>

                  <div className="pt-2 border-t border-slate-100 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                      <span>Assigned Warehouses ({s.assignedWarehouses?.length || 0})</span>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {warehouses.filter(w => w.siteId?._id === s._id || w.siteId === s._id).map((wh) => (
                        <button
                          key={wh._id}
                          onClick={() => setSelectedWarehouseDetail(wh)}
                          className="px-2 py-1 bg-slate-50 hover:bg-blue-50 text-slate-800 hover:text-blue-700 font-bold text-[10px] rounded-lg border border-slate-200 transition-colors"
                        >
                          📦 {wh.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* HIERARCHY SUB-TAB 2: WAREHOUSES */}
          {hierarchyTab === 'warehouses' && (
            <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-100">
                    <th className="py-3 px-4">Code</th>
                    <th className="py-3 px-4">Warehouse Name</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Parent Site</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {warehouses.filter(w => w.status === 'Active').map((wh) => (
                    <tr key={wh._id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{wh.code}</td>
                      <td className="py-3 px-4 font-extrabold text-slate-900 flex items-center space-x-2">
                        <Warehouse className="w-4 h-4 text-blue-600" />
                        <span>{wh.name}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 bg-purple-50 text-purple-700 font-bold text-[10px] rounded-md border border-purple-200">
                          {wh.type}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-800">
                        {wh.siteId ? (wh.siteId.name || 'Assigned Site') : <span className="text-slate-400 italic">Unassigned</span>}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[10px] rounded-md">
                          ● Active
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center space-x-2">
                          <button onClick={() => setSelectedWarehouseDetail(wh)} className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 font-bold rounded-lg transition-colors">Inspect</button>
                          <button onClick={() => setTransferModal(wh)} className="px-2.5 py-1 bg-purple-50 text-purple-700 font-bold rounded-lg border border-purple-200">Change Site</button>
                          <button onClick={() => setUnlinkModal(wh)} className="px-2.5 py-1 bg-rose-50 text-rose-700 font-bold rounded-lg border border-rose-200">Unlink</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* HIERARCHY SUB-TAB 3: ASSIGNMENT TREE */}
          {hierarchyTab === 'assignments' && (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">NETWORK ↔ SITE ↔ WAREHOUSE TREE</h3>
              <div className="space-y-4 pl-2 border-l-2 border-slate-200">
                {sites.map((s) => (
                  <div key={s._id} className="space-y-2">
                    <div className="flex items-center space-x-2 text-xs font-black text-slate-900 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                      <Building2 className="w-4 h-4 text-blue-600" />
                      <span>{s.name} ({s.code})</span>
                    </div>
                    <div className="pl-6 space-y-1">
                      {warehouses.filter(w => w.siteId?._id === s._id || w.siteId === s._id).map((wh) => (
                        <div key={wh._id} className="flex items-center justify-between p-2 bg-white border border-slate-100 rounded-lg text-xs font-semibold">
                          <span className="flex items-center space-x-2">
                            <Warehouse className="w-3.5 h-3.5 text-purple-600" />
                            <span>{wh.name} ({wh.code})</span>
                          </span>
                          <button onClick={() => setSelectedWarehouseDetail(wh)} className="text-[10px] font-bold text-blue-600 hover:underline">View Details</button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* HIERARCHY SUB-TAB 4: INACTIVE LOCATIONS */}
          {hierarchyTab === 'inactive' && (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-3">
              <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs font-medium">
                ⚠ Inactive sites and warehouses have operations blocked for all users. Historical records remain available for compliance.
              </div>

              <div className="space-y-2">
                {[...sites.filter(s => s.status === 'Inactive'), ...warehouses.filter(w => w.status === 'Inactive')].map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                    <div>
                      <h4 className="font-extrabold text-slate-900">{item.name} ({item.code})</h4>
                      <p className="text-[11px] text-slate-500 italic">Reason: {item.deactivationReason || 'Deactivated by Admin'}</p>
                    </div>
                    <span className="px-2.5 py-1 bg-rose-100 text-rose-700 font-extrabold text-[10px] rounded-md">
                      ● INACTIVE
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 2: USERS & SCOPE ACCESS TAB                                      */}
      {/* ========================================================================= */}
      {mainTab === 'scope' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white border border-slate-200/80 p-4 rounded-2xl shadow-sm">
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">3-Level Permission & Location Scope Governance</h3>
              <p className="text-xs text-slate-500">Restricting users to specific sites or warehouses prevents unauthorised operational access.</p>
            </div>
            <button onClick={() => setShowAddUserModal(true)} className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-md">+ Add User</button>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-100">
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Site Access Scope</th>
                  <th className="py-3 px-4">Warehouse Access Scope</th>
                  <th className="py-3 px-4 text-center">Manage Scope</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {users.map((u) => (
                  <tr key={u._id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-extrabold text-slate-900 flex items-center space-x-2">
                      <div className="h-7 w-7 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center">
                        {u.username ? u.username.charAt(0).toUpperCase() : 'U'}
                      </div>
                      <span>{u.username}</span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-500">{u.email}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-800 font-extrabold text-[10px] rounded-md">{u.role}</span>
                    </td>
                    <td className="py-3 px-4">
                      {(u.siteIds && u.siteIds.length > 0) ? (
                        <div className="flex flex-wrap gap-1">
                          {u.siteIds.map((s, i) => <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-700 font-bold text-[10px] rounded-md border border-blue-200">{s.name || 'Site'}</span>)}
                        </div>
                      ) : <span className="text-slate-400 font-bold text-[11px]">Global (All Sites)</span>}
                    </td>
                    <td className="py-3 px-4">
                      {(u.warehouseIds && u.warehouseIds.length > 0) ? (
                        <div className="flex flex-wrap gap-1">
                          {u.warehouseIds.map((w, i) => <span key={i} className="px-2 py-0.5 bg-purple-50 text-purple-700 font-bold text-[10px] rounded-md border border-purple-200">{w.name || 'Warehouse'}</span>)}
                        </div>
                      ) : <span className="text-slate-400 font-bold text-[11px]">Global (All Warehouses)</span>}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button onClick={() => handleOpenEditScope(u)} className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-xl border border-blue-200 transition-colors flex items-center space-x-1 mx-auto">
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>Edit Scope</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 3: CONTROL DASHBOARD & AUDIT TAB                                 */}
      {/* ========================================================================= */}
      {mainTab === 'control' && (
        <div className="space-y-4">
          {/* COMPACT KPI CARDS GRID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white border border-slate-200/80 rounded-2xl p-3.5 shadow-sm space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Active Sites</span>
              <h3 className="text-xl font-black text-slate-900">{activeSitesCount}</h3>
              <p className="text-[10px] text-emerald-600 font-bold">● Operations Active</p>
            </div>

            <div className="bg-white border border-slate-200/80 rounded-2xl p-3.5 shadow-sm space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Warehouses</span>
              <h3 className="text-xl font-black text-slate-900">{activeWarehousesCount}</h3>
              <p className="text-[10px] text-blue-600 font-bold">● Assigned to Facilities</p>
            </div>

            <div className="bg-white border border-slate-200/80 rounded-2xl p-3.5 shadow-sm space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Active Users</span>
              <h3 className="text-xl font-black text-slate-900">{users.length}</h3>
              <p className="text-[10px] text-purple-600 font-bold">● Location Scope Restricted</p>
            </div>

            <div className="bg-white border border-slate-200/80 rounded-2xl p-3.5 shadow-sm space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Audit Trail Events</span>
              <h3 className="text-xl font-black text-slate-900">{auditLogs.length}</h3>
              <p className="text-[10px] text-emerald-600 font-bold">● Append-Only Logs</p>
            </div>
          </div>

          {/* AUDIT LOG TABLE */}
          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center">
                <FileText className="w-4 h-4 mr-1.5 text-blue-600" /> Multi-criteria Audit Log Trail
              </h3>
              <span className="text-[10px] text-slate-400 font-mono">Real-time Append-Only Records</span>
            </div>

            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-100">
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Module</th>
                  <th className="py-3 px-4">Target Location</th>
                  <th className="py-3 px-4 text-center">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {auditLogs.map((log, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono text-slate-500 text-[11px]">{new Date(log.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td className="py-3 px-4 font-bold text-slate-900">{log.userName || 'Admin'}</td>
                    <td className="py-3 px-4"><span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-bold text-[10px] rounded-md">{log.role || 'Admin'}</span></td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-md font-black text-[10px] uppercase ${
                        log.action === 'DEACTIVATE' ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-600">{log.module || 'General'}</td>
                    <td className="py-3 px-4 font-bold text-slate-900">{log.locationName || 'System'}</td>
                    <td className="py-3 px-4 text-center">
                      <button onClick={() => setSelectedAuditDetail(log)} className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 font-bold text-xs rounded-lg transition-colors">Inspect</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: + ADD SITE */}
      {showAddSiteModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form onSubmit={handleCreateSite} className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-900 flex items-center"><Building2 className="w-4 h-4 text-blue-600 mr-2" /> Register New Site</h3>
              <button type="button" onClick={() => setShowAddSiteModal(false)} className="text-slate-400 font-bold">✕</button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Site Code:</label>
                <input type="text" required placeholder="e.g. HYD-02" value={newSite.code} onChange={(e) => setNewSite({ ...newSite, code: e.target.value })} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900" />
              </div>
              <div>
                <label className="block text-slate-700 font-bold mb-1">Site Name:</label>
                <input type="text" required placeholder="e.g. Hyderabad Plant Phase II" value={newSite.name} onChange={(e) => setNewSite({ ...newSite, name: e.target.value })} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900" />
              </div>
              <div>
                <label className="block text-slate-700 font-bold mb-1">Facility Type:</label>
                <select value={newSite.type} onChange={(e) => setNewSite({ ...newSite, type: e.target.value })} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900">
                  <option value="Manufacturing Plant">Manufacturing Plant</option>
                  <option value="Distribution Center">Distribution Center</option>
                  <option value="R&D Center">R&D Center</option>
                </select>
              </div>
            </div>
            <div className="pt-3 border-t border-slate-100 flex justify-end space-x-2">
              <button type="button" onClick={() => setShowAddSiteModal(false)} className="px-3.5 py-1.5 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl">Cancel</button>
              <button type="submit" className="px-3.5 py-1.5 bg-blue-600 text-white font-bold text-xs rounded-xl shadow-md">Create Site</button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: + ADD WAREHOUSE */}
      {showAddWarehouseModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form onSubmit={handleCreateWarehouse} className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-900 flex items-center"><Warehouse className="w-4 h-4 text-purple-600 mr-2" /> Register New Warehouse</h3>
              <button type="button" onClick={() => setShowAddWarehouseModal(false)} className="text-slate-400 font-bold">✕</button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Warehouse Code:</label>
                <input type="text" required placeholder="e.g. HYD-WIP" value={newWarehouse.code} onChange={(e) => setNewWarehouse({ ...newWarehouse, code: e.target.value })} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900" />
              </div>
              <div>
                <label className="block text-slate-700 font-bold mb-1">Warehouse Name:</label>
                <input type="text" required placeholder="e.g. WIP Storage Bay" value={newWarehouse.name} onChange={(e) => setNewWarehouse({ ...newWarehouse, name: e.target.value })} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900" />
              </div>
              <div>
                <label className="block text-slate-700 font-bold mb-1">Parent Site Assignment:</label>
                <select value={newWarehouse.siteId} onChange={(e) => setNewWarehouse({ ...newWarehouse, siteId: e.target.value })} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900">
                  <option value="">Unassigned</option>
                  {sites.map(s => <option key={s._id} value={s._id}>{s.name} ({s.code})</option>)}
                </select>
              </div>
            </div>
            <div className="pt-3 border-t border-slate-100 flex justify-end space-x-2">
              <button type="button" onClick={() => setShowAddWarehouseModal(false)} className="px-3.5 py-1.5 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl">Cancel</button>
              <button type="submit" className="px-3.5 py-1.5 bg-purple-600 text-white font-bold text-xs rounded-xl shadow-md">Create Warehouse</button>
            </div>
          </form>
        </div>
      )}

      {/* INSPECTOR DRAWER */}
      {selectedWarehouseDetail && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-900 flex items-center"><Warehouse className="w-4 h-4 text-blue-600 mr-2" /> Warehouse Inspector</h3>
              <button onClick={() => setSelectedWarehouseDetail(null)} className="text-slate-400 font-bold">✕</button>
            </div>
            <div className="space-y-2 text-xs font-semibold text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <p><strong>Name:</strong> {selectedWarehouseDetail.name}</p>
              <p><strong>Code:</strong> {selectedWarehouseDetail.code}</p>
              <p><strong>Type:</strong> {selectedWarehouseDetail.type}</p>
              <p><strong>Site:</strong> {selectedWarehouseDetail.siteId?.name || 'Unassigned'}</p>
              <p><strong>Status:</strong> {selectedWarehouseDetail.status}</p>
            </div>
            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button onClick={() => setSelectedWarehouseDetail(null)} className="px-4 py-1.5 bg-slate-900 text-white font-bold text-xs rounded-xl">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NetworkAndSites;
