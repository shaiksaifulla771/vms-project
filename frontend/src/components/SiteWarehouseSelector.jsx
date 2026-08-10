import React, { useState, useEffect } from 'react';
import api from '../services/api';

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
  const [sites, setSites] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLocations = async () => {
      setLoading(true);
      try {
        const [sitesRes, whRes] = await Promise.all([
          api.get('/api/sites'),
          api.get('/api/warehouses')
        ]);

        const sitesList = sitesRes.data?.sites || sitesRes.data?.data || [];
        const whList = whRes.data?.warehouses || whRes.data?.data || [];

        setSites(sitesList);
        setWarehouses(whList);

        const stored = getStoredContext();
        let initialSite = stored.siteId || (sitesList[0] ? sitesList[0]._id : '');
        let initialWh = stored.warehouseId || (whList[0] ? whList[0]._id : '');

        setSelectedSiteId(initialSite);
        setSelectedWarehouseId(initialWh);

        if (onContextChange) {
          onContextChange({ siteId: initialSite, warehouseId: initialWh });
        }
      } catch (err) {
        console.error('Failed to load site/warehouse selector context:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchLocations();
  }, []);

  const handleSiteChange = (e) => {
    const siteId = e.target.value;
    setSelectedSiteId(siteId);

    const matchingWhs = warehouses.filter(w => !siteId || (w.siteId?._id || w.siteId) === siteId);
    const newWhId = matchingWhs[0] ? matchingWhs[0]._id : '';
    setSelectedWarehouseId(newWhId);

    try {
      sessionStorage.setItem(STORAGE_KEY_SITE, siteId);
      sessionStorage.setItem(STORAGE_KEY_WH, newWhId);
      localStorage.setItem(STORAGE_KEY_SITE, siteId);
      localStorage.setItem(STORAGE_KEY_WH, newWhId);
    } catch (e) {}

    if (onContextChange) {
      onContextChange({ siteId, warehouseId: newWhId });
    }
  };

  const handleWarehouseChange = (e) => {
    const whId = e.target.value;
    setSelectedWarehouseId(whId);

    try {
      sessionStorage.setItem(STORAGE_KEY_WH, whId);
      localStorage.setItem(STORAGE_KEY_WH, whId);
    } catch (e) {}

    if (onContextChange) {
      onContextChange({ siteId: selectedSiteId, warehouseId: whId });
    }
  };

  const filteredWarehouses = warehouses.filter(w =>
    !selectedSiteId || (w.siteId?._id || w.siteId) === selectedSiteId
  );

  return (
    <div className={`bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between gap-3 text-xs ${className}`}>
      <div className="flex items-center space-x-2 font-bold text-slate-700">
        <span className="text-slate-400 uppercase text-[10px] tracking-wider">Context:</span>
        <span className="text-blue-600">{sites.find(s => s._id === selectedSiteId)?.name || 'All Sites'}</span>
        <span className="text-slate-300">/</span>
        <span className="text-slate-900">{warehouses.find(w => w._id === selectedWarehouseId)?.name || 'All Warehouses'}</span>
      </div>

      <div className="flex items-center gap-2">
        <select
          value={selectedSiteId}
          onChange={handleSiteChange}
          disabled={loading}
          className="px-2.5 py-1 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none"
        >
          <option value="">All Sites</option>
          {sites.map(site => (
            <option key={site._id} value={site._id}>{site.name}</option>
          ))}
        </select>

        <select
          value={selectedWarehouseId}
          onChange={handleWarehouseChange}
          disabled={loading}
          className="px-2.5 py-1 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none"
        >
          <option value="">All Warehouses</option>
          {filteredWarehouses.map(wh => (
            <option key={wh._id} value={wh._id}>{wh.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
};

export default SiteWarehouseSelector;
