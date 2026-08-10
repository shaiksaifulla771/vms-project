const express = require('express');
const router = express.Router();
const visitorController = require('../controllers/visitorController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.route('/')
  .post(visitorController.createVisitor)
  .get(visitorController.getVisitors);

router.post('/:id/check-in', visitorController.checkInVisitor);
router.post('/:id/check-out', visitorController.checkOutVisitor);

module.exports = router;
