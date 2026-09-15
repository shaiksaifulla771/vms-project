import api from './api';

export const productionService = {
  // Fetch production orders
  getProductionOrders: async (params = {}) => {
    const response = await api.get('/api/productions', { params });
    return response.data;
  },

  // Get single production order by ID
  getProductionOrderById: async (id) => {
    const response = await api.get(`/api/productions/${id}`);
    return response.data;
  },

  // Start production (Status: Scheduled -> In Production)
  startProduction: async (id) => {
    const response = await api.post(`/api/productions/${id}/start`);
    return response.data;
  },

  // Record material consumption
  consumeMaterials: async (id, materialsData) => {
    const response = await api.post(`/api/productions/${id}/issue-materials`, materialsData);
    return response.data;
  },

  // Complete production (Status: In Production -> Completed, triggers physical inventory transactions)
  completeProduction: async (id, completionData = {}) => {
    const response = await api.post(`/api/productions/${id}/complete`, completionData);
    return response.data;
  }
};

export default productionService;
