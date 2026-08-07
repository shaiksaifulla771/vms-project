const mongoose = require('mongoose');
const { startSafeTransaction, commitSafeTransaction, abortSafeTransaction } = require('../utils/transaction');
const BOM = require('../models/BOM');
const BOMAuditLog = require('../models/BOMAuditLog');
const Sequence = require('../models/Sequence');
const bomCostService = require('./bomCostService');
const { writeAuditLog } = require('./auditService');
const { detectCycle } = require('../utils/bomGraph');

const validateBOMComponents = async (productId, components, currentBomId = null) => {
  // 1. Verify product exists and is of valid type
  const product = await mongoose.model('Material').findById(productId);
  if (!product || product.status === 'Deleted') {
    const err = new Error('Target product material not found');
    err.status = 404;
    throw err;
  }
  if (product.type !== 'Finished' && product.type !== 'Semi-Finished') {
    const err = new Error('BOM recipe configurations can only be created for Finished or Semi-Finished Products');
    err.status = 400;
    throw err;
  }

  // 2. Validate component types
  const mpnIds = components.map(c => c.mpnId).filter(Boolean);
  const mpns = await mongoose.model('MPN').find({ _id: { $in: mpnIds } }).populate('materialId');
  
  const invalidTypeMaterials = [];
  const proposedComponentMaterialIds = [];

  for (const mpn of mpns) {
    if (!mpn.materialId) continue;
    const mat = mpn.materialId;
    proposedComponentMaterialIds.push(mat._id.toString());
    
    if (mat.type === 'Finished' || mat.type === 'Finished Goods') {
      invalidTypeMaterials.push(mat.name || mat.code);
    }
  }

  if (invalidTypeMaterials.length > 0) {
    const err = new Error(`Invalid component material type: Finished goods (${invalidTypeMaterials.join(', ')}) cannot be used as components in a BOM.`);
    err.status = 400;
    throw err;
  }

  // 3. Multi-level cycle detection
  const cycleResult = await detectCycle(productId, proposedComponentMaterialIds, currentBomId);
  if (cycleResult.hasCycle) {
    const pathStr = cycleResult.cycleNames.join(' → ');
    const err = new Error(`Cannot save BOM: Component '${cycleResult.cycleNames[1]}' would create a circular dependency (${pathStr}).`);
    err.status = 400;
    throw err;
  }
};

exports.createBOM = async (data, userContext) => {
  const session = await mongoose.startSession();
  startSafeTransaction(session);
  try {
    const { productId, batchSize, batchUOM, components, previousVersionId, effectiveDate, packagingCost, processingCost, overheadCost, manufacturer, updateMasterManufacturer, batchCode, notes } = data;

    await validateBOMComponents(productId, components);

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
      notes: notes || '',
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
      createdBy: userContext.name,
      updatedBy: userContext.name
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
      performedBy: userContext.name,
      ipAddress: userContext.ip,
      details: { version: 1, batchSize, batchUOM }
    }], { session });

    await writeAuditLog(session, 'BOM', newBom._id, 'CREATE', null, newBom, userContext.id);

    await commitSafeTransaction(session);
    return newBom;
  } catch (err) {
    await abortSafeTransaction(session);
    throw err;
  } finally {
    session.endSession();
  }
};

exports.updateBOM = async (id, data, userContext) => {
  const session = await mongoose.startSession();
  startSafeTransaction(session);
  try {
    const { productId, batchSize, batchUOM, components, version, effectiveDate, status, packagingCost, processingCost, overheadCost, manufacturer, updateMasterManufacturer, batchCode, notes } = data;

    const bom = await BOM.findById(id).session(session);
    if (!bom || bom.status === 'Obsolete') {
      await abortSafeTransaction(session);
      const err = new Error('BOM not found or obsolete');
      err.status = 404;
      throw err;
    }

    // Handle partial updates without creating a new version
    if ((status || batchCode !== undefined) && !components && !productId) {
      const updateFields = { updatedBy: userContext.name };
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
        performedBy: userContext.name,
        ipAddress: userContext.ip,
        details: updateFields
      }], { session });

      await commitSafeTransaction(session);
      return { ...bom.toObject(), ...updateFields, _isPartialUpdate: true };
    }

    if (version !== undefined && Number(version) !== bom.version) {
      await abortSafeTransaction(session);
      const err = new Error(`Version conflict: The BOM was modified by someone else (Server version: ${bom.version}, Your version: ${version}). Please reload and try again.`);
      err.status = 409;
      throw err;
    }

    await validateBOMComponents(productId || bom.productId, components, bom._id);

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
    bom.updatedBy = userContext.name;
    await bom.save({ session });

    const newBomData = new BOM({
      productId,
      bomNumber: bom.bomNumber,
      notes: notes !== undefined ? notes : bom.notes,
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
      createdBy: userContext.name,
      updatedBy: userContext.name
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
      performedBy: userContext.name,
      ipAddress: userContext.ip,
      details: { oldVersionId: bom._id, newVersion: newBomData.version }
    }], { session });

    await writeAuditLog(session, 'BOM', newBomData._id, 'UPDATE', oldDoc, newBomData, userContext.id);

    await commitSafeTransaction(session);
    return newBomData;
  } catch (err) {
    await abortSafeTransaction(session);
    throw err;
  } finally {
    session.endSession();
  }
};
