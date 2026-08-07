const mongoose = require('mongoose');
const { startSafeTransaction, commitSafeTransaction, abortSafeTransaction } = require('../utils/transaction');
const BOM = require('../models/BOM');
const BOMAuditLog = require('../models/BOMAuditLog');
const Sequence = require('../models/Sequence');
const bomCostService = require('../services/bomCostService');
const { writeAuditLog } = require('../services/auditService');

const bomService = require('../services/bomService');

// @desc    Get all BOMs
// @route   GET /api/bom
exports.getBOMs = async (req, res, next) => {
  try {
    const result = await bomService.getBOMs(req.query);
    res.status(200).json({ success: true, count: result.count, data: result.data });
  } catch (err) {
    next(err);
  }
};

// @desc    Get single BOM
// @route   GET /api/bom/:id
exports.getBOM = async (req, res, next) => {
  try {
    const bom = await bomService.getBOM(req.params.id);
    res.status(200).json({ success: true, data: bom });
  } catch (err) {
    if (err.status === 404) {
      return res.status(404).json({ success: false, error: err.message });
    }
    next(err);
  }
};

const bomRecipeService = require('../services/bomRecipeService');

// @desc    Create new BOM
// @route   POST /api/bom
exports.createBOM = async (req, res, next) => {
  try {
    const userContext = {
      name: req.user ? req.user.name : 'System',
      id: req.user ? req.user.id : null,
      ip: req.ip || req.connection?.remoteAddress || 'Unknown'
    };

    const newBom = await bomRecipeService.createBOM(req.body, userContext);
    res.status(201).json({ success: true, data: newBom });
  } catch (err) {
    next(err);
  }
};

// @desc    Update BOM (Versioning)
// @route   PUT /api/bom/:id
exports.updateBOM = async (req, res, next) => {
  try {
    const userContext = {
      name: req.user ? req.user.name : 'System',
      id: req.user ? req.user.id : null,
      ip: req.ip || req.connection?.remoteAddress || 'Unknown'
    };

    const result = await bomRecipeService.updateBOM(req.params.id, req.body, userContext);
    
    if (result._isPartialUpdate) {
      delete result._isPartialUpdate;
      return res.status(200).json({ success: true, message: 'BOM updated', data: result });
    }
    
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    if (err.status === 404 || err.status === 409) {
      return res.status(err.status).json({ success: false, error: err.message });
    }
    next(err);
  }
};

// @desc    Soft Delete BOM
// @route   DELETE /api/bom/:id
exports.deleteBOM = async (req, res, next) => {
  try {
    const userContext = {
      name: req.user ? req.user.name : 'System',
      id: req.user ? req.user.id : null,
      ip: req.ip || req.connection?.remoteAddress || 'Unknown'
    };
    
    await bomService.deleteBOM(req.params.id, userContext);
    res.status(200).json({ success: true, message: 'BOM deleted successfully' });
  } catch (err) {
    if (err.status === 404 || err.status === 400) {
      return res.status(err.status).json({ success: false, error: err.message });
    }
    next(err);
  }
};

// @desc    Restore Deleted BOM
// @route   PUT /api/bom/:id/restore
exports.restoreBOM = async (req, res, next) => {
  try {
    const userContext = {
      name: req.user ? req.user.name : 'System',
      id: req.user ? req.user.id : null,
      ip: req.ip || req.connection?.remoteAddress || 'Unknown'
    };

    const bom = await bomService.restoreBOM(req.params.id, userContext);
    res.status(200).json({ success: true, message: 'BOM restored successfully', data: bom });
  } catch (err) {
    if (err.status === 404 || err.status === 400) {
      return res.status(err.status).json({ success: false, error: err.message });
    }
    next(err);
  }
};

// @desc    Duplicate BOM
// @route   POST /api/bom/:id/duplicate
exports.duplicateBOM = async (req, res, next) => {
  try {
    const bom = await BOM.findById(req.params.id).lean();
    if (!bom) {
      return res.status(404).json({ success: false, error: 'BOM not found' });
    }

    // Generate new sequence
    let seqDoc = await Sequence.findById('bomOrder');
    if (!seqDoc) {
      seqDoc = await Sequence.create({ _id: 'bomOrder', seq: 1000 });
    } else {
      seqDoc = await Sequence.findByIdAndUpdate('bomOrder', { $inc: { seq: 1 } }, { new: true });
    }
    const bomNumber = `BOM-${seqDoc.seq}`;

    // Map components strictly avoiding _id duplication (handle legacy materialId/quantity if present)
    const duplicatedComponents = bom.components.map(c => ({
      mpnId: c.mpnId || c.materialId,
      qty: c.qty || c.quantity,
      lossPercent: c.lossPercent || 0
    }));

    const newBom = await BOM.create({
      productId: bom.productId,
      bomNumber: bomNumber,
      notes: bom.notes || '',
      manufacturer: bom.manufacturer || '',
      batchCode: bom.batchCode || '',
      batchSize: bom.batchSize || 1,
      batchUOM: bom.batchUOM || 'kg',
      components: duplicatedComponents,
      packagingCost: bom.packagingCost || 0,
      processingCost: bom.processingCost || 0,
      overheadCost: bom.overheadCost || 0,
      version: 1,
      previousVersionId: null, // Independent duplicate
      duplicatedFrom: bom._id,
      effectiveDate: bom.effectiveDate,
      status: 'Draft',
      createdBy: req.user ? req.user.name : 'System',
      updatedBy: req.user ? req.user.name : 'System'
    });

    await BOMAuditLog.create({
      bomId: newBom._id,
      action: 'DUPLICATE',
      performedBy: req.user ? req.user.name : 'System',
      ipAddress: req.ip || req.connection.remoteAddress || 'Unknown',
      details: { duplicatedFrom: bom._id }
    });

    res.status(201).json({ success: true, data: newBom });
  } catch (err) {
    next(err);
  }
};

// @desc    Get BOM History
// @route   GET /api/bom/:id/history
exports.getBOMHistory = async (req, res, next) => {
  try {
    const bomId = req.params.id;
    const bom = await BOM.findById(bomId);
    if (!bom) return res.status(404).json({ success: false, error: 'BOM not found' });

    let history = await BOM.find({ bomNumber: bom.bomNumber })
      .populate('productId', 'name code')
      .populate({
        path: 'components.mpnId',
        populate: [
          { path: 'materialId', select: 'name code unit type' },
          { path: 'vendorId', select: 'name company' }
        ]
      })
      .sort({ version: -1 })
      .lean();

    history = await bomCostService.populateBomCostsBulk(history);

    res.status(200).json({ success: true, data: history });
  } catch (err) {
    next(err);
  }
};
