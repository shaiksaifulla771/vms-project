const express = require('express');
const {
  getMPNs,
  getDeletedMPNs,
  getMPN,
  createMPN,
  updateMPN,
  deleteMPN,
  restoreMPN,
  peekNextMPNCode,
  getManufacturers,
  batchDeleteMPNs,
  exportMPNsExcel,
  generateMPNPdf,
} = require('../controllers/mpnController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Static routes MUST be mounted before /:id routes
router.route('/sequence-peek').get(protect, peekNextMPNCode);
router.route('/manufacturers').get(protect, getManufacturers);
router.route('/export').get(protect, exportMPNsExcel);
router.route('/deleted').get(protect, getDeletedMPNs);
router.route('/batch-delete').post(protect, batchDeleteMPNs);

// Sub-resource static routes
router.route('/:id/pdf').get(protect, generateMPNPdf);
router.route('/:id/restore').put(protect, restoreMPN);

// Root collection routes
router.route('/')
  .get(protect, getMPNs)
  .post(protect, createMPN);

// Individual resource routes
router.route('/:id')
  .get(protect, getMPN)
  .put(protect, updateMPN)
  .delete(protect, deleteMPN);

module.exports = router;
