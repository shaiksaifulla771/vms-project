import api from './api';

export const warehouseService = {
  // Fetch site warehouses
  getWarehouses: async (params = {}) => {
    const response = await api.get('/api/warehouses', { params });
    return response.data;
  },

  // Get single warehouse by ID
  getWarehouseById: async (id) => {
    const response = await api.get(`/api/warehouses/${id}`);
    return response.data;
  }
};

export default warehouseService;
