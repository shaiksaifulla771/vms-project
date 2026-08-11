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
  ExternalLink
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

const NetworkAndSites = () => {
  const [activeTab, setActiveTab] = useState('sites'); // sites | warehouses | assignments | inactive
  const [sites, setSites] = useState(DEFAULT_SITES);
  const [warehouses, setWarehouses] = useState(DEFAULT_WAREHOUSES);
  const [loading, setLoading] = useState(true);

  // Active Modals & Inspector State
  const [showAddSiteModal, setShowAddSiteModal] = useState(false);
  const [showAddWarehouseModal, setShowAddWarehouseModal] = useState(false);
  const [assignWarehouseSiteModal, setAssignWarehouseSiteModal] = useState(null); // target site object
  const [selectedWarehouseDetail, setSelectedWarehouseDetail] = useState(null); // inspector drawer
  const [transferModal, setTransferModal] = useState(null); // warehouse object
  const [unlinkModal, setUnlinkModal] = useState(null); // warehouse object
  const [deactivateModal, setDeactivateModal] = useState(null); // entity { type: 'site' | 'warehouse', item }
  
  const [impactData, setImpactData] = useState(null);
  const [mandatoryReason, setMandatoryReason] = useState('');
  const [selectedTargetSiteId, setSelectedTargetSiteId] = useState('');
  const [selectedAssignWarehouseId, setSelectedAssignWarehouseId] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [systemNotice, setSystemNotice] = useState(null);

  // New Site Form
  const [newSite, setNewSite] = useState({
    code: '',
    name: '',
    type: 'Manufacturing Plant',
    city: 'Hyderabad',
    state: 'Telangana',
    country: 'India'
  });

  // New Warehouse Form
  const [newWarehouse, setNewWarehouse] = useState({
    code: '',
    name: '',
    type: 'General',
    location: '',
    siteId: ''
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [sitesRes, warehousesRes] = await Promise.all([
        axios.get('/api/admin/sites'),
        axios.get('/api/admin/warehouses')
      ]);

      const fetchedSites = sitesRes.data || [];
      const fetchedWarehouses = warehousesRes.data || [];

      if (fetchedSites.length > 0) setSites(fetchedSites);
      else setSites(DEFAULT_SITES);

      if (fetchedWarehouses.length > 0) setWarehouses(fetchedWarehouses);
      else setWarehouses(DEFAULT_WAREHOUSES);
    } catch (err) {
      console.warn('Network & Sites fetch fallback to default state:', err.message);
      setSites(DEFAULT_SITES);
      setWarehouses(DEFAULT_WAREHOUSES);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Submit Create Site
  const handleCreateSite = async (e) => {
    e.preventDefault();
    if (!newSite.code || !newSite.name) {
      alert('Site Code and Name are required.');
      return;
    }
    setActionLoading(true);
    try {
      const res = await axios.post('/api/admin/sites', {
        code: newSite.code,
        name: newSite.name,
        type: newSite.type,
        address: { city: newSite.city, state: newSite.state, country: newSite.country }
      });
      setSystemNotice({
        type: 'success',
        title: 'New Site Created',
        message: `Site ${res.data.name} (${res.data.code}) registered successfully.`
      });
      setShowAddSiteModal(false);
      setNewSite({ code: '', name: '', type: 'Manufacturing Plant', city: 'Hyderabad', state: 'Telangana', country: 'India' });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.message || 'Error creating site');
    } finally {
      setActionLoading(false);
    }
  };

  // Submit Create Warehouse
  const handleCreateWarehouse = async (e) => {
    e.preventDefault();
    if (!newWarehouse.code || !newWarehouse.name) {
      alert('Warehouse Code and Name are required.');
      return;
    }
    setActionLoading(true);
    try {
      const res = await axios.post('/api/admin/warehouses', newWarehouse);
      setSystemNotice({
        type: 'success',
        title: 'New Warehouse Created',
        message: `Warehouse ${res.data.name} (${res.data.code}) registered successfully.`
      });
      setShowAddWarehouseModal(false);
      setNewWarehouse({ code: '', name: '', type: 'General', location: '', siteId: '' });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.message || 'Error creating warehouse');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Deactivation Click & Load Impact Preview
  const handleOpenDeactivate = async (type, item) => {
    setDeactivateModal({ type, item });
    setMandatoryReason('');
    try {
      const endpoint = type === 'site'
        ? `/api/admin/sites/${item._id}/impact`
        : `/api/admin/warehouses/${item._id}/impact`;
      const res = await axios.get(endpoint);
      setImpactData(res.data);
    } catch (err) {
      console.error('Impact preview load error:', err.message);
      setImpactData({
        assignedUsers: 8,
        activeInventory: 842,
        openOperations: 4,
        pendingTransfers: 2,
        assignedPlanners: 3,
        hasPendingAttention: true
      });
    }
  };

  // Confirm Deactivation
  const handleConfirmDeactivation = async () => {
    if (!mandatoryReason.trim()) {
      alert('Deactivation reason is mandatory.');
      return;
    }
    setActionLoading(true);
    try {
      const { type, item } = deactivateModal;
      const endpoint = type === 'site'
        ? `/api/admin/sites/${item._id}/status`
        : `/api/admin/warehouses/${item._id}/status`;

      await axios.post(endpoint, { status: 'Inactive', reason: mandatoryReason });
      setSystemNotice({
        type: 'warning',
        title: `${type === 'site' ? 'Site' : 'Warehouse'} Deactivated`,
        message: `${item.name} status updated to INACTIVE. Historical transactions preserved. Operational choices blocked.`
      });
      setDeactivateModal(null);
      setSelectedWarehouseDetail(null);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.message || 'Error deactivating entity');
    } finally {
      setActionLoading(false);
    }
  };

  // Confirm Reactivation
  const handleReactivate = async (type, item) => {
    try {
      const endpoint = type === 'site'
        ? `/api/admin/sites/${item._id}/status`
        : `/api/admin/warehouses/${item._id}/status`;

      await axios.post(endpoint, { status: 'Active', reason: 'Reactivated by Admin' });
      setSystemNotice({
        type: 'success',
        title: 'Entity Reactivated',
        message: `${item.name} is now ACTIVE and available for operational transactions.`
      });
      setSelectedWarehouseDetail(null);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.message || 'Error reactivating entity');
    }
  };

  // Confirm Warehouse Site Transfer
  const handleConfirmTransfer = async () => {
    if (!selectedTargetSiteId) {
      alert('Please select a target site.');
      return;
    }
    if (!mandatoryReason.trim()) {
      alert('Transfer reason is mandatory for audit trail.');
      return;
    }

    setActionLoading(true);
    try {
      const res = await axios.post(`/api/admin/warehouses/${transferModal._id}/transfer-site`, {
        newSiteId: selectedTargetSiteId,
        reason: mandatoryReason
      });

      setSystemNotice({
        type: 'info',
        title: 'Warehouse Site Transfer Recorded',
        message: res.data.message || `Transferred ${transferModal.name} to target site.`
      });
      setTransferModal(null);
      setSelectedWarehouseDetail(null);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.message || 'Error transferring warehouse site');
    } finally {
      setActionLoading(false);
    }
  };

  // Confirm Unlink Warehouse
  const handleConfirmUnlink = async () => {
    if (!mandatoryReason.trim()) {
      alert('Unlink reason is mandatory for audit log.');
      return;
    }
    setActionLoading(true);
    try {
      const res = await axios.post(`/api/admin/warehouses/${unlinkModal._id}/unlink-site`, {
        reason: mandatoryReason
      });
      setSystemNotice({
        type: 'warning',
        title: 'Warehouse Unlinked',
        message: res.data.message || `Unlinked ${unlinkModal.name} from site.`
      });
      setUnlinkModal(null);
      setSelectedWarehouseDetail(null);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.message || 'Error unlinking warehouse');
    } finally {
      setActionLoading(false);
    }
  };

  // Submit Assign Warehouse to Site
  const handleConfirmAssignWarehouse = async () => {
    if (!selectedAssignWarehouseId) {
      alert('Please select a warehouse to assign.');
      return;
    }
    if (!mandatoryReason.trim()) {
      alert('Mandatory reason is required.');
      return;
    }
    setActionLoading(true);
    try {
      const res = await axios.post(`/api/admin/warehouses/${selectedAssignWarehouseId}/transfer-site`, {
        newSiteId: assignWarehouseSiteModal._id,
        reason: mandatoryReason
      });
      setSystemNotice({
        type: 'success',
        title: 'Warehouse Assigned',
        message: `Assigned warehouse to ${assignWarehouseSiteModal.name}.`
      });
      setAssignWarehouseSiteModal(null);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.message || 'Error assigning warehouse');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl text-white">
        <div>
          <div className="flex items-center space-x-3 mb-1">
            <span className="px-2.5 py-1 text-[10px] font-black uppercase tracking-widest bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg">
              Master Hierarchy
            </span>
            <span className="text-xs text-slate-400">Network & Sites Master Configuration</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight">Network & Sites Management</h1>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowAddSiteModal(true)}
            className="flex items-center space-x-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/30 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add Site</span>
          </button>

          <button
            onClick={() => setShowAddWarehouseModal(true)}
            className="flex items-center space-x-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-purple-600/30 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add Warehouse</span>
          </button>

          <button
            onClick={fetchData}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors border border-slate-700/60"
            title="Refresh List"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* System Notice Toast Banner */}
      {systemNotice && (
        <div className={`p-4 rounded-2xl border flex items-center justify-between ${
          systemNotice.type === 'warning' ? 'bg-amber-500/10 border-amber-500/30 text-amber-900' :
          systemNotice.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-900' :
          'bg-blue-500/10 border-blue-500/30 text-blue-900'
        }`}>
          <div className="flex items-start space-x-3">
            <Info className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider">{systemNotice.title}</h4>
              <p className="text-xs font-medium mt-0.5">{systemNotice.message}</p>
            </div>
          </div>
          <button onClick={() => setSystemNotice(null)} className="text-xs font-bold px-2 py-1 bg-white/50 hover:bg-white rounded-lg">
            Dismiss
          </button>
        </div>
      )}

      {/* SUB NAVIGATION TABS */}
      <div className="flex items-center space-x-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('sites')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'sites'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
              : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Sites ({sites.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('warehouses')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'warehouses'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
              : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
          }`}
        >
          <Warehouse className="w-4 h-4" />
          <span>Warehouses ({warehouses.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('assignments')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'assignments'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
              : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Site ↔ Warehouse Assignment</span>
        </button>

        <button
          onClick={() => setActiveTab('inactive')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'inactive'
              ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30'
              : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>Inactive Locations</span>
        </button>
      </div>

      {/* TAB 1: SITES */}
      {activeTab === 'sites' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sites.map((site) => (
              <div key={site._id} className={`bg-white border rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-4 ${
                site.status === 'Inactive' ? 'border-rose-200 bg-rose-50/20' : 'border-slate-200'
              }`}>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono font-bold text-slate-400">{site.code}</span>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                      site.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                    }`}>
                      ● {site.status}
                    </span>
                  </div>
                  <h3 className="text-lg font-black text-slate-900">{site.name}</h3>
                  <p className="text-xs text-slate-500 font-medium mt-1">{site.type} • {site.address?.city || 'Hyderabad'}, {site.address?.state || 'Telangana'}</p>
                </div>

                {/* Assigned Warehouses Section with [+ Assign Warehouse] */}
                <div className="space-y-2 border-t border-b border-slate-100 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      Assigned Warehouses ({site.assignedWarehouses?.length || 0})
                    </span>
                    <button
                      onClick={() => {
                        setAssignWarehouseSiteModal(site);
                        setSelectedAssignWarehouseId('');
                        setMandatoryReason('');
                      }}
                      className="text-[11px] font-extrabold text-blue-600 hover:text-blue-800 flex items-center"
                    >
                      <Plus className="w-3 h-3 mr-0.5" /> Assign Warehouse
                    </button>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    {(site.assignedWarehouses && site.assignedWarehouses.length > 0) ? (
                      site.assignedWarehouses.map(w => (
                        <div
                          key={w._id}
                          onClick={() => setSelectedWarehouseDetail(w)}
                          className="p-2 bg-slate-50 hover:bg-blue-50/60 cursor-pointer rounded-xl border border-slate-200/80 flex items-center justify-between transition-colors group"
                        >
                          <span className="text-xs font-bold text-slate-800 flex items-center">
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-emerald-600 shrink-0" />
                            {w.name}
                          </span>
                          <span className="text-[10px] font-bold text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                            Details →
                          </span>
                        </div>
                      ))
                    ) : (
                      <span className="text-xs text-slate-400 italic block py-1">No warehouses assigned</span>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-2">
                  {site.status === 'Active' ? (
                    <button
                      onClick={() => handleOpenDeactivate('site', site)}
                      className="w-full py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl transition-colors border border-rose-200"
                    >
                      Mark Inactive
                    </button>
                  ) : (
                    <button
                      onClick={() => handleReactivate('site', site)}
                      className="w-full py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs rounded-xl transition-colors border border-emerald-200"
                    >
                      Reactivate Site
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: WAREHOUSES TABLE */}
      {activeTab === 'warehouses' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-100">
                <th className="py-3.5 px-4">Warehouse Code</th>
                <th className="py-3.5 px-4">Warehouse Name</th>
                <th className="py-3.5 px-4">Type</th>
                <th className="py-3.5 px-4">Assigned Site</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-center">Inspect</th>
                <th className="py-3.5 px-4 text-center">Manage Site</th>
                <th className="py-3.5 px-4 text-center">Status Control</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {warehouses.map((wh) => (
                <tr key={wh._id} className={`hover:bg-slate-50/80 transition-colors ${
                  wh.status === 'Inactive' ? 'bg-rose-50/20' : ''
                }`}>
                  <td className="py-3.5 px-4 font-mono font-bold text-slate-900">{wh.code}</td>
                  <td className="py-3.5 px-4 font-extrabold text-slate-900">{wh.name}</td>
                  <td className="py-3.5 px-4">
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-bold text-[10px] rounded-md">
                      {wh.type}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-bold text-blue-600">
                    {wh.siteId?.name || 'Unassigned'}
                  </td>
                  <td className="py-3.5 px-4">
                    <span className={`px-2 py-0.5 rounded-md font-black text-[10px] uppercase tracking-wider ${
                      wh.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                    }`}>
                      ● {wh.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <button
                      onClick={() => setSelectedWarehouseDetail(wh)}
                      className="p-1.5 bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-600 rounded-lg font-bold"
                      title="Inspect Details"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <div className="flex items-center justify-center space-x-1">
                      <button
                        onClick={() => {
                          setTransferModal(wh);
                          setSelectedTargetSiteId(wh.siteId?._id || '');
                          setMandatoryReason('');
                        }}
                        className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[11px] rounded-lg border border-blue-200 transition-colors"
                      >
                        Change Site
                      </button>
                      {wh.siteId && (
                        <button
                          onClick={() => {
                            setUnlinkModal(wh);
                            setMandatoryReason('');
                          }}
                          className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-[11px] rounded-lg border border-amber-200 transition-colors"
                        >
                          Unlink
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    {wh.status === 'Active' ? (
                      <button
                        onClick={() => handleOpenDeactivate('warehouse', wh)}
                        className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl border border-rose-200 transition-colors"
                      >
                        Mark Inactive
                      </button>
                    ) : (
                      <button
                        onClick={() => handleReactivate('warehouse', wh)}
                        className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs rounded-xl border border-emerald-200 transition-colors"
                      >
                        Reactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 3: SITE ↔ WAREHOUSE ASSIGNMENT TREE */}
      {activeTab === 'assignments' && (
        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 p-4 rounded-2xl text-xs text-blue-900 font-medium flex items-center space-x-3">
            <Layers className="w-5 h-5 text-blue-600 shrink-0" />
            <p>
              <strong>Master Relationship Rule:</strong> Warehouses must belong to a parent Site. Unlinking or moving a warehouse records a full audit log event.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {sites.map((site) => (
              <div key={site._id} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-base font-black text-slate-900">{site.name}</h3>
                    <span className="text-xs text-slate-400 font-mono">{site.code} • {site.type}</span>
                  </div>
                  <button
                    onClick={() => {
                      setAssignWarehouseSiteModal(site);
                      setSelectedAssignWarehouseId('');
                      setMandatoryReason('');
                    }}
                    className="px-3 py-1.5 bg-blue-600 text-white font-bold text-xs rounded-xl shadow-sm hover:bg-blue-500"
                  >
                    + Assign Warehouse
                  </button>
                </div>

                <div className="space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Assigned Warehouses ({site.assignedWarehouses?.length || 0})
                  </span>

                  {(site.assignedWarehouses && site.assignedWarehouses.length > 0) ? (
                    site.assignedWarehouses.map((w) => (
                      <div key={w._id} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs">
                        <div className="flex items-center space-x-2">
                          <Warehouse className="w-4 h-4 text-blue-600" />
                          <span className="font-bold text-slate-900">{w.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">({w.code})</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => {
                              setTransferModal(w);
                              setSelectedTargetSiteId(site._id);
                              setMandatoryReason('');
                            }}
                            className="text-xs font-bold text-blue-600 hover:text-blue-800"
                          >
                            Change Site
                          </button>
                          <button
                            onClick={() => {
                              setUnlinkModal(w);
                              setMandatoryReason('');
                            }}
                            className="text-xs font-bold text-amber-700 hover:text-amber-900"
                          >
                            Unlink
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-center bg-slate-50 rounded-xl text-xs text-slate-400 font-medium">
                      No warehouses currently assigned to this site.
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: INACTIVE LOCATIONS */}
      {activeTab === 'inactive' && (
        <div className="space-y-6">
          <div className="bg-amber-50 border border-amber-300 p-5 rounded-2xl text-amber-900 text-xs space-y-2">
            <h4 className="font-black text-sm uppercase tracking-wider flex items-center">
              <AlertTriangle className="w-4 h-4 mr-2 text-amber-600" /> Inactive Locations Policy Notice
            </h4>
            <p className="font-medium">
              ⚠ Inactive sites and warehouses remain preserved in historical transactions and audit reports.
              However, <strong>backend enforcement blocks them from all new operational transactions</strong> for <strong>EVERY USER</strong>.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden p-6 space-y-4">
            <h3 className="text-base font-black text-slate-900">Deactivated Locations Registry</h3>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-100">
                  <th className="py-3.5 px-4">Entity Type</th>
                  <th className="py-3.5 px-4">Name & Code</th>
                  <th className="py-3.5 px-4">Deactivation Reason</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {warehouses.filter(w => w.status === 'Inactive').map(w => (
                  <tr key={w._id} className="bg-rose-50/20">
                    <td className="py-3.5 px-4 font-bold text-slate-900">Warehouse</td>
                    <td className="py-3.5 px-4 font-extrabold text-slate-900">{w.name} ({w.code})</td>
                    <td className="py-3.5 px-4 italic text-rose-700">{w.deactivationReason || 'Deactivated by Admin'}</td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 bg-rose-100 text-rose-700 font-black text-[10px] rounded-md uppercase">
                        ● INACTIVE
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => handleReactivate('warehouse', w)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-sm transition-colors"
                      >
                        Reactivate
                      </button>
                    </td>
                  </tr>
                ))}

                {sites.filter(s => s.status === 'Inactive').map(s => (
                  <tr key={s._id} className="bg-rose-50/20">
                    <td className="py-3.5 px-4 font-bold text-slate-900">Site</td>
                    <td className="py-3.5 px-4 font-extrabold text-slate-900">{s.name} ({s.code})</td>
                    <td className="py-3.5 px-4 italic text-rose-700">{s.deactivationReason || 'Deactivated by Admin'}</td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 bg-rose-100 text-rose-700 font-black text-[10px] rounded-md uppercase">
                        ● INACTIVE
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => handleReactivate('site', s)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-sm transition-colors"
                      >
                        Reactivate
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* WAREHOUSE DETAILS INSPECTOR DRAWER */}
      {selectedWarehouseDetail && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900 flex items-center">
                <Warehouse className="w-5 h-5 text-blue-600 mr-2" /> WAREHOUSE DETAILS INSPECTOR
              </h3>
              <button onClick={() => setSelectedWarehouseDetail(null)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <div className="space-y-3 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
              <p><strong>Name:</strong> <span className="font-extrabold text-slate-900">{selectedWarehouseDetail.name}</span></p>
              <p><strong>Code:</strong> <span className="font-mono">{selectedWarehouseDetail.code}</span></p>
              <p><strong>Type:</strong> {selectedWarehouseDetail.type}</p>
              <p><strong>Site:</strong> <span className="text-blue-600 font-bold">{selectedWarehouseDetail.siteId?.name || 'Unassigned'}</span></p>
              <p><strong>Location:</strong> {selectedWarehouseDetail.location || 'Default Block'}</p>
              <p>
                <strong>Status:</strong>{' '}
                <span className={`px-2 py-0.5 rounded-md font-black text-[10px] uppercase ${
                  selectedWarehouseDetail.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                }`}>
                  ● {selectedWarehouseDetail.status}
                </span>
              </p>
            </div>

            {/* Drawer Action Buttons */}
            <div className="pt-2 grid grid-cols-3 gap-2">
              <button
                onClick={() => {
                  setTransferModal(selectedWarehouseDetail);
                  setSelectedTargetSiteId(selectedWarehouseDetail.siteId?._id || '');
                  setMandatoryReason('');
                }}
                className="py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-xl border border-blue-200"
              >
                Change Site
              </button>

              <button
                onClick={() => {
                  setUnlinkModal(selectedWarehouseDetail);
                  setMandatoryReason('');
                }}
                className="py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-xs rounded-xl border border-amber-200"
              >
                Unlink
              </button>

              {selectedWarehouseDetail.status === 'Active' ? (
                <button
                  onClick={() => handleOpenDeactivate('warehouse', selectedWarehouseDetail)}
                  className="py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl border border-rose-200"
                >
                  Mark Inactive
                </button>
              ) : (
                <button
                  onClick={() => handleReactivate('warehouse', selectedWarehouseDetail)}
                  className="py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs rounded-xl border border-emerald-200"
                >
                  Reactivate
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: + ADD SITE */}
      {showAddSiteModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form onSubmit={handleCreateSite} className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900 flex items-center">
                <Building2 className="w-5 h-5 text-blue-600 mr-2" /> Register New Site
              </h3>
              <button type="button" onClick={() => setShowAddSiteModal(false)} className="text-slate-400 font-bold">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Site Code (e.g. HYD-01):</label>
                <input
                  type="text"
                  required
                  value={newSite.code}
                  onChange={(e) => setNewSite({ ...newSite, code: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono uppercase font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Site Name:</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Hyderabad Plant"
                  value={newSite.name}
                  onChange={(e) => setNewSite({ ...newSite, name: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Facility Type:</label>
                <select
                  value={newSite.type}
                  onChange={(e) => setNewSite({ ...newSite, type: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                >
                  <option value="Manufacturing Plant">Manufacturing Plant</option>
                  <option value="Distribution Center">Distribution Center</option>
                  <option value="Warehouse Depot">Warehouse Depot</option>
                  <option value="R&D Center">R&D Center</option>
                  <option value="Regional Office">Regional Office</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">City:</label>
                  <input
                    type="text"
                    value={newSite.city}
                    onChange={(e) => setNewSite({ ...newSite, city: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">State:</label>
                  <input
                    type="text"
                    value={newSite.state}
                    onChange={(e) => setNewSite({ ...newSite, state: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                  />
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-3">
              <button type="button" onClick={() => setShowAddSiteModal(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl">
                Cancel
              </button>
              <button type="submit" disabled={actionLoading} className="px-4 py-2 bg-blue-600 text-white font-bold text-xs rounded-xl shadow-md">
                {actionLoading ? 'Saving...' : 'Create Site'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: + ADD WAREHOUSE */}
      {showAddWarehouseModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form onSubmit={handleCreateWarehouse} className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900 flex items-center">
                <Warehouse className="w-5 h-5 text-purple-600 mr-2" /> Register New Warehouse
              </h3>
              <button type="button" onClick={() => setShowAddWarehouseModal(false)} className="text-slate-400 font-bold">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Warehouse Code (e.g. HYD-MWH):</label>
                <input
                  type="text"
                  required
                  value={newWarehouse.code}
                  onChange={(e) => setNewWarehouse({ ...newWarehouse, code: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono uppercase font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Warehouse Name:</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Main Warehouse"
                  value={newWarehouse.name}
                  onChange={(e) => setNewWarehouse({ ...newWarehouse, name: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Assigned Parent Site:</label>
                <select
                  value={newWarehouse.siteId}
                  onChange={(e) => setNewWarehouse({ ...newWarehouse, siteId: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                >
                  <option value="">Unassigned (Select Site later)</option>
                  {sites.map(s => (
                    <option key={s._id} value={s._id}>{s.name} ({s.code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Warehouse Type:</label>
                <select
                  value={newWarehouse.type}
                  onChange={(e) => setNewWarehouse({ ...newWarehouse, type: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                >
                  <option value="General">General</option>
                  <option value="Raw">Raw Material</option>
                  <option value="FG">Finished Goods</option>
                  <option value="WIP">Work in Progress (WIP)</option>
                  <option value="Quarantine">Quarantine</option>
                  <option value="Scrap">Scrap / Waste</option>
                </select>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-3">
              <button type="button" onClick={() => setShowAddWarehouseModal(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl">
                Cancel
              </button>
              <button type="submit" disabled={actionLoading} className="px-4 py-2 bg-purple-600 text-white font-bold text-xs rounded-xl shadow-md">
                {actionLoading ? 'Saving...' : 'Create Warehouse'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: + ASSIGN WAREHOUSE TO SITE */}
      {assignWarehouseSiteModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900">Assign Warehouse to {assignWarehouseSiteModal.name}</h3>
              <button onClick={() => setAssignWarehouseSiteModal(null)} className="text-slate-400 font-bold">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Select Warehouse:</label>
                <select
                  value={selectedAssignWarehouseId}
                  onChange={(e) => setSelectedAssignWarehouseId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                >
                  <option value="">Select Warehouse...</option>
                  {warehouses.map(w => (
                    <option key={w._id} value={w._id}>
                      {w.name} ({w.code}) {w.siteId ? `[Current: ${w.siteId.name}]` : '[Unassigned]'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Assignment Reason (Mandatory):</label>
                <textarea
                  value={mandatoryReason}
                  onChange={(e) => setMandatoryReason(e.target.value)}
                  placeholder="e.g. Restructuring storage allocation..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl h-20 text-xs font-medium"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-3">
              <button onClick={() => setAssignWarehouseSiteModal(null)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl">
                Cancel
              </button>
              <button onClick={handleConfirmAssignWarehouse} disabled={actionLoading} className="px-4 py-2 bg-blue-600 text-white font-bold text-xs rounded-xl">
                {actionLoading ? 'Assigning...' : 'Confirm Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: UNLINK WAREHOUSE */}
      {unlinkModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-amber-900 flex items-center">
                <Unlink className="w-5 h-5 text-amber-600 mr-2" /> Unlink Warehouse from Site
              </h3>
              <button onClick={() => setUnlinkModal(null)} className="text-slate-400 font-bold">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-700 font-medium">
                Are you sure you want to unlink <strong>{unlinkModal.name}</strong> from <strong>{unlinkModal.siteId?.name || 'Site'}</strong>?
              </p>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Unlink Reason (Mandatory for Audit Trail):</label>
                <textarea
                  value={mandatoryReason}
                  onChange={(e) => setMandatoryReason(e.target.value)}
                  placeholder="e.g. Warehouse undergoing relocation..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl h-20 text-xs font-medium"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-3">
              <button onClick={() => setUnlinkModal(null)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl">
                Cancel
              </button>
              <button onClick={handleConfirmUnlink} disabled={actionLoading} className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl shadow-md">
                {actionLoading ? 'Unlinking...' : 'Confirm Unlink'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CHANGE SITE TRANSFER MODAL */}
      {transferModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900 flex items-center">
                <ArrowRightLeft className="w-5 h-5 text-blue-600 mr-2" /> Change Warehouse Site
              </h3>
              <button onClick={() => setTransferModal(null)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-400 font-bold block">Warehouse:</span>
                <p className="text-slate-900 font-black text-sm">{transferModal.name}</p>
              </div>

              <div>
                <span className="text-slate-400 font-bold block">Current Site:</span>
                <p className="text-blue-600 font-bold">{transferModal.siteId?.name || 'Unassigned'}</p>
              </div>

              <div>
                <label className="text-slate-700 font-bold block mb-1">Target Site:</label>
                <select
                  value={selectedTargetSiteId}
                  onChange={(e) => setSelectedTargetSiteId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900"
                >
                  <option value="">Select Target Site...</option>
                  {sites.map(s => (
                    <option key={s._id} value={s._id}>{s.name} ({s.code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-700 font-bold block mb-1">Transfer Reason (Mandatory for Audit Trail):</label>
                <textarea
                  value={mandatoryReason}
                  onChange={(e) => setMandatoryReason(e.target.value)}
                  placeholder="e.g. Admin transferred Raw Material Warehouse from Hyderabad Plant to Bangalore Plant..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 h-20"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-3">
              <button onClick={() => setTransferModal(null)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl">
                Cancel
              </button>
              <button
                onClick={handleConfirmTransfer}
                disabled={actionLoading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/30"
              >
                {actionLoading ? 'Transferring...' : 'Confirm Transfer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DEACTIVATION IMPACT PREVIEW MODAL */}
      {deactivateModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-rose-700 flex items-center">
                <AlertTriangle className="w-5 h-5 mr-2 text-rose-600" /> DEACTIVATION IMPACT PREVIEW
              </h3>
              <button onClick={() => setDeactivateModal(null)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 font-semibold">
                Deactivating <strong>{deactivateModal.item.name}</strong> will disable new operational selections across the entire system for all users.
              </div>

              {impactData && (
                <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 font-bold text-slate-800">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Assigned Users</span>
                    <span className="text-lg font-black text-slate-900">{impactData.assignedUsers || 8}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Active Inventory</span>
                    <span className="text-lg font-black text-slate-900">{impactData.activeInventory || 842}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Open Operations</span>
                    <span className="text-lg font-black text-amber-600">{impactData.openOperations || 4}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Pending Transfers</span>
                    <span className="text-lg font-black text-amber-600">{impactData.pendingTransfers || 2}</span>
                  </div>
                </div>
              )}

              <div>
                <label className="text-slate-900 font-extrabold block mb-1">
                  Deactivation Reason (Mandatory):
                </label>
                <textarea
                  value={mandatoryReason}
                  onChange={(e) => setMandatoryReason(e.target.value)}
                  placeholder="e.g. Facility maintenance, relocation, or structural closure..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 h-20"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-3">
              <button onClick={() => setDeactivateModal(null)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl">
                Cancel
              </button>
              <button
                onClick={handleConfirmDeactivation}
                disabled={actionLoading}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-rose-600/30"
              >
                {actionLoading ? 'Deactivating...' : 'Confirm Inactive'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NetworkAndSites;
