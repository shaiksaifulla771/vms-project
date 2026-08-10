import api from './api';

export const inventoryService = {
  // Fetch warehouse inventory stock summary (OnHand, Reserved, Available)
  getInventoryBalance: async (params = {}) => {
    const response = await api.get('/api/inventory', { params });
    return response.data;
  },

  // Fetch immutable stock ledger transaction logs
  getInventoryLedger: async (params = {}) => {
    const response = await api.get('/api/inventory/ledger', { params });
    return response.data;
  }
};

export default inventoryService;
