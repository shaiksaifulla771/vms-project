const Plugin = require('../models/Plugin');
const auditService = require('./auditService');
const logger = require('../utils/logger');

class PluginManagerService {
  /**
   * Seed default built-in VMS plugins
   */
  async seedDefaultPlugins() {
    const defaultPlugins = [
      {
        name: 'VMS Email Integration Plugin',
        code: 'VMS_EMAIL_PLUGIN',
        version: '1.0.0',
        description: 'Provides template rendering, HTML dispatches, and email queue retries.',
        status: 'Active',
        configuration: { provider: 'console', maxRetries: 3 },
        healthStatus: 'Healthy'
      },
      {
        name: 'VMS Workflow Automation Plugin',
        code: 'VMS_WORKFLOW_PLUGIN',
        version: '1.0.0',
        description: 'Provides Trigger-Condition-Action pipeline execution for visitor approvals.',
        status: 'Active',
        configuration: { autoApproveVIP: true },
        healthStatus: 'Healthy'
      },
      {
        name: 'Antigravity MCP Gateway Plugin',
        code: 'VMS_MCP_GATEWAY_PLUGIN',
        version: '1.0.0',
        description: 'Exposes secure VMS tools for Visitor, Appointment, Email, and Workflow management to AI agents.',
        status: 'Active',
        configuration: { enforceRBAC: true, auditLogTools: true },
        healthStatus: 'Healthy'
      },
      {
        name: 'SMS Notification Plugin',
        code: 'VMS_SMS_PLUGIN',
        version: '1.0.0',
        description: 'Optional SMS notification gateway for host arrival alerts.',
        status: 'Inactive',
        configuration: { provider: 'TwilioMock' },
        healthStatus: 'Healthy'
      }
    ];

    for (const p of defaultPlugins) {
      await Plugin.findOneAndUpdate({ code: p.code }, p, { upsert: true, new: true });
    }

    logger.info('PluginManagerService', 'Default VMS plugins seeded successfully.');
  }

  async listPlugins() {
    return Plugin.find().sort({ name: 1 });
  }

  async getPluginByCode(code) {
    return Plugin.findOne({ code });
  }

  async enablePlugin(code, userId = null) {
    const plugin = await Plugin.findOneAndUpdate({ code }, { status: 'Active' }, { new: true });
    if (plugin && userId) {
      await auditService.writeAuditLog(null, 'Plugin', plugin._id, 'ENABLE', null, { status: 'Active' }, userId);
    }
    return plugin;
  }

  async disablePlugin(code, userId = null) {
    const plugin = await Plugin.findOneAndUpdate({ code }, { status: 'Inactive' }, { new: true });
    if (plugin && userId) {
      await auditService.writeAuditLog(null, 'Plugin', plugin._id, 'DISABLE', null, { status: 'Inactive' }, userId);
    }
    return plugin;
  }

  async healthCheck(code) {
    const plugin = await Plugin.findOne({ code });
    if (!plugin) throw new Error('Plugin not found');

    plugin.lastHealthCheck = new Date();
    plugin.healthStatus = plugin.status === 'Active' ? 'Healthy' : 'Degraded';
    await plugin.save();

    return {
      name: plugin.name,
      code: plugin.code,
      status: plugin.status,
      healthStatus: plugin.healthStatus,
      lastHealthCheck: plugin.lastHealthCheck
    };
  }
}

module.exports = new PluginManagerService();
