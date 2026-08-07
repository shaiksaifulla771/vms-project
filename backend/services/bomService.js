const mongoose = require('mongoose');
const { startSafeTransaction, commitSafeTransaction, abortSafeTransaction } = require('../utils/transaction');
const BOM = require('../models/BOM');
const BOMAuditLog = require('../models/BOMAuditLog');
const bomCostService = require('./bomCostService');
const { writeAuditLog } = require('./auditService');

exports.getBOMs = async (query) => {
  const { search, status, mainOnly, duplicatedFrom, clonesOnly } = query;
  const filter = {};

  if (status && status !== 'All') {
    if (status === 'Deleted') {
      filter.status = { $in: ['Deleted', 'Obsolete'] };
    } else {
      filter.status = status;
    }
  } else {
    filter.status = { $nin: ['Obsolete', 'Deleted'] }; // default to active/draft/inactive
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
    .populate('productId', 'name code unit manufacturer')
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

  // Fetch MPN manufacturers for fallback display
  const productIds = [...new Set(boms.map(b => b.productId?._id?.toString()).filter(Boolean))];
  let mpnMap = {};
  if (productIds.length > 0) {
    const MPN = mongoose.model('MPN');
    const mpns = await MPN.find({ materialId: { $in: productIds } }).select('materialId manufacturerName').lean();
    mpns.forEach(m => {
      // Just take the first MPN's manufacturer if multiple exist
      if (!mpnMap[m.materialId.toString()]) {
        mpnMap[m.materialId.toString()] = m.manufacturerName;
      }
    });
  }

  boms = boms.map(b => ({ 
    ...b, 
    cloneCount: cloneCountMap[b._id.toString()] || 0,
    mpnManufacturer: b.productId ? mpnMap[b.productId._id?.toString()] : null
  }));

  return { count: boms.length, data: boms };
};

exports.getBOM = async (id) => {
  let bom = await BOM.findById(id)
    .populate('productId', 'name code unit manufacturer')
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
    const err = new Error('BOM not found');
    err.status = 404;
    throw err;
  }

  // Populate costs dynamically via bulk lookup
  const populatedBoms = await bomCostService.populateBomCostsBulk([bom]);
  bom = populatedBoms[0];

  const cloneCount = await BOM.countDocuments({ duplicatedFrom: bom._id });
  bom.cloneCount = cloneCount;

  return bom;
};

exports.deleteBOM = async (id, userContext) => {
  const session = await mongoose.startSession();
  startSafeTransaction(session);
  try {
    const bom = await BOM.findById(id).session(session);
    if (!bom) {
      await abortSafeTransaction(session);
      const err = new Error('BOM not found');
      err.status = 404;
      throw err;
    }

    if (bom.status === 'Deleted') {
      await abortSafeTransaction(session);
      const err = new Error('BOM is already deleted');
      err.status = 400;
      throw err;
    }

    const oldDoc = bom.toObject();
    
    // Convert to soft delete
    bom.previousStatus = bom.status;
    bom.status = 'Deleted';
    bom.deletedAt = new Date();
    bom.updatedBy = userContext.name;
    await bom.save({ session });

    await BOMAuditLog.create([{
      bomId: bom._id,
      action: 'DELETE',
      performedBy: userContext.name,
      ipAddress: userContext.ip,
      details: { previousStatus: bom.previousStatus }
    }], { session });

    await writeAuditLog(session, 'BOM', bom._id, 'DELETE', oldDoc, bom, userContext.id);

    await commitSafeTransaction(session);
    return;
  } catch (err) {
    await abortSafeTransaction(session);
    throw err;
  } finally {
    session.endSession();
  }
};

exports.restoreBOM = async (id, userContext) => {
  const session = await mongoose.startSession();
  startSafeTransaction(session);
  try {
    const bom = await BOM.findById(id).session(session);
    if (!bom) {
      await abortSafeTransaction(session);
      const err = new Error('BOM not found');
      err.status = 404;
      throw err;
    }

    if (bom.status !== 'Deleted' && bom.status !== 'Obsolete') {
      await abortSafeTransaction(session);
      const err = new Error('BOM is not deleted or obsolete');
      err.status = 400;
      throw err;
    }

    const oldDoc = bom.toObject();
    
    bom.status = 'Active';
    bom.previousStatus = null;
    bom.deletedAt = null;
    bom.updatedBy = userContext.name;
    await bom.save({ session });

    await BOMAuditLog.create([{
      bomId: bom._id,
      action: 'UPDATE',
      performedBy: userContext.name,
      ipAddress: userContext.ip,
      details: { action: 'RESTORE', newStatus: bom.status }
    }], { session });

    await writeAuditLog(session, 'BOM', bom._id, 'UPDATE', oldDoc, bom, userContext.id);

    await commitSafeTransaction(session);
    return bom;
  } catch (err) {
    await abortSafeTransaction(session);
    throw err;
  } finally {
    session.endSession();
  }
};
