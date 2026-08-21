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
        else if (operator === 'not_equals') passed = String(actualVal) !== String(value);
        else if (operator === 'greater_than') passed = Number(actualVal) > Number(value);
        else if (operator === 'less_than') passed = Number(actualVal) < Number(value);
        else passed = Boolean(actualVal);

        return { status: 'Success', result: { conditionMet: passed, field, actualVal, operator, targetValue: value } };
      }

      case 'Email': {
        const templateCode = step.config?.templateCode || 'APPOINTMENT_APPROVED';
        const recipient = payload.visitorEmail || payload.email || payload.hostEmail || 'visitor@example.com';
        try {
          await emailService.sendTemplateEmail(templateCode, recipient, payload);
          return { status: 'Success', result: { emailSent: true, recipient, templateCode } };
        } catch (err) {
          return { status: 'Failed', error: `Email dispatch failed: ${err.message}` };
        }
      }

      case 'Approval': {
        const isApproved = payload.status === 'Approved' || payload.status === 'APPROVED';
        return { status: 'Success', result: { approved: isApproved, autoApproved: isApproved } };
      }

      case 'UpdateEntity': {
        try {
          const { modelName, field, value } = step.config || {};
          if (modelName && field && execution.entityId) {
            const mongoose = require('mongoose');
            const Model = mongoose.model(modelName);
            if (Model) {
              const updated = await Model.findByIdAndUpdate(
                execution.entityId,
                { $set: { [field]: value } },
                { new: true }
              );
              return { status: 'Success', result: { entityUpdated: true, modelName, field, value, entityId: execution.entityId } };
            }
          }
          return { status: 'Success', result: { skipped: true, reason: 'Missing model or entity reference' } };
        } catch (err) {
          return { status: 'Failed', error: `Entity update failed: ${err.message}` };
        }
      }

      case 'Webhook': {
        try {
          const { url, method = 'POST' } = step.config || {};
          if (!url) return { status: 'Success', result: { skipped: true, reason: 'No webhook URL specified' } };

          // Native fetch available in Node.js 18+
          const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event: execution.triggerEvent, payload, executionId: execution._id }),
            signal: AbortSignal.timeout(5000)
          });

          return { status: 'Success', result: { webhookSent: true, url, statusCode: response.status } };
        } catch (err) {
          return { status: 'Failed', error: `Webhook request failed: ${err.message}` };
        }
      }

      default:
        return { status: 'Success', result: { executed: true, stepType: step.type } };
    }
  }

  async pauseWorkflow(executionId, userId = null) {
    const execution = await WorkflowExecution.findByIdAndUpdate(
      executionId,
      { status: 'Paused' },
      { new: true }
    );
    if (userId && execution) {
      await auditService.writeAuditLog(null, 'WorkflowExecution', executionId, 'PAUSE', null, { status: 'Paused' }, userId);
    }
    return execution;
  }

  async resumeWorkflow(executionId, resumePayload = {}, userId = null) {
    const execution = await WorkflowExecution.findById(executionId).populate('workflowId');
    if (!execution) throw new Error('Workflow execution not found');
    if (execution.status !== 'Paused') {
      throw new Error(`Cannot resume workflow in status '${execution.status}'`);
    }

    const wf = execution.workflowId;
    if (!wf || !wf.steps) throw new Error('Associated workflow definition not found');

    execution.status = 'Running';
    const startIndex = execution.currentStepIndex + 1;

    try {
      for (let i = startIndex; i < wf.steps.length; i++) {
        const step = wf.steps[i];
        execution.currentStepIndex = i;

        const stepResult = await this.executeStep(step, resumePayload, execution);

        execution.executionHistory.push({
          stepOrder: step.stepOrder,
          stepName: step.name,
          status: stepResult.status,
          result: stepResult.result,
          error: stepResult.error || null,
        });

        await WorkflowLog.create({
          workflowId: wf._id,
          executionId: execution._id,
          stepName: step.name,
          actionType: step.type,
          status: stepResult.status === 'Success' ? 'Success' : 'Failed',
          details: stepResult,
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
      logger.error('WorkflowEngineService', `Resume failed for workflow [${wf.code}]`, err);
    }

    await execution.save();

    if (userId) {
      await auditService.writeAuditLog(null, 'WorkflowExecution', execution._id, 'RESUME', null, { status: execution.status }, userId);
    }

    return execution;
  }

  async cancelWorkflow(executionId, userId = null) {
    const execution = await WorkflowExecution.findByIdAndUpdate(
      executionId,
      { status: 'Cancelled', completedAt: new Date() },
      { new: true }
    );
    if (userId && execution) {
      await auditService.writeAuditLog(null, 'WorkflowExecution', executionId, 'CANCEL', null, { status: 'Cancelled' }, userId);
    }
    return execution;
  }

  async getWorkflowStatus(executionId) {
    return WorkflowExecution.findById(executionId).populate('workflowId');
  }

  async getWorkflowHistory(workflowId) {
    return WorkflowExecution.find({ workflowId }).sort({ createdAt: -1 });
  }
}

module.exports = new WorkflowEngineService();
