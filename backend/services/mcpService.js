const visitorService = require('./visitorService');
const appointmentService = require('./appointmentService');
const workflowEngineService = require('./workflowEngineService');
const emailService = require('./emailService');
const pluginManagerService = require('./pluginManagerService');
const auditService = require('./auditService');
const logger = require('../utils/logger');

class MCPService {
  /**
   * List all safe exposed MCP tools
   */
  getAvailableTools() {
    return [
      {
        name: 'get_visitor',
        description: 'Get details of a specific visitor by ID or visitor code.',
        category: 'Visitor',
        parameters: { visitorId: 'string (required)' }
      },
      {
        name: 'search_visitors',
        description: 'Search registered visitors by status, email, phone, or company.',
        category: 'Visitor',
        parameters: { query: 'object', page: 'number', limit: 'number' }
      },
      {
        name: 'create_visitor',
        description: 'Register a new visitor in the VMS system.',
        category: 'Visitor',
        parameters: { fullName: 'string', email: 'string', phone: 'string', company: 'string', hostEmployeeId: 'string', siteId: 'string' }
      },
      {
        name: 'get_appointment',
        description: 'Get details of a specific appointment.',
        category: 'Appointment',
        parameters: { appointmentId: 'string' }
      },
      {
        name: 'search_appointments',
        description: 'Search appointments by status, site, or scheduled time.',
        category: 'Appointment',
        parameters: { status: 'string', siteId: 'string', page: 'number' }
      },
      {
        name: 'create_appointment',
        description: 'Schedule a new visitor appointment.',
        category: 'Appointment',
        parameters: { visitorId: 'string', hostUserId: 'string', siteId: 'string', scheduledStartTime: 'string', scheduledEndTime: 'string', purpose: 'string' }
      },
      {
        name: 'approve_appointment',
        description: 'Approve a pending visitor appointment.',
        category: 'Appointment',
        parameters: { appointmentId: 'string', notes: 'string' }
      },
      {
        name: 'reject_appointment',
        description: 'Reject a pending visitor appointment.',
        category: 'Appointment',
        parameters: { appointmentId: 'string', reason: 'string' }
      },
      {
        name: 'get_workflow',
        description: 'Get details of a workflow by ID or code.',
        category: 'Workflow',
        parameters: { workflowId: 'string' }
      },
      {
        name: 'execute_workflow',
        description: 'Trigger workflow execution for an event payload.',
        category: 'Workflow',
        parameters: { triggerEvent: 'string', payload: 'object' }
      },
      {
        name: 'send_email',
        description: 'Dispatch a manual email notification.',
        category: 'Email',
        parameters: { recipient: 'string', subject: 'string', htmlBody: 'string' }
      },
      {
        name: 'send_template_email',
        description: 'Dispatch a templated email notification.',
        category: 'Email',
        parameters: { templateCode: 'string', recipient: 'string', data: 'object' }
      },
      {
        name: 'list_plugins',
        description: 'List installed VMS system plugins and status.',
        category: 'Plugin',
        parameters: {}
      }
    ];
  }

  /**
   * Execute an MCP tool safely with user security context
   */
  async executeTool(toolName, params, user) {
    if (!user) {
      throw new Error('MCP Security Violation: Unauthenticated tool call rejected');
    }

    logger.info('MCPService', `Executing tool [${toolName}] by user [${user.username || user.email}] (${user.role})`);

    // Strictly forbid dangerous keywords or raw shell/sql attempts
    const paramStr = JSON.stringify(params || {}).toLowerCase();
    if (paramStr.includes('executerawsql') || paramStr.includes('executeshellcommand') || paramStr.includes('deletedatabase') || paramStr.includes('drop table')) {
      throw new Error('MCP Security Violation: Destructive command rejected by VMS security guard');
    }

    let result = null;

    switch (toolName) {
      case 'get_visitor':
        result = await visitorService.getVisitors({ _id: params.visitorId });
        break;
      case 'search_visitors':
        result = await visitorService.getVisitors(params.query || {}, params.page || 1, params.limit || 50);
        break;
      case 'create_visitor':
        result = await visitorService.createVisitor(params, user._id);
        break;
      case 'get_appointment':
        result = await appointmentService.getAppointments({ _id: params.appointmentId });
        break;
      case 'search_appointments':
        result = await appointmentService.getAppointments(params.status ? { status: params.status } : {}, params.page || 1, params.limit || 50);
        break;
      case 'create_appointment':
        result = await appointmentService.createAppointment(params, user);
        break;
      case 'approve_appointment':
        result = await appointmentService.approveAppointment(params.appointmentId, user._id, params.notes || '');
        break;
      case 'reject_appointment':
        result = await appointmentService.rejectAppointment(params.appointmentId, user._id, params.reason || '');
        break;
      case 'get_workflow':
        result = await workflowEngineService.getWorkflowStatus(params.workflowId);
        break;
      case 'execute_workflow':
        result = await workflowEngineService.executeWorkflow(params.triggerEvent, params.payload || {}, user._id);
        break;
      case 'send_email':
        result = await emailService.sendEmail({ ...params, userId: user._id });
        break;
      case 'send_template_email':
        result = await emailService.sendTemplateEmail(params.templateCode, params.recipient, params.data || {}, user._id);
        break;
      case 'list_plugins':
        result = await pluginManagerService.listPlugins();
        break;
      default:
        throw new Error(`Unknown MCP Tool: [${toolName}]`);
    }

    // Record audit log for MCP execution
    await auditService.writeAuditLog(
      null,
      'MCPTool',
      user._id,
      'EXECUTE',
      null,
      { toolName, params, success: true },
      user._id
    );

    return result;
  }
}

module.exports = new MCPService();
