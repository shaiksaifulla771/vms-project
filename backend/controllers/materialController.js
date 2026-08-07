const Material = require('../models/Material');
const { startSafeTransaction, commitSafeTransaction, abortSafeTransaction } = require('../utils/transaction');
const InventoryItem = require('../models/InventoryItem');
const BOM = require('../models/BOM');
const PurchaseOrder = require('../models/PurchaseOrder');
const ProductionOrder = require('../models/ProductionOrder');
const MPN = require('../models/MPN');
const { syncExcelToMongoDB } = require('../utils/dbSync');
const { escapeRegex } = require('../utils/security');
const mongoose = require('mongoose');
const { writeAuditLog } = require('../services/auditService');

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

const MaterialService = require('../services/materialService');

// @desc    Create a material
// @route   POST /api/materials
// @access  Private
exports.createMaterial = async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : null;
    const material = await MaterialService.createMaterial(req.body, userId);
    res.status(201).json({ success: true, data: material });
  } catch (err) {
    if (err.message.startsWith('VALIDATION_ERROR:') || err.message.startsWith('DUPLICATE_ERROR:')) {
      return res.status(400).json({ success: false, error: err.message.split(': ')[1] });
    }
    next(err);
  }
};

// @desc    Update a material
// @route   PUT /api/materials/:id
// @access  Private
exports.updateMaterial = async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : null;
    const material = await MaterialService.updateMaterial(req.params.id, req.body, userId);
    res.status(200).json({ success: true, data: material });
  } catch (err) {
    if (err.message.startsWith('NOT_FOUND:')) {
      return res.status(404).json({ success: false, error: 'Material not found' });
    }
    if (err.message.startsWith('VALIDATION_ERROR:') || err.message.startsWith('DUPLICATE_ERROR:')) {
      return res.status(400).json({ success: false, error: err.message.split(': ')[1] });
    }
    next(err);
  }
};

// @desc    Delete a material (checks references to maintain integrity)
// @route   DELETE /api/materials/:id
// @access  Private
exports.deleteMaterial = async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : null;
    await MaterialService.deleteMaterial(req.params.id, userId);
    res.status(200).json({ success: true, message: 'Material moved to deleted history successfully', data: {} });
  } catch (err) {
    if (err.message.startsWith('NOT_FOUND:')) {
      return res.status(404).json({ success: false, error: 'Material not found' });
    }
    if (err.message.startsWith('VALIDATION_ERROR:')) {
      return res.status(400).json({ success: false, error: err.message.split(': ')[1] });
    }
    next(err);
  }
};

const MaterialBulkService = require('../services/materialBulkService');

// @desc    Create batch materials
// @route   POST /api/materials/batch
// @access  Private
exports.createMaterialsBatch = async (req, res, next) => {
  try {
    const { items, importSource } = req.body;
    const result = await MaterialBulkService.createMaterialsBatch(items, importSource);
    res.status(200).json(result);
  } catch (err) {
    if (err.message && err.message.startsWith('VALIDATION_ERROR:')) {
      return res.status(400).json({ success: false, error: err.message.split('VALIDATION_ERROR: ')[1] });
    }
    next(err);
  }
};

// @desc    Upload batch materials via Excel
// @route   POST /api/materials/batch-upload
// @access  Private
exports.createMaterialsBatchUpload = async (req, res, next) => {
  try {
    const fileBuffer = req.file ? req.file.buffer : null;
    const originalName = req.file ? req.file.originalname : null;
    const { importSource, isAutoEntry } = req.body;
    
    const result = await MaterialBulkService.createMaterialsBatchUpload(fileBuffer, importSource, isAutoEntry, originalName);
    res.status(200).json(result);
  } catch (err) {
    if (err.message && err.message.startsWith('VALIDATION_ERROR:')) {
      return res.status(400).json({ success: false, error: err.message.split('VALIDATION_ERROR: ')[1] });
    }
    next(err);
  }
};

// @desc    Delete all materials matching a specific import source
// @route   POST /api/materials/batch-delete-source
// @access  Private
exports.deleteMaterialsBySource = async (req, res, next) => {
  try {
    const { source } = req.body;
    const result = await MaterialBulkService.deleteMaterialsBySource(source);
    res.status(200).json(result);
  } catch (err) {
    if (err.message && err.message.startsWith('VALIDATION_ERROR:')) {
      return res.status(400).json({ success: false, error: err.message.split('VALIDATION_ERROR: ')[1] });
    }
    if (err.message && err.message.startsWith('NOT_FOUND:')) {
      return res.status(404).json({ success: false, error: err.message.split('NOT_FOUND: ')[1] });
    }
    next(err);
  }
};

// @desc    Batch delete materials by IDs
// @route   POST /api/materials/batch-delete
// @access  Private
exports.batchDeleteMaterials = async (req, res, next) => {
  try {
    const { ids } = req.body;
    const result = await MaterialBulkService.batchDeleteMaterials(ids);
    res.status(200).json(result);
  } catch (err) {
    if (err.message && err.message.startsWith('VALIDATION_ERROR:')) {
      return res.status(400).json({ success: false, error: err.message.split('VALIDATION_ERROR: ')[1] });
    }
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
