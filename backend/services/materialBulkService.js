const Material = require('../models/Material');
const Sequence = require('../models/Sequence');
const InventoryItem = require('../models/InventoryItem');
const BOM = require('../models/BOM');
const PurchaseOrder = require('../models/PurchaseOrder');
const { syncExcelToMongoDB } = require('../utils/dbSync');
const XLSX = require('xlsx');

class MaterialBulkService {
  /**
   * Processes a JSON array of materials for bulk creation
   * @param {Array} items - Array of material objects
   * @param {string} importSource - Source of import
   * @returns {Object} Result of bulk creation
   */
  static async createMaterialsBatch(items, importSource) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('VALIDATION_ERROR: Please provide an array of material items');
    }

    const errors = [];
    const validItems = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const { name, code, unit } = item;

      if (!name || !code || !unit) {
        errors.push(`Row ${i + 1}: Name, code, and unit of measurement are required.`);
        continue;
      }
      validItems.push(item);
    }

    if (validItems.length === 0) {
      return {
        success: true,
        insertedCount: 0,
        updatedCount: 0,
        errorsCount: errors.length,
        errors
      };
    }

    // Call modular Excel-to-MongoDB synchronization helper
    const syncResult = await syncExcelToMongoDB(Material, validItems, {
      matchFields: ['code'],
      defaultFields: {
        importSource: importSource !== undefined ? importSource : 'Imported data from Excel'
      }
    });

    // Create corresponding InventoryItem documents for newly inserted items
    const upsertedIds = Object.values(syncResult.result.upsertedIds || {});
    if (upsertedIds.length > 0) {
      const invOps = upsertedIds.map(id => ({
        insertOne: {
          document: {
            materialId: id,
            balance: 0
          }
        }
      }));
      await InventoryItem.bulkWrite(invOps);
    }

    // Update sequence based on inserted valid items
    if (validItems.length > 0) {
      let maxNum = 0;
      for (const item of validItems) {
        if (item.code) {
          const match = String(item.code).match(/\d+/);
          if (match) {
            const num = parseInt(match[0], 10);
            if (!isNaN(num) && num > maxNum) maxNum = num;
          }
        }
      }
      
      if (maxNum > 0) {
        const seqDoc = await Sequence.findById('materialCode');
        if (!seqDoc || maxNum > seqDoc.seq) {
          await Sequence.findByIdAndUpdate(
            'materialCode',
            { $set: { seq: maxNum } },
            { upsert: true }
          );
        }
      }
    }

    return {
      success: true,
      insertedCount: syncResult.insertedCount,
      updatedCount: syncResult.updatedCount,
      errorsCount: errors.length + syncResult.errorsCount,
      errors: [...errors, ...syncResult.errors]
    };
  }

  /**
   * Processes an Excel file buffer for bulk material creation
   * @param {Buffer} fileBuffer - The uploaded Excel file buffer
   * @param {string} importSource - Optional import source description
   * @param {boolean|string} isAutoEntry - Whether to auto-generate codes
   * @param {string} originalName - Original filename
   * @returns {Object} Result of bulk creation
   */
  static async createMaterialsBatchUpload(fileBuffer, importSource, isAutoEntry, originalName) {
    if (!fileBuffer) {
      throw new Error('VALIDATION_ERROR: Please upload a spreadsheet file');
    }

    const isAutoEntryVal = isAutoEntry === 'true' || isAutoEntry === true;

    let rows;
    try {
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
        throw new Error('VALIDATION_ERROR: Uploaded file contains no readable sheets.');
      }
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      rows = XLSX.utils.sheet_to_json(worksheet);
    } catch (parseErr) {
      if (parseErr.message && parseErr.message.startsWith('VALIDATION_ERROR:')) throw parseErr;
      throw new Error('VALIDATION_ERROR: Failed to parse uploaded spreadsheet file. File may be corrupted or invalid format.');
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error('VALIDATION_ERROR: Uploaded sheet file is empty');
    }

    const MAX_ROWS = process.env.MAX_UPLOAD_ROWS ? parseInt(process.env.MAX_UPLOAD_ROWS, 10) : 5000;
    if (rows.length > MAX_ROWS) {
      throw new Error(`VALIDATION_ERROR: Uploaded sheet contains ${rows.length} rows, which exceeds the maximum allowed limit of ${MAX_ROWS} rows per upload.`);
    }

    const getRowValueIgnoreCase = (row, keys) => {
      for (const rowKey in row) {
        const normalizedRowKey = rowKey.trim().toLowerCase().replace(/[\s_-]/g, '');
        for (const key of keys) {
          const normalizedKey = key.toLowerCase().replace(/[\s_-]/g, '');
          if (normalizedRowKey === normalizedKey) {
            return row[rowKey];
          }
        }
      }
      return null;
    };

    const materialsList = await Material.find({});
    const systemExistingCodes = materialsList.map(m => m.code.toUpperCase().trim());
    const importedCodesInBatch = new Set();

    let nextAutoCounter = (() => {
      const numericCodes = materialsList
        .map(m => {
          const match = String(m.code || '').match(/\d+/);
          return match ? parseInt(match[0], 10) : null;
        })
        .filter(num => num !== null && !isNaN(num) && num >= 1001 && num <= 9999);
      return numericCodes.length > 0 ? Math.max(...numericCodes) + 1 : 1001;
    })();

    const errors = [];
    const validItems = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const name = (getRowValueIgnoreCase(row, ["materialname", "name", "material_name", "material name"]) || '').toString().trim();
      let code = (getRowValueIgnoreCase(row, ["materialcode", "code", "material_code", "material code"]) || '').toString().trim();
      const unit = (getRowValueIgnoreCase(row, ["unit", "uom", "unitofmeasurement", "unit of measurement"]) || '').toString().trim();
      const type = (getRowValueIgnoreCase(row, ["type", "category", "materialtype", "material type"]) || '').toString().trim();
      const subcategory = (getRowValueIgnoreCase(row, ["subcategory", "sub-category", "sub category", "sub_category"]) || '').toString().trim();
      const description = (getRowValueIgnoreCase(row, ["description", "notes", "materialdescription", "material description"]) || '').toString().trim();
      const status = (getRowValueIgnoreCase(row, ["status", "state"]) || 'Active').toString().trim();

      if (!name || !unit) {
        errors.push(`Row ${i + 1}: Name and UOM are required.`);
        continue;
      }

      if (!code || isAutoEntryVal) {
        const existingByName = materialsList.find(m => 
          m.name.trim().toLowerCase() === name.toLowerCase() &&
          m.type.trim().toLowerCase() === type.toLowerCase()
        );

        if (existingByName) {
          code = existingByName.code;
        } else {
          let generatedCode = `M${nextAutoCounter}`;
          nextAutoCounter++;
          while (systemExistingCodes.includes(generatedCode.toUpperCase()) || importedCodesInBatch.has(generatedCode.toUpperCase())) {
            generatedCode = `M${nextAutoCounter}`;
            nextAutoCounter++;
          }
          code = generatedCode;
        }
      }

      importedCodesInBatch.add(code.toUpperCase());

      validItems.push({
        name,
        code,
        unit,
        type,
        subcategory,
        description,
        status
      });
    }

    if (validItems.length === 0) {
      return {
        success: true,
        insertedCount: 0,
        updatedCount: 0,
        errorsCount: errors.length,
        errors
      };
    }

    const syncResult = await syncExcelToMongoDB(Material, validItems, {
      matchFields: ['code'],
      defaultFields: {
        importSource: importSource || originalName || 'Excel Stream Upload'
      }
    });

    const upsertedIds = Object.values(syncResult.result?.upsertedIds || {});
    if (upsertedIds.length > 0) {
      const invOps = upsertedIds.map(id => ({
        insertOne: {
          document: {
            materialId: id,
            balance: 0
          }
        }
      }));
      await InventoryItem.bulkWrite(invOps);
    }

    return {
      success: true,
      insertedCount: syncResult.insertedCount,
      updatedCount: syncResult.updatedCount,
      errorsCount: errors.length + syncResult.errorsCount,
      errors: [...errors, ...syncResult.errors]
    };
  }

  /**
   * Bulk soft-deletes materials matching a specific import source
   * @param {string} source - Import source to match
   * @returns {Object} Result of bulk deletion
   */
  static async deleteMaterialsBySource(source) {
    if (!source) {
      throw new Error('VALIDATION_ERROR: Source parameter is required');
    }

    // Find all materials with this importSource
    const materialsToDelete = await Material.find({ importSource: source });
    if (materialsToDelete.length === 0) {
      throw new Error('NOT_FOUND: No materials found for this source');
    }

    const materialIds = materialsToDelete.map(m => m._id);

    // Check BOM references
    const linkedBOM = await BOM.findOne({
      status: { $ne: 'Deleted' },
      $or: [
        { productId: { $in: materialIds } },
        { 'components.materialId': { $in: materialIds } }
      ]
    });
    if (linkedBOM) {
      throw new Error('VALIDATION_ERROR: Cannot delete sheet: one or more materials in this sheet are currently referenced in Bill of Materials (BOM) configurations.');
    }

    // Check Purchase Order references
    const linkedPO = await PurchaseOrder.findOne({ 'materials.materialId': { $in: materialIds } });
    if (linkedPO) {
      throw new Error('VALIDATION_ERROR: Cannot delete sheet: one or more materials are linked to historical or active Purchase Orders.');
    }

    // Check inventory stock balance
    const inventory = await InventoryItem.findOne({ materialId: { $in: materialIds }, balance: { $gt: 0 } });
    if (inventory) {
      throw new Error(`VALIDATION_ERROR: Cannot delete sheet: material ${inventory.materialId} has an active stock balance in inventory.`);
    }

    // Perform soft deletion
    await Material.updateMany({ _id: { $in: materialIds } }, { $set: { status: 'Deleted' } });

    return {
      success: true,
      message: `Successfully moved all ${materialIds.length} materials imported from ${source} to deleted history`
    };
  }

  /**
   * Bulk soft-deletes materials by their IDs
   * @param {Array} ids - Array of Material IDs
   * @returns {Object} Result of bulk deletion
   */
  static async batchDeleteMaterials(ids) {
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw new Error('VALIDATION_ERROR: Invalid or empty ids array');
    }

    // Check BOM references
    const linkedBOM = await BOM.findOne({
      status: { $ne: 'Deleted' },
      $or: [
        { productId: { $in: ids } },
        { 'components.materialId': { $in: ids } }
      ]
    });
    if (linkedBOM) {
      throw new Error('VALIDATION_ERROR: Cannot delete materials: one or more items are currently referenced in Bill of Materials (BOM) configurations.');
    }

    // Check Purchase Order references
    const linkedPO = await PurchaseOrder.findOne({ 'materials.materialId': { $in: ids } });
    if (linkedPO) {
      throw new Error('VALIDATION_ERROR: Cannot delete materials: one or more items are linked to historical or active Purchase Orders.');
    }

    // Check inventory stock balance
    const inventory = await InventoryItem.findOne({ materialId: { $in: ids }, balance: { $gt: 0 } });
    if (inventory) {
      throw new Error(`VALIDATION_ERROR: Cannot delete materials: material ${inventory.materialId} has an active stock balance in inventory.`);
    }

    // Perform soft deletion
    const result = await Material.updateMany({ _id: { $in: ids } }, { $set: { status: 'Deleted' } });

    return {
      success: true,
      message: `Successfully moved ${result.modifiedCount} materials to deleted history`,
      count: result.modifiedCount
    };
  }
}

module.exports = MaterialBulkService;
