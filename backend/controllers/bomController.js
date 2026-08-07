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

// @desc    Create new BOM
// @route   POST /api/bom
exports.createBOM = async (req, res, next) => {
  const session = await mongoose.startSession();
  startSafeTransaction(session);
  try {
    const { productId, batchSize, batchUOM, components, previousVersionId, effectiveDate, packagingCost, processingCost, overheadCost, manufacturer, updateMasterManufacturer, batchCode } = req.body;


    const eDate = effectiveDate ? new Date(effectiveDate) : new Date();
    const { componentsWithCost } = await bomCostService.calculateBomCost(components, eDate);

    const cleanComponents = componentsWithCost.map(c => ({
      mpnId: c.mpnId,
      qty: c.qty,
      lossPercent: c.lossPercent
    }));

    let seqDoc = await Sequence.findById('bomOrder').session(session);
    if (!seqDoc) {
      seqDoc = await Sequence.create([{ _id: 'bomOrder', seq: 1000 }], { session });
      seqDoc = seqDoc[0];
    } else {
      seqDoc = await Sequence.findByIdAndUpdate('bomOrder', { $inc: { seq: 1 } }, { new: true, session });
    }
    const bomNumber = `BOM-${seqDoc.seq}`;

    const newBom = new BOM({
      productId,
      bomNumber,
      notes: req.body.notes || '',
      manufacturer: manufacturer || '',
      batchSize: Number(batchSize),
      batchUOM: String(batchUOM || 'pcs').trim(),
      batchCode: batchCode || '',
      components: cleanComponents,
      packagingCost: Number(packagingCost) || 0,
      processingCost: Number(processingCost) || 0,
      overheadCost: Number(overheadCost) || 0,
      version: 1,
      previousVersionId: previousVersionId || null,
      effectiveDate: eDate,
      status: 'Active',
      createdBy: req.user ? req.user.name : 'System',
      updatedBy: req.user ? req.user.name : 'System'
    });
    
    await newBom.save({ session });

    if (updateMasterManufacturer && manufacturer) {
      await mongoose.model('MPN').findOneAndUpdate(
        { materialId: productId },
        { manufacturerName: manufacturer },
        { session, sort: { createdAt: -1 } }
      );
    }

    await BOMAuditLog.create([{
      bomId: newBom._id,
      action: 'CREATE',
      performedBy: req.user ? req.user.name : 'System',
      ipAddress: req.ip || req.connection?.remoteAddress || 'Unknown',
      details: { version: 1, batchSize, batchUOM }
    }], { session });

    await writeAuditLog(session, 'BOM', newBom._id, 'CREATE', null, newBom, req.user ? req.user.id : null);

    await commitSafeTransaction(session);
    res.status(201).json({ success: true, data: newBom });
  } catch (err) {
    await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
  }
};

// @desc    Update BOM (Versioning)
// @route   PUT /api/bom/:id
exports.updateBOM = async (req, res, next) => {
  const session = await mongoose.startSession();
  startSafeTransaction(session);
  try {
    const { productId, batchSize, batchUOM, components, version, effectiveDate, status, packagingCost, processingCost, overheadCost, manufacturer, updateMasterManufacturer, batchCode } = req.body;


    const bom = await BOM.findById(req.params.id).session(session);
    if (!bom || bom.status === 'Obsolete') {
      await abortSafeTransaction(session);
      return res.status(404).json({ success: false, error: 'BOM not found or obsolete' });
    }

    // Handle partial updates without creating a new version
    if ((status || batchCode !== undefined) && !components && !productId) {
      const updateFields = { updatedBy: req.user ? req.user.name : 'System' };
      if (status) updateFields.status = status;
      if (batchCode !== undefined) updateFields.batchCode = batchCode;

      await BOM.updateOne(
        { _id: bom._id }, 
        { $set: updateFields },
        { session }
      );
      
      await BOMAuditLog.create([{
        bomId: bom._id,
        action: 'UPDATE',
        performedBy: req.user ? req.user.name : 'System',
        ipAddress: req.ip || req.connection?.remoteAddress || 'Unknown',
        details: updateFields
      }], { session });

      await commitSafeTransaction(session);
      return res.status(200).json({ success: true, message: 'BOM updated', data: { ...bom.toObject(), ...updateFields } });
    }

    if (version !== undefined && Number(version) !== bom.version) {
      await abortSafeTransaction(session);
      return res.status(409).json({ 
        success: false, 
        error: `Version conflict: The BOM was modified by someone else (Server version: ${bom.version}, Your version: ${version}). Please reload and try again.` 
      });
    }

    const eDate = effectiveDate ? new Date(effectiveDate) : bom.effectiveDate;
    const { componentsWithCost } = await bomCostService.calculateBomCost(components, eDate);
    const cleanComponents = componentsWithCost.map(c => ({
      mpnId: c.mpnId,
      qty: c.qty,
      lossPercent: c.lossPercent
    }));

    const oldDoc = bom.toObject();

    // Mark old version as Deleted (previously Obsolete)
    bom.status = 'Deleted';
    bom.updatedBy = req.user ? req.user.name : 'System';
    await bom.save({ session });

    const newBomData = new BOM({
      productId,
      bomNumber: bom.bomNumber,
      notes: req.body.notes !== undefined ? req.body.notes : bom.notes,
      manufacturer: manufacturer !== undefined ? manufacturer : bom.manufacturer,
      batchSize: Number(batchSize),
      batchUOM: String(batchUOM || 'pcs').trim(),
      batchCode: batchCode !== undefined ? batchCode : bom.batchCode,
      components: cleanComponents,
      packagingCost: Number(packagingCost) || 0,
      processingCost: Number(processingCost) || 0,
      overheadCost: Number(overheadCost) || 0,
      version: bom.version + 1,
      previousVersionId: bom._id,
      effectiveDate: eDate,
      status: status || 'Active',
      createdBy: req.user ? req.user.name : 'System',
      updatedBy: req.user ? req.user.name : 'System'
    });

    await newBomData.save({ session });

    if (updateMasterManufacturer && manufacturer) {
      await mongoose.model('MPN').findOneAndUpdate(
        { materialId: productId },
        { manufacturerName: manufacturer },
        { session, sort: { createdAt: -1 } }
      );
    }

    await BOMAuditLog.create([{
      bomId: newBomData._id,
      action: 'VERSION_BUMP',
      performedBy: req.user ? req.user.name : 'System',
      ipAddress: req.ip || req.connection?.remoteAddress || 'Unknown',
      details: { oldVersionId: bom._id, newVersion: newBomData.version }
    }], { session });

    await writeAuditLog(session, 'BOM', newBomData._id, 'UPDATE', oldDoc, newBomData, req.user ? req.user.id : null);

    await commitSafeTransaction(session);
    res.status(200).json({ success: true, data: newBomData });
  } catch (err) {
    await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
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
