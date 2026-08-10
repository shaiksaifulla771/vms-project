import api from './api';
import productionPlanService from './productionPlanService';

export const schedulingService = {
  // Fetch combined scheduling status metrics derived from backend state
  getSchedulingMetrics: async () => {
    const [plansRes, ordersRes] = await Promise.all([
      api.get('/api/production-plans'),
      api.get('/api/productions')
    ]);

    const plans = plansRes.data.data || [];
    const orders = ordersRes.data.data || [];

    const pendingCount = plans.filter(p => ['Unscheduled', 'Pending', 'Draft'].includes(p.status)).length;
    const scheduledCount = plans.filter(p => p.status === 'Scheduled').length;
    const inProductionCount = orders.filter(o => ['In Production', 'In Progress'].includes(o.status)).length;
    const completedCount = orders.filter(o => o.status === 'Completed').length;

    return {
      pending: pendingCount,
      scheduled: scheduledCount,
      inProduction: inProductionCount,
      completed: completedCount,
      plans,
      orders
    };
  },

  // Alias for schedule plan
  schedulePlan: productionPlanService.schedulePlan,

  // Alias for unschedule plan
  unschedulePlan: productionPlanService.unschedulePlan
};

export default schedulingService;
