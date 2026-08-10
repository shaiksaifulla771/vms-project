const Workflow = require('../models/Workflow');
const WorkflowExecution = require('../models/WorkflowExecution');
const WorkflowLog = require('../models/WorkflowLog');
const emailService = require('./emailService');
const auditService = require('./auditService');
const logger = require('../utils/logger');

class WorkflowEngineService {
  /**
   * Seed default VMS appointment approval workflow
   */
  async seedDefaultWorkflows() {
    const existing = await Workflow.findOne({ code: 'VMS_VISITOR_APPROVAL' });
    if (!existing) {
      await Workflow.create({
        name: 'Standard Visitor & Appointment Approval Workflow',
        code: 'VMS_VISITOR_APPROVAL',
        description: 'Automated workflow for evaluating appointment creation, requiring manager clearance, and sending confirmation emails.',
        triggerEvent: 'appointment.created',
        status: 'Active',
        steps: [
          {
            stepOrder: 1,
            name: 'Check Auto-Approval Condition',
            type: 'Condition',
            config: { field: 'purpose', operator: 'equals', value: 'VIP' }
          },
          {
            stepOrder: 2,
            name: 'Manager Approval Gate',
            type: 'Approval',
            config: { requiredRole: 'Admin', timeoutHours: 24 }
          },
          {
            stepOrder: 3,
            name: 'Send Confirmation Email',
            type: 'Email',
            config: { templateCode: 'APPOINTMENT_APPROVED' }
          }
        ]
      });
      logger.info('WorkflowEngineService', 'Default VMS_VISITOR_APPROVAL workflow seeded.');
    }
  }

  async createWorkflow(data, userId = null) {
    const workflow = await Workflow.create({ ...data, createdBy: userId });
    if (userId) {
      await auditService.writeAuditLog(null, 'Workflow', workflow._id, 'CREATE', null, data, userId);
    }
    return workflow;
  }

  async updateWorkflow(id, data, userId = null) {
    const workflow = await Workflow.findByIdAndUpdate(id, data, { new: true });
    if (userId && workflow) {
      await auditService.writeAuditLog(null, 'Workflow', workflow._id, 'UPDATE', null, data, userId);
    }
    return workflow;
  }

  async deleteWorkflow(id, userId = null) {
    const workflow = await Workflow.findByIdAndDelete(id);
    if (userId && workflow) {
      await auditService.writeAuditLog(null, 'Workflow', id, 'DELETE', null, { name: workflow.name }, userId);
    }
    return workflow;
  }

  async enableWorkflow(id, userId = null) {
    return this.updateWorkflow(id, { status: 'Active' }, userId);
  }

  async disableWorkflow(id, userId = null) {
    return this.updateWorkflow(id, { status: 'Inactive' }, userId);
  }

  /**
   * Execute workflow pipeline for a given trigger event and entity payload
   */
  async executeWorkflow(triggerEvent, payload, userId = null) {
    logger.info('WorkflowEngineService', `Executing workflows matching trigger [${triggerEvent}]...`);

    const workflows = await Workflow.find({ triggerEvent, status: 'Active' });
    if (!workflows.length) {
      logger.info('WorkflowEngineService', `No active workflows found for event [${triggerEvent}]`);
      return [];
    }

    const executions = [];

    for (const wf of workflows) {
      const entityId = payload.appointmentId || payload.visitorId || payload.id || wf._id;
      const entityType = payload.entityType || (triggerEvent.startsWith('visitor') ? 'Visitor' : 'Appointment');

      const execution = await WorkflowExecution.create({
        workflowId: wf._id,
        triggerEvent,
        entityType,
        entityId,
        status: 'Running',
        currentStepIndex: 0,
        executionHistory: []
      });

      logger.info('WorkflowEngineService', `Created WorkflowExecution [${execution._id}] for workflow [${wf.code}]`);

      // Pipeline execution through steps
      try {
        for (let i = 0; i < wf.steps.length; i++) {
          const step = wf.steps[i];
          execution.currentStepIndex = i;

          const stepResult = await this.executeStep(step, payload, execution);

          execution.executionHistory.push({
            stepOrder: step.stepOrder,
            stepName: step.name,
            status: stepResult.status,
            result: stepResult.result,
            error: stepResult.error || null
          });

          await WorkflowLog.create({
            workflowId: wf._id,
            executionId: execution._id,
            stepName: step.name,
            actionType: step.type,
            status: stepResult.status === 'Success' ? 'Success' : 'Failed',
            details: stepResult
          });

          if (stepResult.status === 'Failed') {
            execution.status = 'Failed';
            execution.error = stepResult.error;
            break;
          }
        }

        if (execution.status === 'Running') {
          execution.status = 'Completed';
          execution.completedAt = new Date();
        }
      } catch (err) {
        execution.status = 'Failed';
        execution.error = err.message;
        logger.error('WorkflowEngineService', `Execution failed for workflow [${wf.code}]`, err);
      }

      await execution.save();
      executions.push(execution);

      if (userId) {
        await auditService.writeAuditLog(null, 'WorkflowExecution', execution._id, 'EXECUTE', null, { status: execution.status }, userId);
      }
    }

    return executions;
  }

  /**
   * Execute individual step logic
   */
  async executeStep(step, payload, execution) {
    logger.info('WorkflowEngineService', `Executing Step [${step.stepOrder}]: ${step.name} (${step.type})`);

    switch (step.type) {
      case 'Condition': {
        const { field, operator, value } = step.config || {};
        const actualVal = payload[field];
        let passed = false;
        if (operator === 'equals') passed = String(actualVal) === String(value);
        else passed = Boolean(actualVal);

        return { status: 'Success', result: { conditionMet: passed, field, actualVal } };
      }
      case 'Email': {
        const templateCode = step.config.templateCode || 'APPOINTMENT_APPROVED';
        const recipient = payload.visitorEmail || payload.email || 'visitor@example.com';
        await emailService.sendTemplateEmail(templateCode, recipient, payload);
        return { status: 'Success', result: { emailSent: true, recipient, templateCode } };
      }
      case 'Approval': {
        // Auto-approve if payload status is already Approved
        const isApproved = payload.status === 'Approved';
        return { status: 'Success', result: { approved: isApproved, autoApproved: isApproved } };
      }
      default:
        return { status: 'Success', result: { executed: true } };
    }
  }

  async pauseWorkflow(executionId) {
    return WorkflowExecution.findByIdAndUpdate(executionId, { status: 'Paused' }, { new: true });
  }

  async resumeWorkflow(executionId) {
    return WorkflowExecution.findByIdAndUpdate(executionId, { status: 'Running' }, { new: true });
  }

  async cancelWorkflow(executionId) {
    return WorkflowExecution.findByIdAndUpdate(executionId, { status: 'Cancelled' }, { new: true });
  }

  async getWorkflowStatus(executionId) {
    return WorkflowExecution.findById(executionId).populate('workflowId');
  }

  async getWorkflowHistory(workflowId) {
    return WorkflowExecution.find({ workflowId }).sort({ createdAt: -1 });
  }
}

module.exports = new WorkflowEngineService();
