import React, { useEffect } from 'react';
import { useSiteContext } from '../context/SiteContext';

const STORAGE_KEY_SITE = 'vms_active_site_id';
const STORAGE_KEY_WH = 'vms_active_warehouse_id';

export const getStoredContext = () => {
  try {
    const siteId = sessionStorage.getItem(STORAGE_KEY_SITE) || localStorage.getItem(STORAGE_KEY_SITE) || '';
    const warehouseId = sessionStorage.getItem(STORAGE_KEY_WH) || localStorage.getItem(STORAGE_KEY_WH) || '';
    return { siteId, warehouseId };
  } catch (e) {
    return { siteId: '', warehouseId: '' };
  }
};

const SiteWarehouseSelector = ({ onContextChange, className = '' }) => {
  const {
    sites,
    filteredWarehouses,
    activeSiteId,
    activeWarehouseId,
    activeSite,
    activeWarehouse,
    setActiveSiteId,
    setActiveWarehouseId,
    loading
  } = useSiteContext();

  useEffect(() => {
    if (onContextChange) {
      onContextChange({ siteId: activeSiteId, warehouseId: activeWarehouseId });
    }
  }, [activeSiteId, activeWarehouseId, onContextChange]);

  return (
    <div className={`bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${className}`}>
      <div className="flex items-center space-x-2 font-bold text-slate-700">
        <span className="text-slate-400 uppercase text-[10px] tracking-wider font-extrabold">Operating Scope:</span>
        <span className="text-blue-600 font-extrabold">{activeSite?.name || 'All Sites'}</span>
        <span className="text-slate-300">/</span>
        <span className="text-slate-900 font-extrabold">{activeWarehouse?.name || 'All Warehouses'}</span>
      </div>

      <div className="flex items-center gap-2">
        <select
          value={activeSiteId}
          onChange={(e) => setActiveSiteId(e.target.value)}
          disabled={loading}
          className="px-3 py-1.5 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <option value="">All Sites</option>
          {sites.map(site => (
            <option key={site._id} value={site._id}>{site.name} ({site.code || 'SITE'})</option>
          ))}
        </select>

        <select
          value={activeWarehouseId || 'all'}
          onChange={(e) => setActiveWarehouseId(e.target.value === 'all' ? '' : e.target.value)}
          disabled={loading}
          className="px-3 py-1.5 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <option value="all">All Warehouses</option>
          {filteredWarehouses.map(wh => (
            <option key={wh._id} value={wh._id}>{wh.name} ({wh.type})</option>
          ))}
        </select>
      </div>
    </div>
  );
};

export default SiteWarehouseSelector;
