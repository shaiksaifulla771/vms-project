import api from './api';

export const productionPlanService = {
  // Fetch all production plans with optional status filtering
  getProductionPlans: async (params = {}) => {
    const response = await api.get('/api/production-plans', { params });
    return response.data;
  },

  // Get single production plan by ID
  getProductionPlanById: async (id) => {
    const response = await api.get(`/api/production-plans/${id}`);
    return response.data;
  },

  // Create manual production plan (Status: Pending / Unscheduled)
  createProductionPlan: async (planData) => {
    const response = await api.post('/api/production-plans', planData);
    return response.data;
  },

  // Schedule production plan (Validates BOM/Warehouse/Inventory, soft-reserves stock, creates linked ProductionOrder)
  schedulePlan: async (id, scheduleData) => {
    const payload = typeof scheduleData === 'number' ? { quantity: scheduleData } : scheduleData;
    const response = await api.post(`/api/production-plans/${id}/schedule`, payload);
    return response.data;
  },

  // Unschedule production plan (Releases soft-reservation, cancels linked order, reverts plan to Pending)
  unschedulePlan: async (id) => {
    const response = await api.post(`/api/production-plans/${id}/unschedule`);
    return response.data;
  },

  // Copy / Duplicate production plan
  copyPlan: async (id, overrideData = {}) => {
    const response = await api.post(`/api/production-plans/${id}/copy`, overrideData);
    return response.data;
  }
};

export default productionPlanService;
