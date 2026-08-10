const emailService = require('../services/emailService');
const EmailTemplate = require('../models/EmailTemplate');
const EmailQueue = require('../models/EmailQueue');
const asyncHandler = require('../middleware/asyncHandler');

exports.sendEmail = asyncHandler(async (req, res) => {
  const result = await emailService.sendEmail({ ...req.body, userId: req.user._id });
  res.status(200).json({ success: true, message: 'Email dispatched successfully', data: result });
});

exports.sendTemplateEmail = asyncHandler(async (req, res) => {
  const { templateCode, recipient, data } = req.body;
  const result = await emailService.sendTemplateEmail(templateCode, recipient, data || {}, req.user._id);
  res.status(200).json({ success: true, message: 'Templated email dispatched', data: result });
});

exports.getTemplates = asyncHandler(async (req, res) => {
  const templates = await EmailTemplate.find().sort({ templateCode: 1 });
  res.status(200).json({ success: true, count: templates.length, data: templates });
});

exports.getQueue = asyncHandler(async (req, res) => {
  const queue = await EmailQueue.find().sort({ createdAt: -1 }).limit(100);
  res.status(200).json({ success: true, count: queue.length, data: queue });
});

exports.getLogs = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const result = await emailService.getEmailLogs({}, limit, page);
  res.status(200).json({ success: true, ...result });
});

exports.retryQueueItem = asyncHandler(async (req, res) => {
  await emailService.retryEmail(req.params.id);
  res.status(200).json({ success: true, message: 'Email retry triggered' });
});
