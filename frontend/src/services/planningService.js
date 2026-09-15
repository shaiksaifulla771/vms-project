import api from './api';

export const planningService = {
  // Execute MRP Run (Calculate Demand & Shortages)
  calculateMRP: async (mrpData) => {
    const response = await api.post('/api/mrp/run', mrpData);
    return response.data;
  },

  // Fetch recent MRP calculation runs
  getMRPRuns: async () => {
    const response = await api.get('/api/mrp/runs');
    return response.data;
  },

  // Fetch detailed MRP run by ID
  getMRPRunById: async (id) => {
    const response = await api.get(`/api/mrp/runs/${id}`);
    return response.data;
  },

  // Convert an MRP requirement into a Production Plan or Purchase Request
  convertRequirement: async (requirementId, actionType) => {
    const response = await api.post(`/api/mrp/requirements/${requirementId}/convert`, {
      targetAction: actionType
    });
    return response.data;
  }
};

export default planningService;
