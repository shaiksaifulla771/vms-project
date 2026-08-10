const visitorService = require('../services/visitorService');
const asyncHandler = require('../middleware/asyncHandler');

exports.createVisitor = asyncHandler(async (req, res) => {
  const visitor = await visitorService.createVisitor(req.body, req.user ? req.user._id : null);
  res.status(201).json({ success: true, data: visitor });
});

exports.getVisitors = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const query = {};
  if (req.query.status) query.status = req.query.status;
  if (req.query.siteId) query.siteId = req.query.siteId;

  const result = await visitorService.getVisitors(query, page, limit);
  res.status(200).json({ success: true, ...result });
});

exports.checkInVisitor = asyncHandler(async (req, res) => {
  const visitor = await visitorService.checkInVisitor(req.params.id, req.user ? req.user._id : null);
  res.status(200).json({ success: true, message: 'Visitor checked in successfully', data: visitor });
});

exports.checkOutVisitor = asyncHandler(async (req, res) => {
  const visitor = await visitorService.checkOutVisitor(req.params.id, req.user ? req.user._id : null);
  res.status(200).json({ success: true, message: 'Visitor checked out successfully', data: visitor });
});
