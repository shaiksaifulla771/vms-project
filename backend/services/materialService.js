const mongoose = require('mongoose');
const Material = require('../models/Material');
const Sequence = require('../models/Sequence');
const InventoryItem = require('../models/InventoryItem');
const BOM = require('../models/BOM');
const PurchaseOrder = require('../models/PurchaseOrder');
const { writeAuditLog } = require('./auditService');
const { startSafeTransaction, commitSafeTransaction, abortSafeTransaction } = require('../utils/transaction');

class MaterialService {
  /**
   * Creates a new material while respecting auto-generation Sequence bounds
   * @param {Object} data - Material data
   * @param {string} userId - User ID for audit logs
   * @returns {Object} Created Material document
   */
  static async createMaterial(data, userId) {
    const session = await mongoose.startSession();
    startSafeTransaction(session);
    try {
      let { name, code, unit, type, subcategory, status, description, basePrice } = data;

      if (!name || !unit || typeof name !== 'string' || typeof unit !== 'string') {
        throw new Error('VALIDATION_ERROR: Please provide valid text strings for name and unit of measurement');
      }

      if (!code || typeof code !== 'string' || !code.trim()) {
        const allM = await Material.find({ code: /^M\d+$/ }, 'code').session(session);
        let maxNum = 1000;
        for (const m of allM) {
          const num = parseInt(m.code.substring(1), 10);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
        code = `M${maxNum + 1}`;
      }

      let finalCode = code.trim().toUpperCase();
      const existing = await Material.findOne({ code: finalCode }).session(session);
      
      if (existing) {
        if (/^M\d+$/.test(finalCode)) {
          // If the auto-assigned code was taken while the form was open, fetch the true next sequence
          const allM = await Material.find({ code: /^M\d+$/ }, 'code').session(session);
          let maxNum = 1000;
          for (const m of allM) {
            const num = parseInt(m.code.substring(1), 10);
            if (!isNaN(num) && num > maxNum) maxNum = num;
          }
          finalCode = `M${maxNum + 1}`;
        } else {
          throw new Error(`DUPLICATE_ERROR: Material with code '${finalCode}' already exists`);
        }
      }

      const material = new Material({
        name,
        code: finalCode,
        unit,
        type: type || 'Raw Material',
        subcategory,
        status: status || 'Active',
        description,
        basePrice: typeof basePrice === 'number' ? basePrice : parseFloat(basePrice) || 0
      });
      
      await material.save({ session });

      // Update sequence to reflect manually-typed code if it falls within numeric M-code range and is higher than current sequence
      const match = material.code.match(/^M(\d+)$/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num >= 1000) {
          const seqDoc = await Sequence.findById('materialCode').session(session);
          const currentSeq = (seqDoc && typeof seqDoc.seq === 'number') ? seqDoc.seq : 1000;
          if (num > currentSeq) {
            console.log(`[SEQUENCE SYNC] Manual code created: M${num}. Updating sequence table from ${currentSeq} -> ${num}...`);
            await Sequence.findByIdAndUpdate(
              'materialCode',
              { $set: { seq: num } },
              { upsert: true, new: true, session }
            );
          }
        }
      }

      // Write audit log
      await writeAuditLog(session, 'Material', material._id, 'CREATE', null, material, userId);

      await commitSafeTransaction(session);
      return material;
    } catch (err) {
      await abortSafeTransaction(session);
      throw err;
    } finally {
      session.endSession();
    }
  }

  /**
   * Updates an existing material
   * @param {string} id - Material ID
   * @param {Object} data - Update data
   * @param {string} userId - User ID for audit logs
   * @returns {Object} Updated Material document
   */
  static async updateMaterial(id, data, userId) {
    const session = await mongoose.startSession();
    startSafeTransaction(session);
    try {
      const { name, code, unit, type, subcategory, status, description } = data;
      let material = await Material.findById(id).session(session);

      if (!material) {
        throw new Error('NOT_FOUND: Material not found');
      }

      if (code !== undefined && typeof code !== 'string') {
        throw new Error('VALIDATION_ERROR: Material code must be a valid text string');
      }
      if (name !== undefined && typeof name !== 'string') {
        throw new Error('VALIDATION_ERROR: Material name must be a valid text string');
      }

      // Check code uniqueness if changed
      if (code && code.toUpperCase() !== material.code) {
        const existing = await Material.findOne({ code: code.toUpperCase() }).session(session);
        if (existing) {
          throw new Error(`DUPLICATE_ERROR: Material with code '${code}' already exists`);
        }
      }

      const oldDoc = material.toObject();

      if (name !== undefined) material.name = name;
      if (code !== undefined) material.code = code.toUpperCase();
      if (unit !== undefined) material.unit = unit;
      if (type !== undefined) material.type = type;
      if (subcategory !== undefined) material.subcategory = subcategory;
      if (status !== undefined) material.status = status;
      if (description !== undefined) material.description = description;

      await material.save({ session });

      // Write audit log
      await writeAuditLog(session, 'Material', material._id, 'UPDATE', oldDoc, material, userId);

      await commitSafeTransaction(session);
      return material;
    } catch (err) {
      await abortSafeTransaction(session);
      throw err;
    } finally {
      session.endSession();
    }
  }

  /**
   * Soft deletes a material, checking referential integrity first
   * @param {string} materialId - Material ID
   * @param {string} userId - User ID for audit logs
   * @returns {Object} Deleted Material document
   */
  static async deleteMaterial(materialId, userId) {
    const session = await mongoose.startSession();
    startSafeTransaction(session);
    try {
      // Check if referenced in any BOM
      const linkedBOM = await BOM.findOne({
        status: { $ne: 'Deleted' },
        $or: [
          { productId: materialId },
          { 'components.materialId': materialId }
        ]
      }).session(session);
      if (linkedBOM) {
        throw new Error('VALIDATION_ERROR: Cannot delete material: it is currently referenced in one or more Bill of Materials (BOM) configurations.');
      }

      // Check if referenced in any Purchase Order
      const linkedPO = await PurchaseOrder.findOne({ 'materials.materialId': materialId }).session(session);
      if (linkedPO) {
        throw new Error('VALIDATION_ERROR: Cannot delete material: it is linked to historical or active Purchase Orders.');
      }

      // Check if referenced in any Production Order (via BOM)
      const inventory = await InventoryItem.findOne({ materialId }).session(session);
      if (inventory && inventory.balance > 0) {
        throw new Error(`VALIDATION_ERROR: Cannot delete material: there is an active stock balance of ${inventory.balance} in inventory.`);
      }

      const material = await Material.findById(materialId).session(session);
      if (!material) {
        throw new Error('NOT_FOUND: Material not found');
      }

      const oldDoc = material.toObject();
      material.status = 'Deleted';
      await material.save({ session });

      // Write audit log for soft delete
      await writeAuditLog(session, 'Material', material._id, 'DELETE', oldDoc, material, userId);

      await commitSafeTransaction(session);
      return material;
    } catch (err) {
      await abortSafeTransaction(session);
      throw err;
    } finally {
      session.endSession();
    }
  }
}

module.exports = MaterialService;
