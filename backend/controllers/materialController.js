const Material = require('../models/Material');
const InventoryItem = require('../models/InventoryItem');
const BOM = require('../models/BOM');
const PurchaseOrder = require('../models/PurchaseOrder');
const ProductionOrder = require('../models/ProductionOrder');
const { syncExcelToMongoDB } = require('../utils/dbSync');

// @desc    Get all materials
// @route   GET /api/materials
// @access  Private
exports.getMaterials = async (req, res, next) => {
  try {
    const { type, search } = req.query;
    const query = {};

    if (type) {
      query.type = type;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } }
      ];
    }

    const materials = await Material.find(query).sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: materials.length, data: materials });
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

    if (!name || !code || !unit) {
      return res.status(400).json({ success: false, error: 'Please provide name, code, and unit of measurement' });
    }

    // Check code uniqueness
    const existing = await Material.findOne({ code: code.toUpperCase() });
    if (existing) {
      return res.status(400).json({ success: false, error: `Material with code '${code}' already exists` });
    }

    const material = await Material.create({
      name,
      code: code.toUpperCase(),
      unit,
      type: type || 'Raw',
      subcategory,
      status: status || 'Active',
      description
    });

    // Automatically initialize inventory balance for this material
    await InventoryItem.create({
      materialId: material._id,
      balance: 0
    });

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

    const material = await Material.findByIdAndDelete(materialId);
    if (!material) {
      return res.status(404).json({ success: false, error: 'Material not found' });
    }

    // Delete associated inventory item
    await InventoryItem.findOneAndDelete({ materialId });

    res.status(200).json({ success: true, message: 'Material deleted successfully', data: {} });
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

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet);

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, error: 'Uploaded sheet file is empty' });
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
        .map(m => parseInt(m.code, 10))
        .filter(num => !isNaN(num) && num >= 2001 && num <= 9999);
      return numericCodes.length > 0 ? Math.max(...numericCodes) + 1 : 2001;
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
      const description = (getRowValueIgnoreCase(row, ["description", "desc", "notes", "materialdescription", "material description"]) || '').toString().trim();
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
          let generatedCode = nextAutoCounter.toString();
          nextAutoCounter++;
          while (systemExistingCodes.includes(generatedCode) || importedCodesInBatch.has(generatedCode)) {
            generatedCode = nextAutoCounter.toString();
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

    // Perform deletion
    await Material.deleteMany({ _id: { $in: materialIds } });
    await InventoryItem.deleteMany({ materialId: { $in: materialIds } });

    res.status(200).json({
      success: true,
      message: `Successfully deleted all ${materialIds.length} materials imported from ${source}`
    });
  } catch (err) {
    next(err);
  }
};
