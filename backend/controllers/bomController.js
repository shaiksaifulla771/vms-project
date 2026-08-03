const mongoose = require('mongoose');
const BOM = require('../models/BOM');
const BOMAuditLog = require('../models/BOMAuditLog');
const Sequence = require('../models/Sequence');
const bomCostService = require('../services/bomCostService');
const { writeAuditLog } = require('../services/auditService');

// @desc    Get all BOMs
// @route   GET /api/bom
exports.getBOMs = async (req, res, next) => {
  try {
    const { search, status, mainOnly, duplicatedFrom, clonesOnly } = req.query;
    const filter = {};

    if (status && status !== 'All') {
      filter.status = status;
    } else {
      filter.status = { $ne: 'Obsolete' }; // default to active/draft
    }

    if (mainOnly === 'true') {
      filter.duplicatedFrom = null; // Only primary BOMs
    }

    if (clonesOnly === 'true') {
      filter.duplicatedFrom = { $ne: null }; // Only cloned BOMs globally
    }

    if (duplicatedFrom && duplicatedFrom !== 'all') {
      filter.duplicatedFrom = duplicatedFrom; // Only clones of a specific BOM
    }

    let boms = await BOM.find(filter)
      .populate('productId', 'name code unit')
      .populate('components.mpnId')
      .populate({
        path: 'duplicatedFrom',
        select: 'version productId',
        populate: { path: 'productId', select: 'name' }
      })
      .sort({ createdAt: -1 })
      .lean();

    if (search && search.trim()) {
      const term = search.trim().toLowerCase();
      boms = boms.filter((b) => {
        const prodName = b.productId?.name || '';
        const prodCode = b.productId?.code || '';
        return prodName.toLowerCase().includes(term) || prodCode.toLowerCase().includes(term);
      });
    }

    // Populate costs dynamically via bulk lookup
    boms = await bomCostService.populateBomCostsBulk(boms);

    // Populate clone counts
    const cloneCounts = await BOM.aggregate([
      { $match: { duplicatedFrom: { $in: boms.map(b => b._id) } } },
      { $group: { _id: '$duplicatedFrom', count: { $sum: 1 } } }
    ]);
    const cloneCountMap = {};
    cloneCounts.forEach(c => cloneCountMap[c._id.toString()] = c.count);
    boms = boms.map(b => ({ ...b, cloneCount: cloneCountMap[b._id.toString()] || 0 }));

    res.status(200).json({ success: true, count: boms.length, data: boms });
  } catch (err) {
    next(err);
  }
};

// @desc    Get single BOM
// @route   GET /api/bom/:id
exports.getBOM = async (req, res, next) => {
  try {
    let bom = await BOM.findById(req.params.id)
      .populate('productId', 'name code unit')
      .populate({
        path: 'duplicatedFrom',
        select: 'version productId',
        populate: { path: 'productId', select: 'name' }
      })
      .populate({
        path: 'components.mpnId',
        populate: [
          { path: 'materialId', select: 'name code unit type' },
          { path: 'vendorId', select: 'name company gstin' }
        ]
      })
      .lean();

    if (!bom) {
      return res.status(404).json({ success: false, error: 'BOM not found' });
    }

    // Populate costs dynamically via bulk lookup
    const populatedBoms = await bomCostService.populateBomCostsBulk([bom]);
    bom = populatedBoms[0];

    const cloneCount = await BOM.countDocuments({ duplicatedFrom: bom._id });
    bom.cloneCount = cloneCount;

    res.status(200).json({ success: true, data: bom });
  } catch (err) {
    next(err);
  }
};

// @desc    Create new BOM
// @route   POST /api/bom
exports.createBOM = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { productId, batchSize, batchUOM, components, previousVersionId, effectiveDate, packagingCost, processingCost, overheadCost } = req.body;

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
      batchSize,
      batchUOM,
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

    await BOMAuditLog.create([{
      bomId: newBom._id,
      action: 'CREATE',
      performedBy: req.user ? req.user.name : 'System',
      ipAddress: req.ip || req.connection?.remoteAddress || 'Unknown',
      details: { version: 1, batchSize, batchUOM }
    }], { session });

    await writeAuditLog(session, 'BOM', newBom._id, 'CREATE', null, newBom, req.user ? req.user.id : null);

    await session.commitTransaction();
    res.status(201).json({ success: true, data: newBom });
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
};

// @desc    Update BOM (Versioning)
// @route   PUT /api/bom/:id
exports.updateBOM = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { productId, batchSize, batchUOM, components, version, effectiveDate, status, packagingCost, processingCost, overheadCost } = req.body;

    const bom = await BOM.findById(req.params.id).session(session);
    if (!bom || bom.status === 'Obsolete') {
      await session.abortTransaction();
      return res.status(404).json({ success: false, error: 'BOM not found or obsolete' });
    }

    if (version !== undefined && Number(version) !== bom.version) {
      await session.abortTransaction();
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

    bom.status = 'Obsolete';
    bom.updatedBy = req.user ? req.user.name : 'System';
    await bom.save({ session });

    const newBomData = new BOM({
      productId,
      bomNumber: bom.bomNumber,
      batchSize,
      batchUOM,
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

    await BOMAuditLog.create([{
      bomId: newBomData._id,
      action: 'VERSION_BUMP',
      performedBy: req.user ? req.user.name : 'System',
      ipAddress: req.ip || req.connection?.remoteAddress || 'Unknown',
      details: { oldVersionId: bom._id, newVersion: newBomData.version }
    }], { session });

    await writeAuditLog(session, 'BOM', newBomData._id, 'UPDATE', oldDoc, newBomData, req.user ? req.user.id : null);

    await session.commitTransaction();
    res.status(200).json({ success: true, data: newBomData });
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
};

// @desc    Soft Delete BOM
// @route   DELETE /api/bom/:id
exports.deleteBOM = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const bom = await BOM.findById(req.params.id).session(session);
    if (!bom) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, error: 'BOM not found' });
    }

    const oldDoc = bom.toObject();
    bom.status = 'Obsolete';
    bom.updatedBy = req.user ? req.user.name : 'System';
    await bom.save({ session });

    await BOMAuditLog.create([{
      bomId: bom._id,
      action: 'DELETE',
      performedBy: req.user ? req.user.name : 'System',
      ipAddress: req.ip || req.connection?.remoteAddress || 'Unknown'
    }], { session });

    await writeAuditLog(session, 'BOM', bom._id, 'DELETE', oldDoc, bom, req.user ? req.user.id : null);

    await session.commitTransaction();
    res.status(200).json({ success: true, message: 'BOM deleted successfully' });
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
};

// @desc    Duplicate BOM
// @route   POST /api/bom/:id/duplicate
exports.duplicateBOM = async (req, res, next) => {
  try {
    const bom = await BOM.findById(req.params.id);
    if (!bom) {
      return res.status(404).json({ success: false, error: 'BOM not found' });
    }

    // Smart Restriction & React Loop Prevention
    const existingClones = await BOM.find({ duplicatedFrom: bom._id });
    const hasIdenticalClone = existingClones.some(clone => {
      if (clone.batchSize !== bom.batchSize || clone.batchUOM !== bom.batchUOM) return false;
      if (clone.packagingCost !== bom.packagingCost) return false;
      if (clone.processingCost !== bom.processingCost) return false;
      if (clone.overheadCost !== bom.overheadCost) return false;
      if (clone.components.length !== bom.components.length) return false;
      
      const sortedOriginal = [...bom.components].sort((a,b) => a.mpnId.toString().localeCompare(b.mpnId.toString()));
      const sortedClone = [...clone.components].sort((a,b) => a.mpnId.toString().localeCompare(b.mpnId.toString()));
      
      return sortedOriginal.every((origComp, index) => {
        const cloneComp = sortedClone[index];
        return origComp.mpnId.toString() === cloneComp.mpnId.toString() &&
               origComp.qty === cloneComp.qty &&
               origComp.lossPercent === cloneComp.lossPercent;
      });
    });

    if (hasIdenticalClone) {
      return res.status(400).json({ 
        success: false, 
        error: 'Duplicate Blocked: An identical clone of this BOM already exists. Please modify the recipe properties before saving again.' 
      });
    }

    // Generate new sequence
    let seqDoc = await Sequence.findById('bomOrder');
    if (!seqDoc) {
      seqDoc = await Sequence.create({ _id: 'bomOrder', seq: 1000 });
    } else {
      seqDoc = await Sequence.findByIdAndUpdate('bomOrder', { $inc: { seq: 1 } }, { new: true });
    }
    const bomNumber = `BOM-${seqDoc.seq}`;

    // Map components strictly avoiding _id duplication
    const duplicatedComponents = bom.components.map(c => ({
      mpnId: c.mpnId,
      qty: c.qty,
      lossPercent: c.lossPercent
    }));

    const newBom = await BOM.create({
      productId: bom.productId,
      bomNumber: bomNumber,
      notes: bom.notes || '',
      batchSize: bom.batchSize,
      batchUOM: bom.batchUOM,
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

    let rootId = bomId;
    let current = bom;
    while (current.previousVersionId) {
      rootId = current.previousVersionId;
      current = await BOM.findById(rootId);
      if (!current) break;
    }

    let history = await BOM.find({
      $or: [
        { _id: bomId },
        { previousVersionId: bomId },
        { _id: bom.previousVersionId },
        { _id: rootId },
        { previousVersionId: rootId }
      ]
    }).populate('productId', 'name code').sort({ createdAt: -1 }).lean();

    history = await bomCostService.populateBomCostsBulk(history);

    res.status(200).json({ success: true, data: history });
  } catch (err) {
    next(err);
  }
};
