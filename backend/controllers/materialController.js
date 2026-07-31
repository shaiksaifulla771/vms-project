const Material = require('../models/Material');
const InventoryItem = require('../models/InventoryItem');
const BOM = require('../models/BOM');
const PurchaseOrder = require('../models/PurchaseOrder');
const ProductionOrder = require('../models/ProductionOrder');
const MPN = require('../models/MPN');
const { syncExcelToMongoDB } = require('../utils/dbSync');
const { escapeRegex } = require('../utils/security');

// @desc    Get all materials
// @route   GET /api/materials
// @access  Private
exports.getMaterials = async (req, res, next) => {
  try {
    const { type, search } = req.query;
    const query = {};

    if (type === 'Deleted') {
      query.status = 'Deleted';
    } else {
      query.status = { $ne: 'Deleted' };
      if (type) {
        query.type = type;
      }
    }

    if (search) {
      const safeSearch = escapeRegex(search);
      query.$or = [
        { name: { $regex: safeSearch, $options: 'i' } },
        { code: { $regex: safeSearch, $options: 'i' } }
      ];
    }

    const materials = await Material.find(query).sort({ createdAt: -1 });

    // Augment with hasValidPrice flag for frontend BOM warnings
    const mpns = await MPN.find({ status: 'Active' }).select('materialId unitPrice');
    const mpnMap = {};
    mpns.forEach(m => {
      if (m.materialId && typeof m.unitPrice === 'number' && m.unitPrice > 0) {
        mpnMap[m.materialId.toString()] = true;
      }
    });

    const augmentedMaterials = materials.map(mat => {
      const doc = mat.toObject();
      const hasBasePrice = typeof doc.basePrice === 'number' && doc.basePrice > 0;
      doc.hasValidPrice = hasBasePrice || !!mpnMap[mat._id.toString()];
      return doc;
    });

    res.status(200).json({ success: true, count: augmentedMaterials.length, data: augmentedMaterials });
  } catch (err) {
    next(err);
  }
};

// @desc    Get single material
// @route   GET /api/materials/:id
// @access  Private
exports.getMaterial = async (req, res, next) => {
  try {
    const material = await Material.findById(req.params.id);
    if (!material) {
      return res.status(404).json({ success: false, error: 'Material not found' });
    }
    res.status(200).json({ success: true, data: material });
  } catch (err) {
    next(err);
  }
};

// @desc    Create a material
// @route   POST /api/materials
// @access  Private
exports.createMaterial = async (req, res, next) => {
  try {
    const { name, code, unit, type, subcategory, status, description } = req.body;

    if (!name || !code || !unit || typeof name !== 'string' || typeof code !== 'string' || typeof unit !== 'string') {
      return res.status(400).json({ success: false, error: 'Please provide valid text strings for name, code, and unit of measurement' });
    }

    let finalCode = code.toUpperCase();
    const existing = await Material.findOne({ code: finalCode });
    
    if (existing) {
      if (/^M\d+$/.test(finalCode)) {
        // If the auto-assigned code was taken while the form was open, fetch the true next sequence
        const allM = await Material.find({ code: /^M\d+$/ }, 'code');
        let maxNum = 1000;
        for (const m of allM) {
          const num = parseInt(m.code.substring(1), 10);
          if (num > maxNum) maxNum = num;
        }
        finalCode = `M${maxNum + 1}`;
      } else {
        return res.status(400).json({ success: false, error: `Material with code '${finalCode}' already exists` });
      }
    }

    const material = await Material.create({
      name,
      code: finalCode,
      unit,
      type: type || 'Raw Material',
      subcategory,
      status: status || 'Active',
      description
    });

    // Automatically initialize inventory balance for this material
    await InventoryItem.create({
      materialId: material._id,
      balance: 0
    });

    // Update sequence to reflect manually-typed code if it falls within numeric M-code range and is higher than current sequence
    const match = material.code.match(/^M(\d+)$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num >= 1000) {
        const Sequence = require('../models/Sequence');
        const seqDoc = await Sequence.findById('materialCode');
        const currentSeq = (seqDoc && typeof seqDoc.seq === 'number') ? seqDoc.seq : 1000;
        if (num > currentSeq) {
          console.log(`[SEQUENCE SYNC] Manual code created: M${num}. Updating sequence table from ${currentSeq} -> ${num}...`);
          await Sequence.findByIdAndUpdate(
            'materialCode',
            { $set: { seq: num } },
            { upsert: true, new: true }
          );
        }
      }
    }

    res.status(201).json({ success: true, data: material });
  } catch (err) {
    next(err);
  }
};

// @desc    Update a material
// @route   PUT /api/materials/:id
// @access  Private
exports.updateMaterial = async (req, res, next) => {
  try {
    const { name, code, unit, type, subcategory, status, description } = req.body;
    let material = await Material.findById(req.params.id);

    if (!material) {
      return res.status(404).json({ success: false, error: 'Material not found' });
    }

    if (code !== undefined && typeof code !== 'string') {
      return res.status(400).json({ success: false, error: 'Material code must be a valid text string' });
    }
    if (name !== undefined && typeof name !== 'string') {
      return res.status(400).json({ success: false, error: 'Material name must be a valid text string' });
    }

    // Check code uniqueness if changed
    if (code && code.toUpperCase() !== material.code) {
      const existing = await Material.findOne({ code: code.toUpperCase() });
      if (existing) {
        return res.status(400).json({ success: false, error: `Material with code '${code}' already exists` });
      }
    }

    material = await Material.findByIdAndUpdate(
      req.params.id,
      { name, code: code ? code.toUpperCase() : undefined, unit, type, subcategory, status, description },
      { new: true, runValidators: true }
    );

    res.status(200).json({ success: true, data: material });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete a material (checks references to maintain integrity)
// @route   DELETE /api/materials/:id
// @access  Private
exports.deleteMaterial = async (req, res, next) => {
  try {
    const materialId = req.params.id;

    // Check if referenced in any BOM
    const linkedBOM = await BOM.findOne({
      $or: [
        { productId: materialId },
        { 'components.materialId': materialId }
      ]
    });
    if (linkedBOM) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete material: it is currently referenced in one or more Bill of Materials (BOM) configurations.'
      });
    }

    // Check if referenced in any Purchase Order
    const linkedPO = await PurchaseOrder.findOne({ 'materials.materialId': materialId });
    if (linkedPO) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete material: it is linked to historical or active Purchase Orders.'
      });
    }

    // Check if referenced in any Production Order (via BOM)
    // Deleting the material is already blocked if BOM is present, but let's check inventory items
    const inventory = await InventoryItem.findOne({ materialId });
    if (inventory && inventory.balance > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete material: there is an active stock balance of ${inventory.balance} in inventory.`
      });
    }

    const material = await Material.findById(materialId);
    if (!material) {
      return res.status(404).json({ success: false, error: 'Material not found' });
    }

    material.status = 'Deleted';
    await material.save();

    res.status(200).json({ success: true, message: 'Material moved to deleted history successfully', data: {} });
  } catch (err) {
    next(err);
  }
};

// @desc    Create batch materials
// @route   POST /api/materials/batch
// @access  Private
exports.createMaterialsBatch = async (req, res, next) => {
  try {
    const { items, importSource } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Please provide an array of material items' });
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
      return res.status(200).json({
        success: true,
        insertedCount: 0,
        updatedCount: 0,
        errorsCount: errors.length,
        errors
      });
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
        const Sequence = require('../models/Sequence');
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

    res.status(200).json({
      success: true,
      insertedCount: syncResult.insertedCount,
      updatedCount: syncResult.updatedCount,
      errorsCount: errors.length + syncResult.errorsCount,
      errors: [...errors, ...syncResult.errors]
    });
  } catch (err) {
    next(err);
  }
};

const XLSX = require('xlsx');

exports.createMaterialsBatchUpload = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Please upload a spreadsheet file' });
    }

    const { importSource, isAutoEntry } = req.body;
    const isAutoEntryVal = isAutoEntry === 'true' || isAutoEntry === true;

    let rows;
    try {
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
        return res.status(400).json({ success: false, error: 'Uploaded file contains no readable sheets.' });
      }
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      rows = XLSX.utils.sheet_to_json(worksheet);
    } catch (parseErr) {
      return res.status(400).json({ success: false, error: 'Failed to parse uploaded spreadsheet file. File may be corrupted or invalid format.' });
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, error: 'Uploaded sheet file is empty' });
    }

    const MAX_ROWS = process.env.MAX_UPLOAD_ROWS ? parseInt(process.env.MAX_UPLOAD_ROWS, 10) : 5000;
    if (rows.length > MAX_ROWS) {
      return res.status(400).json({ success: false, error: `Uploaded sheet contains ${rows.length} rows, which exceeds the maximum allowed limit of ${MAX_ROWS} rows per upload.` });
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
      return res.status(200).json({
        success: true,
        insertedCount: 0,
        updatedCount: 0,
        errorsCount: errors.length,
        errors
      });
    }

    const syncResult = await syncExcelToMongoDB(Material, validItems, {
      matchFields: ['code'],
      defaultFields: {
        importSource: importSource || req.file.originalname || 'Excel Stream Upload'
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

    res.status(200).json({
      success: true,
      insertedCount: syncResult.insertedCount,
      updatedCount: syncResult.updatedCount,
      errorsCount: errors.length + syncResult.errorsCount,
      errors: [...errors, ...syncResult.errors]
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete all materials matching a specific import source
// @route   POST /api/materials/batch-delete-source
// @access  Private
exports.deleteMaterialsBySource = async (req, res, next) => {
  try {
    const { source } = req.body;
    if (!source) {
      return res.status(400).json({ success: false, error: 'Source parameter is required' });
    }

    // Find all materials with this importSource
    const materialsToDelete = await Material.find({ importSource: source });
    if (materialsToDelete.length === 0) {
      return res.status(404).json({ success: false, error: 'No materials found for this source' });
    }

    const materialIds = materialsToDelete.map(m => m._id);

    // Check BOM references
    const linkedBOM = await BOM.findOne({
      $or: [
        { productId: { $in: materialIds } },
        { 'components.materialId': { $in: materialIds } }
      ]
    });
    if (linkedBOM) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete sheet: one or more materials in this sheet are currently referenced in Bill of Materials (BOM) configurations.'
      });
    }

    // Check Purchase Order references
    const linkedPO = await PurchaseOrder.findOne({ 'materials.materialId': { $in: materialIds } });
    if (linkedPO) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete sheet: one or more materials are linked to historical or active Purchase Orders.'
      });
    }

    // Check inventory stock balance
    const inventory = await InventoryItem.findOne({ materialId: { $in: materialIds }, balance: { $gt: 0 } });
    if (inventory) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete sheet: material ${inventory.materialId} has an active stock balance in inventory.`
      });
    }

    // Perform soft deletion
    await Material.updateMany({ _id: { $in: materialIds } }, { $set: { status: 'Deleted' } });

    res.status(200).json({
      success: true,
      message: `Successfully moved all ${materialIds.length} materials imported from ${source} to deleted history`
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Batch delete materials by IDs
// @route   POST /api/materials/batch-delete
// @access  Private
exports.batchDeleteMaterials = async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'Invalid or empty ids array' });
    }

    // Check BOM references
    const linkedBOM = await BOM.findOne({
      $or: [
        { productId: { $in: ids } },
        { 'components.materialId': { $in: ids } }
      ]
    });
    if (linkedBOM) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete materials: one or more items are currently referenced in Bill of Materials (BOM) configurations.'
      });
    }

    // Check Purchase Order references
    const linkedPO = await PurchaseOrder.findOne({ 'materials.materialId': { $in: ids } });
    if (linkedPO) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete materials: one or more items are linked to historical or active Purchase Orders.'
      });
    }

    // Check inventory stock balance
    const inventory = await InventoryItem.findOne({ materialId: { $in: ids }, balance: { $gt: 0 } });
    if (inventory) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete materials: material ${inventory.materialId} has an active stock balance in inventory.`
      });
    }

    // Perform soft deletion
    const result = await Material.updateMany({ _id: { $in: ids } }, { $set: { status: 'Deleted' } });

    res.status(200).json({
      success: true,
      message: `Successfully moved ${result.modifiedCount} materials to deleted history`,
      count: result.modifiedCount
    });
  } catch (err) {
    next(err);
  }
};


// @desc    Peek next available material code without incrementing
// @route   GET /api/materials/sequence-peek
// @access  Private
exports.peekNextMaterialCode = async (req, res, next) => {
  try {
    const Sequence = require('../models/Sequence');
    const activeMaterials = await Material.find(
      { code: /^M\d+$/i, status: { $ne: 'Deleted' } },
      { code: 1 }
    );

    let maxNum = 1000;
    activeMaterials.forEach(m => {
      if (m.code) {
        const match = m.code.toString().match(/\d+/);
        if (match) {
          const num = parseInt(match[0], 10);
          if (!isNaN(num) && num < 10000 && num > maxNum) {
            maxNum = num;
          }
        }
      }
    });

    const seqDoc = await Sequence.findOne({ $or: [{ name: /materialCode/i }, { _id: 'materialCode' }] });
    const seqNum = (seqDoc && typeof seqDoc.seq === 'number') ? seqDoc.seq : 1000;
    const finalMax = Math.max(maxNum, seqNum);

    res.status(200).json({ success: true, nextCode: `M${finalMax + 1}` });
  } catch (err) {
    next(err);
  }
};

// @desc    Get next available material code and increment sequence
// @route   GET /api/materials/next-code
// @access  Private
exports.getNextMaterialCode = async (req, res, next) => {
  try {
    const Sequence = require('../models/Sequence');
    const activeMaterials = await Material.find(
      { code: /^M\d+$/i, status: { $ne: 'Deleted' } },
      { code: 1 }
    );

    let maxNum = 1000;
    activeMaterials.forEach(m => {
      if (m.code) {
        const match = m.code.toString().match(/\d+/);
        if (match) {
          const num = parseInt(match[0], 10);
          if (!isNaN(num) && num > maxNum) {
            maxNum = num;
          }
        }
      }
    });

    const seqDoc = await Sequence.findById('materialCode');
    const seqNum = (seqDoc && typeof seqDoc.seq === 'number') ? seqDoc.seq : 1000;
    const nextNum = Math.max(maxNum, seqNum) + 1;

    await Sequence.findByIdAndUpdate(
      'materialCode',
      { $set: { seq: nextNum } },
      { upsert: true, new: true }
    );

    res.status(200).json({ success: true, nextCode: `M${nextNum}` });
  } catch (err) {
    next(err);
  }
};
