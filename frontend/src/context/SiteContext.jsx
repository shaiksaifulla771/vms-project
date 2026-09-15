import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import api from '../services/api';

const STORAGE_KEY_SITE = 'vms_active_site_id';
const STORAGE_KEY_WH = 'vms_active_warehouse_id';

const SiteContext = createContext(null);

export const SiteProvider = ({ children }) => {
  const [sites, setSites] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [activeSiteId, setActiveSiteIdState] = useState(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY_SITE) || localStorage.getItem(STORAGE_KEY_SITE) || '';
    } catch (e) {
      return '';
    }
  });
  const [activeWarehouseId, setActiveWarehouseIdState] = useState(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY_WH) || localStorage.getItem(STORAGE_KEY_WH) || '';
    } catch (e) {
      return '';
    }
  });
  const [loading, setLoading] = useState(true);

  // Fetch all sites and warehouses once on application load
  const fetchLocations = useCallback(async () => {
    setLoading(true);
    try {
      const [sitesRes, whRes] = await Promise.all([
        api.get('/api/sites').catch(() => ({ data: { sites: [], data: [] } })),
        api.get('/api/warehouses').catch(() => ({ data: { warehouses: [], data: [] } })),
      ]);

      const sitesList = sitesRes.data?.sites || sitesRes.data?.data || [];
      const whList = whRes.data?.warehouses || whRes.data?.data || [];

      setSites(sitesList);
      setWarehouses(whList);

      // If no activeSiteId stored or stored ID no longer exists, default to the first active site
      const storedSite = sessionStorage.getItem(STORAGE_KEY_SITE) || localStorage.getItem(STORAGE_KEY_SITE) || '';
      let effectiveSiteId = storedSite;
      if (!effectiveSiteId || !sitesList.some(s => s._id === effectiveSiteId)) {
        if (sitesList.length > 0) {
          effectiveSiteId = sitesList[0]._id;
        }
      }

      // If no activeWarehouseId stored or stored ID doesn't belong to the site, default to 'all' or empty
      const storedWh = sessionStorage.getItem(STORAGE_KEY_WH) || localStorage.getItem(STORAGE_KEY_WH) || '';
      let effectiveWhId = storedWh;
      if (effectiveSiteId && effectiveWhId && effectiveWhId !== 'all') {
        const belongs = whList.some(w => w._id === effectiveWhId && (w.siteId?._id || w.siteId) === effectiveSiteId);
        if (!belongs) {
          effectiveWhId = '';
        }
      }

      setActiveSiteIdState(effectiveSiteId);
      setActiveWarehouseIdState(effectiveWhId);

      try {
        if (effectiveSiteId) {
          localStorage.setItem(STORAGE_KEY_SITE, effectiveSiteId);
          sessionStorage.setItem(STORAGE_KEY_SITE, effectiveSiteId);
        }
        if (effectiveWhId) {
          localStorage.setItem(STORAGE_KEY_WH, effectiveWhId);
          sessionStorage.setItem(STORAGE_KEY_WH, effectiveWhId);
        }
      } catch (e) {}
    } catch (err) {
      console.error('[SiteContext] Failed to load sites & warehouses:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  // Set Active Site and automatically update/reset warehouse
  const setActiveSiteId = useCallback((newSiteId) => {
    setActiveSiteIdState(newSiteId);
    try {
      if (newSiteId) {
        localStorage.setItem(STORAGE_KEY_SITE, newSiteId);
        sessionStorage.setItem(STORAGE_KEY_SITE, newSiteId);
      } else {
        localStorage.removeItem(STORAGE_KEY_SITE);
        sessionStorage.removeItem(STORAGE_KEY_SITE);
      }
    } catch (e) {}

    // Verify if current activeWarehouseId is valid for the newly selected site
    setActiveWarehouseIdState((prevWhId) => {
      let nextWhId = prevWhId;
      if (newSiteId && prevWhId && prevWhId !== 'all') {
        const belongs = warehouses.some(w => w._id === prevWhId && (w.siteId?._id || w.siteId) === newSiteId);
        if (!belongs) {
          nextWhId = '';
        }
      }
      try {
        if (nextWhId) {
          localStorage.setItem(STORAGE_KEY_WH, nextWhId);
          sessionStorage.setItem(STORAGE_KEY_WH, nextWhId);
        } else {
          localStorage.removeItem(STORAGE_KEY_WH);
          sessionStorage.removeItem(STORAGE_KEY_WH);
        }
      } catch (e) {}
      return nextWhId;
    });
  }, [warehouses]);

  // Set Active Warehouse
  const setActiveWarehouseId = useCallback((newWhId) => {
    setActiveWarehouseIdState(newWhId);
    try {
      if (newWhId) {
        localStorage.setItem(STORAGE_KEY_WH, newWhId);
        sessionStorage.setItem(STORAGE_KEY_WH, newWhId);
      } else {
        localStorage.removeItem(STORAGE_KEY_WH);
        sessionStorage.removeItem(STORAGE_KEY_WH);
      }
    } catch (e) {}
  }, []);

  // Filtered warehouses for active site
  const filteredWarehouses = useMemo(() => {
    if (!activeSiteId) return warehouses;
    return warehouses.filter(w => (w.siteId?._id || w.siteId) === activeSiteId);
  }, [warehouses, activeSiteId]);

  // Active Site Object
  const activeSite = useMemo(() => {
    return sites.find(s => s._id === activeSiteId) || null;
  }, [sites, activeSiteId]);

  // Active Warehouse Object
  const activeWarehouse = useMemo(() => {
    if (!activeWarehouseId || activeWarehouseId === 'all') return null;
    return warehouses.find(w => w._id === activeWarehouseId) || null;
  }, [warehouses, activeWarehouseId]);

  const value = useMemo(() => ({
    sites,
    warehouses,
    filteredWarehouses,
    activeSiteId,
    activeWarehouseId,
    activeSite,
    activeWarehouse,
    setActiveSiteId,
    setActiveWarehouseId,
    loading,
    refreshLocations: fetchLocations,
  }), [
    sites,
    warehouses,
    filteredWarehouses,
    activeSiteId,
    activeWarehouseId,
    activeSite,
    activeWarehouse,
    setActiveSiteId,
    setActiveWarehouseId,
    loading,
    fetchLocations,
  ]);

  return (
    <SiteContext.Provider value={value}>
      {children}
    </SiteContext.Provider>
  );
};

export const useSiteContext = () => {
  const context = useContext(SiteContext);
  if (!context) {
    throw new Error('useSiteContext must be used within a SiteProvider');
  }
  return context;
};

export default SiteContext;
