const appointmentService = require('../services/appointmentService');
const asyncHandler = require('../middleware/asyncHandler');

exports.createAppointment = asyncHandler(async (req, res) => {
  const appointment = await appointmentService.createAppointment(req.body, req.user);
  res.status(201).json({ success: true, data: appointment });
});

exports.getAppointments = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const query = {};
  if (req.query.status) query.status = req.query.status;
  if (req.query.siteId) query.siteId = req.query.siteId;

  const result = await appointmentService.getAppointments(query, page, limit);
  res.status(200).json({ success: true, ...result });
});

exports.approveAppointment = asyncHandler(async (req, res) => {
  const appointment = await appointmentService.approveAppointment(req.params.id, req.user._id, req.body.notes || '');
  res.status(200).json({ success: true, message: 'Appointment approved', data: appointment });
});

exports.rejectAppointment = asyncHandler(async (req, res) => {
  const appointment = await appointmentService.rejectAppointment(req.params.id, req.user._id, req.body.reason || '');
  res.status(200).json({ success: true, message: 'Appointment rejected', data: appointment });
});
