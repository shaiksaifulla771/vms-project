import api from './api';

export const inventoryService = {
  // Fetch real-time stock balances & live summary KPIs
  getInventoryBalance: async (params = {}) => {
    const response = await api.get('/api/inventory', { params });
    return response.data;
  },

  // Fetch immutable stock ledger transaction audit logs
  getInventoryTransactions: async (params = {}) => {
    const response = await api.get('/api/inventory/transactions', { params });
    return response.data;
  },

  // Alias for backward compatibility
  getInventoryLedger: async (params = {}) => {
    const response = await api.get('/api/inventory/ledger', { params });
    return response.data;
  },

  // Fetch pending / historical stock adjustment requests
  getAdjustments: async (params = {}) => {
    const response = await api.get('/api/inventory/adjustments', { params });
    return response.data;
  },

  // Create new stock adjustment request (Pending approval or auto-approved for Admin)
  createAdjustment: async (data) => {
    const response = await api.post('/api/inventory/adjustments', data);
    return response.data;
  },

  // Approve a pending stock adjustment (Inventory Manager or Admin)
  approveAdjustment: async (id) => {
    const response = await api.post(`/api/inventory/adjustments/${id}/approve`);
    return response.data;
  },

  // Reject a pending stock adjustment
  rejectAdjustment: async (id, reason = 'Rejected by reviewer') => {
    const response = await api.post(`/api/inventory/adjustments/${id}/reject`, { reason });
    return response.data;
  },

  // Fetch active / historical inter-warehouse stock transfers
  getTransfers: async (params = {}) => {
    const response = await api.get('/api/transfers', { params });
    return response.data;
  },

  // Create new inter-warehouse stock transfer request
  createTransfer: async (data) => {
    const response = await api.post('/api/transfers', data);
    return response.data;
  }
};

export default inventoryService;
