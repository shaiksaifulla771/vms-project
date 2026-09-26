import { useEffect, useState } from 'react';

/**
 * useState that survives leaving the page and coming Back (sessionStorage, per browser tab).
 * Used for list filters, search, sort and page, so "Back" returns to the list as you left it.
 */
export function usePersistedState(key, initial) {
  const storageKey = `erp.view.${key}`;
  const [value, setValue] = useState(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      return saved !== null ? JSON.parse(saved) : initial;
    } catch { return initial; }
  });
  useEffect(() => {
    try { sessionStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* storage full or blocked: keep in memory */ }
  }, [storageKey, value]);
  return [value, setValue];
}
