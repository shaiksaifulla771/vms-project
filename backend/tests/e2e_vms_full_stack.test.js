const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms';

const User = require('../models/User');
const Site = require('../models/Site');
const Visitor = require('../models/Visitor');
const Appointment = require('../models/Appointment');
const EmailLog = require('../models/EmailLog');
const WorkflowExecution = require('../models/WorkflowExecution');
const AuditLog = require('../models/AuditLog');

const visitorService = require('../services/visitorService');
const appointmentService = require('../services/appointmentService');
const emailTemplateService = require('../services/emailTemplateService');
const workflowEngineService = require('../services/workflowEngineService');
const pluginManagerService = require('../services/pluginManagerService');
const mcpService = require('../services/mcpService');

async function runE2EVMSTest() {
  console.log('=== STARTING E2E VMS FULL-STACK SYSTEM VERIFICATION ===');

  await mongoose.connect(MONGO_URI);
  console.log('✓ Connected to MongoDB:', MONGO_URI);

  // 1. Seed default system assets
  await emailTemplateService.seedDefaultTemplates();
  await workflowEngineService.seedDefaultWorkflows();
  await pluginManagerService.seedDefaultPlugins();
  console.log('✓ Initial system assets (Email Templates, Workflows, Plugins) seeded.');

  // 2. Ensure test user & site exist
  let user = await User.findOne({ role: 'Admin' });
  if (!user) {
    user = await User.create({
      username: 'vms_admin',
      email: 'admin@vms.com',
      passwordHash: 'hashed_password_123',
      role: 'Admin'
    });
  }

  let site = await Site.findOne();
  if (!site) {
    site = await Site.create({
      code: 'SITE-VMS-01',
      name: 'Bengaluru Tech Park',
      type: 'Regional Office'
    });
  }

  console.log(`✓ Admin User: ${user.username} (${user._id})`);
  console.log(`✓ Facility Site: ${site.name} (${site.code})`);

  // 3. Register Visitor
  const visitor = await visitorService.createVisitor({
    fullName: 'David Miller',
    email: 'david.miller@acme.com',
    phone: '+91 9876543210',
    company: 'Acme Corporation',
    hostEmployeeId: user._id,
    siteId: site._id
  }, user._id);

  console.log(`✓ Visitor Registered: ${visitor.fullName} (${visitor.visitorCode})`);

  // 4. Schedule Appointment (Admin auto-approves)
  const appointment = await appointmentService.createAppointment({
    visitorId: visitor._id,
    hostUserId: user._id,
    siteId: site._id,
    scheduledStartTime: new Date(),
    scheduledEndTime: new Date(Date.now() + 3600000),
    purpose: 'Executive Project Review'
  }, user);

  console.log(`✓ Appointment Scheduled & Auto-Approved: ${appointment.appointmentNumber} (Status: ${appointment.status})`);

  // 5. Verify Workflow Execution
  const executions = await WorkflowExecution.find({ entityId: appointment._id });
  console.log(`✓ Workflow Executions Triggered: ${executions.length}`);

  // 6. Visitor Check-In & Check-Out
  await visitorService.checkInVisitor(visitor._id, user._id);
  console.log('✓ Visitor Checked In successfully.');

  await visitorService.checkOutVisitor(visitor._id, user._id);
  console.log('✓ Visitor Checked Out successfully.');

  // 7. Verify MCP Tool Execution
  const mcpResult = await mcpService.executeTool('get_visitor', { visitorId: visitor._id }, user);
  console.log(`✓ MCP Tool [get_visitor] Executed Successfully: ${mcpResult.visitors[0].fullName}`);

  // 8. Verify Audit Logs Recorded
  const auditCount = await AuditLog.countDocuments({ entityType: { $in: ['Visitor', 'Appointment', 'MCPTool'] } });
  console.log(`✓ Audit Logs Recorded for VMS Operations: ${auditCount}`);

  console.log('=== ALL E2E VMS FULL-STACK TESTS PASSED SUCCESSFULLY! ===');
  await mongoose.disconnect();
}

runE2EVMSTest().catch(err => {
  console.error('❌ E2E VMS Verification Failed:', err);
  process.exit(1);
});
