const express = require('express');
const router = express.Router();
const appointmentController = require('../controllers/appointmentController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect);

router.route('/')
  .post(appointmentController.createAppointment)
  .get(appointmentController.getAppointments);

router.get('/overview/today', appointmentController.getOverview);
router.post('/:id/approve', authorize('Admin', 'Planner', 'Warehouse Operator'), appointmentController.approveAppointment);
router.post('/:id/reject', authorize('Admin', 'Planner', 'Warehouse Operator'), appointmentController.rejectAppointment);
router.post('/:id/reschedule', authorize('Admin', 'Planner', 'Warehouse Operator'), appointmentController.rescheduleAppointment);

module.exports = router;
