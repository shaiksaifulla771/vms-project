import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, prefs } from './api';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [session, setSession] = useState(null);
  const [locations, setLocations] = useState([]);
  const [settings, setSettings] = useState(null);
  const [locationId, setLocationIdState] = useState(prefs.locationId() || '');
  const [warehouseId, setWarehouseIdState] = useState(prefs.warehouseId() || '');
  const [error, setError] = useState(null);
  const [scopeVersion, setScopeVersion] = useState(0);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [s, l, st] = await Promise.all([
        api.get('/session'), api.get('/locations', { scoped: false }), api.get('/settings'),
      ]);
      setSession(s);
      setLocations(l);
      setSettings(st);
      if (prefs.userId() !== s.user.id) prefs.setUserId(s.user.id);
      // Drop a stored location/WH that no longer exists
      const loc = prefs.locationId();
      if (loc && !l.some((x) => x.id === loc)) { prefs.setLocationId(''); prefs.setWarehouseId(''); setLocationIdState(''); setWarehouseIdState(''); }
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setLocationId = (id) => {
    prefs.setLocationId(id);
    prefs.setWarehouseId('');
    setLocationIdState(id);
    setWarehouseIdState('');
    setScopeVersion((n) => n + 1);
  };
  const setWarehouseId = (id) => {
    prefs.setWarehouseId(id);
    setWarehouseIdState(id);
    setScopeVersion((n) => n + 1);
  };
  const switchUser = async (id) => {
    prefs.setUserId(id);
    await load();
    setScopeVersion((n) => n + 1);
  };

  const notify = useCallback((message, type = 'info') => {
    setToast({ message, type, at: Date.now() });
  }, []);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), toast.type === 'error' ? 6000 : 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const value = useMemo(() => {
    const user = session?.user || null;
    const location = locations.find((l) => l.id === locationId) || null;
    const warehouse = location?.warehouses.find((w) => w.id === warehouseId) || null;
    return {
      user,
      users: session?.users || [],
      company: session?.company || null,
      isAdmin: user?.role === 'admin',
      canWrite: user?.role === 'admin' || user?.role === 'editor',
      locations,
      location,
      warehouse,
      locationId,
      warehouseId,
      setLocationId,
      setWarehouseId,
      scopeVersion,
      settings,
      reload: load,
      switchUser,
      notify,
      toast,
      error,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, locations, locationId, warehouseId, scopeVersion, settings, toast, error]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => useContext(AppContext);

/** Fetch data and re-fetch when the global scope / deps change. */
export function useData(loader, deps = []) {
  const { scopeVersion } = useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await loader());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeVersion, ...deps]);
  useEffect(() => { run(); }, [run]);
  return { data, loading, error, reload: run, setData };
}
