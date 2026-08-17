import api from './api';

export const productionPlanService = {
  // Fetch all production plans with optional status, priority, product filtering
  getProductionPlans: async (params = {}) => {
    const response = await api.get('/production-plans', { params });
    return response.data;
  },

  // Get single production plan by ID
  getProductionPlanById: async (id) => {
    const response = await api.get(`/production-plans/${id}`);
    return response.data;
  },

  // Create manual production plan (Status: UNSCHEDULED)
  createManualPlan: async (planData) => {
    const response = await api.post('/production-plans/manual', planData);
    return response.data;
  },

  createProductionPlan: async (planData) => {
    const response = await api.post('/production-plans/manual', planData);
    return response.data;
  },

  // Schedule production plan (Validates line capacity & warehouse materials -> SCHEDULED)
  schedulePlan: async (id, scheduleData) => {
    const payload = typeof scheduleData === 'number' ? { quantity: scheduleData } : scheduleData;
    const response = await api.post(`/production-plans/${id}/schedule`, payload);
    return response.data;
  },

  // Reschedule an existing SCHEDULED plan
  reschedulePlan: async (id, rescheduleData) => {
    const response = await api.put(`/production-plans/${id}/reschedule`, rescheduleData);
    return response.data;
  },

  // Dynamic live material check
  checkMaterialAvailability: async (id, warehouseId, siteId, strictWarehouse = false) => {
    const response = await api.post(`/production-plans/${id}/material-check`, { warehouseId, siteId, strictWarehouse });
    return response.data;
  },

  // Approve plan
  approvePlan: async (id) => {
    const response = await api.post(`/production-plans/${id}/approve`);
    return response.data;
  },

  // Release plan -> creates ProductionOrder in DRAFT, sets plan to RELEASED
  releasePlan: async (id, quantity) => {
    const payload = quantity ? { quantity } : {};
    const response = await api.post(`/production-plans/${id}/release`, payload);
    return response.data;
  },

  // Use / release a specified number of available plans into a Production Order
  usePlans: async (id, quantity) => {
    const payload = typeof quantity === 'number' ? { quantity } : quantity;
    const response = await api.post(`/production-plans/${id}/use`, payload);
    return response.data;
  },

  // Restore released plans when a linked Production Order is cancelled
  restorePlans: async (id, restoreData) => {
    const response = await api.post(`/production-plans/${id}/restore`, restoreData);
    return response.data;
  },

  // Put plan on hold
  holdPlan: async (id, reason) => {
    const response = await api.post(`/production-plans/${id}/hold`, { reason });
    return response.data;
  },

  // Cancel plan
  cancelPlan: async (id, reason) => {
    const response = await api.post(`/production-plans/${id}/cancel`, { reason });
    return response.data;
  },

  // Mark plan as completed
  completePlan: async (id) => {
    const response = await api.post(`/production-plans/${id}/complete`);
    return response.data;
  },

  // Copy / Duplicate production plan
  copyPlan: async (id, overrideData = {}) => {
    const response = await api.post(`/production-plans/${id}/copy`, overrideData);
    return response.data;
  },

  // Unschedule plan
  unschedulePlan: async (id) => {
    const response = await api.post(`/production-plans/${id}/unschedule`);
    return response.data;
  }
};

export default productionPlanService;

