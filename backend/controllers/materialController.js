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
const cacheService = require('../services/cacheService');

// @desc    Get all materials with pagination, search, select & Redis caching
// @route   GET /api/materials
// @access  Private
exports.getMaterials = async (req, res, next) => {
  try {
    const { type, search } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = parseInt(req.query.limit) || 0; // 0 means no pagination limit for backward compatibility
    const query = {};

    if (type === 'Deleted') {
      query.status = 'Deleted';
    } else {
      query.status = { $ne: 'Deleted' };
      if (type) {
        query.type = type;
      }
    }

    if (search && search.trim() !== '') {
      const safeSearch = escapeRegex(search.trim());
      query.$or = [
        { name: { $regex: safeSearch, $options: 'i' } },
        { code: { $regex: safeSearch, $options: 'i' } },
        { subcategory: { $regex: safeSearch, $options: 'i' } }
      ];
    }

    // Check Redis cache
    const cacheKey = `materials:list:${type || 'all'}:${search || 'none'}:${page}:${limit}`;
    const cachedResponse = await cacheService.get(cacheKey);
    if (cachedResponse) {
      return res.status(200).json(cachedResponse);
    }

    const totalCount = await Material.countDocuments(query);
    let materialQuery = Material.find(query)
      .select('name code unit basePrice type subcategory status description importSource manufacturer createdAt')
      .sort({ createdAt: -1 })
      .lean();

    if (limit > 0) {
      materialQuery = materialQuery.skip((page - 1) * limit).limit(limit);
    }

    const materials = await materialQuery;

    // Augment with hasValidPrice flag for frontend BOM warnings
    const mpns = await MPN.find({ status: 'Active' }).select('materialId unitPrice price').lean();
    const mpnMap = {};
    mpns.forEach(m => {
      const price = m.unitPrice !== undefined ? m.unitPrice : m.price;
      if (m.materialId && typeof price === 'number' && price > 0) {
        mpnMap[m.materialId.toString()] = true;
      }
    });

    const augmentedMaterials = materials.map(mat => {
      const hasBasePrice = typeof mat.basePrice === 'number' && mat.basePrice > 0;
      return {
        ...mat,
        hasValidPrice: hasBasePrice || !!mpnMap[mat._id.toString()]
      };
    });

    const responsePayload = {
      success: true,
      count: augmentedMaterials.length,
      total: totalCount,
      page: limit > 0 ? page : 1,
      limit: limit > 0 ? limit : totalCount,
      totalPages: limit > 0 ? Math.ceil(totalCount / limit) : 1,
      data: augmentedMaterials,
      items: augmentedMaterials
    };

    // Cache in Redis for 5 minutes
    await cacheService.set(cacheKey, responsePayload, 300);

    res.status(200).json(responsePayload);
  } catch (err) {
    next(err);
  }
};

// @desc    Get single material
// @route   GET /api/materials/:id
// @access  Private
exports.getMaterial = async (req, res, next) => {
  try {
    const cacheKey = `materials:item:${req.params.id}`;
    const cached = await cacheService.get(cacheKey);
    if (cached) return res.status(200).json({ success: true, data: cached });

    const material = await Material.findById(req.params.id).lean();
    if (!material) {
      return res.status(404).json({ success: false, error: 'Material not found' });
    }
    await cacheService.set(cacheKey, material, 300);
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
    await cacheService.invalidatePattern('materials:*');
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
    await cacheService.del(`materials:item:${req.params.id}`);
    await cacheService.invalidatePattern('materials:*');
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
    await cacheService.del(`materials:item:${req.params.id}`);
    await cacheService.invalidatePattern('materials:*');
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
    await cacheService.invalidatePattern('materials:*');
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
    await cacheService.invalidatePattern('materials:*');
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
    await cacheService.invalidatePattern('materials:*');
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
    await cacheService.invalidatePattern('materials:*');
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
    ).lean();

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

    const seqDoc = await Sequence.findOne({ $or: [{ name: /materialCode/i }, { _id: 'materialCode' }] }).lean();
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
    ).lean();

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

    const seqDoc = await Sequence.findById('materialCode').lean();
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
