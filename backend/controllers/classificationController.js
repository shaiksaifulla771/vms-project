const MaterialClassification = require('../models/MaterialClassification');
const VendorClassification = require('../models/VendorClassification');
const Material = require('../models/Material');
const Vendor = require('../models/Vendor');
const { escapeRegex } = require('../utils/security');

// Helper to pick classification model
const getModel = (type) => {
  if (type === 'vendor' || type === 'Vendor' || type === 'vendors') {
    return VendorClassification;
  }
  return MaterialClassification;
};

// Helper to pick item model
const getItemModel = (type) => {
  if (type === 'vendor' || type === 'Vendor' || type === 'vendors') {
    return Vendor;
  }
  return Material;
};

// Helper to retrieve all descendant IDs of a parent node
const getAllDescendantIds = async (Model, parentId) => {
  const allIds = [String(parentId)];
  let currentParentIds = [parentId];
  while (currentParentIds.length > 0) {
    const children = await Model.find({ parentId: { $in: currentParentIds }, status: { $ne: 'Deleted' } }).select('_id').lean();
    if (!children.length) break;
    const childIds = children.map(c => c._id);
    allIds.push(...childIds.map(String));
    currentParentIds = childIds;
  }
  return allIds;
};

// Helper to check if potentialParent is a descendant of targetId
const isDescendant = async (Model, targetId, potentialParentId) => {
  let current = await Model.findById(potentialParentId).select('parentId').lean();
  while (current && current.parentId) {
    if (String(current.parentId) === String(targetId)) {
      return true;
    }
    current = await Model.findById(current.parentId).select('parentId').lean();
  }
  return false;
};

// Mutex set to avoid overlapping sync operations
const syncLocks = new Set();

// Master Data Synchronization & Harvesting Logic
const syncMasterData = async (type) => {
  const isVendor = type === 'vendor' || type === 'Vendor' || type === 'vendors';
  const lockKey = isVendor ? 'vendor' : 'material';

  if (syncLocks.has(lockKey)) {
    return { createdCategories: 0, createdSubcategories: 0, linkedItems: 0, inProgress: true };
  }

  syncLocks.add(lockKey);
  try {
    let createdCategories = 0;
    let createdSubcategories = 0;
    let linkedItems = 0;

    if (isVendor) {
      // 1. Harvest distinct categories from Vendor
      const rawCategories = await Vendor.distinct('category', { status: { $ne: 'Deleted' } });
      const catList = Array.from(new Set(rawCategories.map(c => (c || '').trim()).filter(Boolean)));
      if (!catList.includes('Other')) catList.push('Other');

      for (const catName of catList) {
        let catDoc = await VendorClassification.findOne({ name: catName, parentId: null, status: { $ne: 'Deleted' } });
        if (!catDoc) {
          catDoc = await VendorClassification.create({
            name: catName,
            code: catName.slice(0, 4).toUpperCase(),
            parentId: null,
            status: 'Active',
            description: `${catName} vendor category harvested from master records`
          });
          createdCategories++;
        }

        // 2. Harvest subcategories under this category
        const subCategories = await Vendor.distinct('subCategory', {
          category: catName,
          status: { $ne: 'Deleted' }
        });
        const subList = Array.from(new Set(subCategories.map(s => (s || '').trim()).filter(Boolean)));

        for (const subName of subList) {
          let subDoc = await VendorClassification.findOne({ name: subName, parentId: catDoc._id, status: { $ne: 'Deleted' } });
          if (!subDoc) {
            subDoc = await VendorClassification.create({
              name: subName,
              code: `${catDoc.code || 'CAT'}-${subName.slice(0, 3).toUpperCase()}`,
              parentId: catDoc._id,
              status: 'Active',
              description: `${subName} sub-category under ${catName}`
            });
            createdSubcategories++;
          }

          // Link vendors having (category, subCategory)
          const updateRes = await Vendor.updateMany(
            { category: catName, subCategory: subName, categoryId: null, status: { $ne: 'Deleted' } },
            { $set: { categoryId: subDoc._id } }
          );
          linkedItems += (updateRes.modifiedCount || 0);
        }

        // Link vendors that have no subCategory directly to root category
        const updateRootRes = await Vendor.updateMany(
          { category: catName, $or: [{ subCategory: null }, { subCategory: '' }], categoryId: null, status: { $ne: 'Deleted' } },
          { $set: { categoryId: catDoc._id } }
        );
        linkedItems += (updateRootRes.modifiedCount || 0);
      }
    } else {
      // 1. Harvest distinct types/categories from Material
      const rawTypes = await Material.distinct('type', { status: { $ne: 'Deleted' } });
      const typeList = Array.from(new Set(rawTypes.map(t => (t || '').trim()).filter(Boolean)));
      ['Raw Material', 'Packaged Material', 'Semi-Finished', 'Finished'].forEach(t => {
        if (!typeList.includes(t)) typeList.push(t);
      });

      for (const typeName of typeList) {
        let catDoc = await MaterialClassification.findOne({ name: typeName, parentId: null, status: { $ne: 'Deleted' } });
        if (!catDoc) {
          catDoc = await MaterialClassification.create({
            name: typeName,
            code: typeName.split(' ').map(w => w[0]).join('').toUpperCase() || 'MAT',
            parentId: null,
            status: 'Active',
            description: `${typeName} category harvested from material master data`
          });
          createdCategories++;
        }

        // 2. Harvest subcategories under this type
        const subcategories = await Material.distinct('subcategory', {
          type: typeName,
          status: { $ne: 'Deleted' }
        });
        const subList = Array.from(new Set(subcategories.map(s => (s || '').trim()).filter(Boolean)));

        for (const subName of subList) {
          let subDoc = await MaterialClassification.findOne({ name: subName, parentId: catDoc._id, status: { $ne: 'Deleted' } });
          if (!subDoc) {
            subDoc = await MaterialClassification.create({
              name: subName,
              code: `${catDoc.code || 'MAT'}-${subName.slice(0, 3).toUpperCase()}`,
              parentId: catDoc._id,
              status: 'Active',
              description: `${subName} sub-category under ${typeName}`
            });
            createdSubcategories++;
          }

          // Link materials having (type, subcategory)
          const updateRes = await Material.updateMany(
            { type: typeName, subcategory: subName, categoryId: null, status: { $ne: 'Deleted' } },
            { $set: { categoryId: subDoc._id } }
          );
          linkedItems += (updateRes.modifiedCount || 0);
        }

        // Link materials with no subcategory directly to root category
        const updateRootRes = await Material.updateMany(
          { type: typeName, $or: [{ subcategory: null }, { subcategory: '' }], categoryId: null, status: { $ne: 'Deleted' } },
          { $set: { categoryId: catDoc._id } }
        );
        linkedItems += (updateRootRes.modifiedCount || 0);
      }
    }

    return { createdCategories, createdSubcategories, linkedItems };
  } finally {
    syncLocks.delete(lockKey);
  }
};

// @desc    Get all classifications with usage count, recursive descendant counts, and depth
// @route   GET /api/classifications
// @access  Private
exports.getClassifications = async (req, res, next) => {
  try {
    const { type, parentId } = req.query;
    const isVendor = type === 'vendor' || type === 'Vendor' || type === 'vendors';
    const Model = getModel(type);

    // Auto-sync from master data if database has no active classification entries
    const existingCount = await Model.countDocuments({ status: { $ne: 'Deleted' } });
    if (existingCount === 0) {
      await syncMasterData(type);
    }
    
    const query = { status: { $ne: 'Deleted' } };
    if (parentId !== undefined) {
      query.parentId = parentId === 'null' || parentId === '' ? null : parentId;
    }

    const [items, usageCounts] = await Promise.all([
      Model.find(query).populate('parentId', 'name code').sort({ name: 1 }).lean(),
      isVendor
        ? Vendor.aggregate([
            { $match: { status: { $ne: 'Deleted' }, categoryId: { $ne: null } } },
            { $group: { _id: '$categoryId', count: { $sum: 1 } } }
          ])
        : Material.aggregate([
            { $match: { status: { $ne: 'Deleted' }, categoryId: { $ne: null } } },
            { $group: { _id: '$categoryId', count: { $sum: 1 } } }
          ])
    ]);

    const countMap = new Map();
    usageCounts.forEach(c => countMap.set(String(c._id), c.count));

    // Also fetch all active nodes to calculate accurate depth & totalItemCount across all levels
    const allActiveNodes = await Model.find({ status: { $ne: 'Deleted' } }).select('_id parentId').lean();
    const parentMap = new Map();
    const childrenMap = new Map();

    allActiveNodes.forEach(node => {
      const pId = node.parentId ? String(node.parentId) : null;
      parentMap.set(String(node._id), pId);
      if (!childrenMap.has(pId)) childrenMap.set(pId, []);
      childrenMap.get(pId).push(String(node._id));
    });

    const depthMemo = new Map();
    const getDepth = (id) => {
      if (depthMemo.has(id)) return depthMemo.get(id);
      const pId = parentMap.get(id);
      const d = pId ? getDepth(pId) + 1 : 0;
      depthMemo.set(id, d);
      return d;
    };

    const totalCountMemo = new Map();
    const getTotalCount = (id) => {
      if (totalCountMemo.has(id)) return totalCountMemo.get(id);
      const direct = countMap.get(id) || 0;
      const kids = childrenMap.get(id) || [];
      const kidsTotal = kids.reduce((sum, kidId) => sum + getTotalCount(kidId), 0);
      const total = direct + kidsTotal;
      totalCountMemo.set(id, total);
      return total;
    };

    const enrichedItems = items.map(item => {
      const idStr = String(item._id);
      return {
        ...item,
        itemCount: countMap.get(idStr) || 0,
        totalItemCount: getTotalCount(idStr),
        depth: getDepth(idStr)
      };
    });

    res.status(200).json({ success: true, count: enrichedItems.length, data: enrichedItems });
  } catch (err) {
    next(err);
  }
};

// @desc    Get single classification
// @route   GET /api/classifications/:id
// @access  Private
exports.getClassification = async (req, res, next) => {
  try {
    const { type } = req.query;
    const Model = getModel(type);

    const item = await Model.findById(req.params.id).populate('parentId', 'name code').lean();
    if (!item || item.status === 'Deleted') {
      return res.status(404).json({ success: false, error: 'Classification not found' });
    }
    res.status(200).json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
};

// @desc    Create classification
// @route   POST /api/classifications
// @access  Private (Editor, Admin)
exports.createClassification = async (req, res, next) => {
  try {
    const { type, name, code, parentId, description } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Classification name is required' });
    }

    const Model = getModel(type);

    if (parentId) {
      const parentDoc = await Model.findById(parentId);
      if (!parentDoc || parentDoc.status === 'Deleted') {
        return res.status(400).json({ success: false, error: 'Selected parent category does not exist.' });
      }
    }

    const item = await Model.create({
      name: name.trim(),
      code: code ? code.trim().toUpperCase() : undefined,
      parentId: parentId || null,
      description: description ? description.trim() : '',
      status: 'Active',
    });

    res.status(201).json({ success: true, message: 'Classification created successfully', data: item });
  } catch (err) {
    next(err);
  }
};

// @desc    Update classification with circular hierarchy protection
// @route   PUT /api/classifications/:id
// @access  Private (Editor, Admin)
exports.updateClassification = async (req, res, next) => {
  try {
    const { type, name, code, parentId, description, status } = req.body;
    const Model = getModel(type);

    const item = await Model.findById(req.params.id);
    if (!item || item.status === 'Deleted') {
      return res.status(404).json({ success: false, error: 'Classification not found' });
    }

    // Circular Dependency Guard
    if (parentId) {
      if (String(parentId) === String(req.params.id)) {
        return res.status(400).json({ success: false, error: 'A category cannot be set as its own parent.' });
      }
      const descendant = await isDescendant(Model, req.params.id, parentId);
      if (descendant) {
        return res.status(400).json({ success: false, error: 'Cannot set parent to a child sub-category (circular hierarchy).' });
      }
    }

    if (name) item.name = name.trim();
    if (code !== undefined) item.code = code ? code.trim().toUpperCase() : undefined;
    if (parentId !== undefined) item.parentId = parentId || null;
    if (description !== undefined) item.description = description ? description.trim() : '';
    if (status) item.status = status;

    await item.save();
    res.status(200).json({ success: true, message: 'Classification updated successfully', data: item });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete classification with child & reference safety guards
// @route   DELETE /api/classifications/:id
// @access  Private (Admin)
exports.deleteClassification = async (req, res, next) => {
  try {
    const { type } = req.query;
    const isVendor = type === 'vendor' || type === 'Vendor' || type === 'vendors';
    const Model = getModel(type);

    const item = await Model.findById(req.params.id);
    if (!item || item.status === 'Deleted') {
      return res.status(404).json({ success: false, error: 'Classification not found' });
    }

    // 1. Check if child sub-categories exist
    const childCount = await Model.countDocuments({ parentId: req.params.id, status: { $ne: 'Deleted' } });
    if (childCount > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete: this category contains ${childCount} child sub-categor${childCount === 1 ? 'y' : 'ies'}. Delete or reassign children first.`
      });
    }

    // 2. Check if active master records are assigned to this category
    if (isVendor) {
      const assignedVendors = await Vendor.countDocuments({ categoryId: req.params.id, status: { $ne: 'Deleted' } });
      if (assignedVendors > 0) {
        return res.status(400).json({
          success: false,
          error: `Cannot delete: ${assignedVendors} vendor${assignedVendors === 1 ? ' is' : 's are'} currently assigned to this classification.`
        });
      }
    } else {
      const assignedMaterials = await Material.countDocuments({ categoryId: req.params.id, status: { $ne: 'Deleted' } });
      if (assignedMaterials > 0) {
        return res.status(400).json({
          success: false,
          error: `Cannot delete: ${assignedMaterials} material${assignedMaterials === 1 ? ' is' : 's are'} currently assigned to this classification.`
        });
      }
    }

    // Soft delete
    item.status = 'Deleted';
    await item.save();

    res.status(200).json({ success: true, message: 'Classification deleted successfully' });
  } catch (err) {
    next(err);
  }
};

// @desc    Get all materials or vendors linked to a classification
// @route   GET /api/classifications/:id/items
// @access  Private
exports.getClassificationItems = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { type, search, includeDescendants } = req.query;
    const ClassModel = getModel(type);
    const ItemModel = getItemModel(type);
    const isVendor = type === 'vendor' || type === 'Vendor' || type === 'vendors';

    const category = await ClassModel.findById(id).populate('parentId', 'name code').lean();
    if (!category || category.status === 'Deleted') {
      return res.status(404).json({ success: false, error: 'Classification not found' });
    }

    const targetCategoryIds = includeDescendants === 'true'
      ? await getAllDescendantIds(ClassModel, id)
      : [id];

    const query = {
      status: { $ne: 'Deleted' },
      categoryId: { $in: targetCategoryIds }
    };

    if (search && search.trim()) {
      const safe = escapeRegex(search.trim());
      query.$or = isVendor
        ? [
            { name: { $regex: safe, $options: 'i' } },
            { vendorId: { $regex: safe, $options: 'i' } },
            { company: { $regex: safe, $options: 'i' } },
            { email: { $regex: safe, $options: 'i' } },
            { contact: { $regex: safe, $options: 'i' } }
          ]
        : [
            { name: { $regex: safe, $options: 'i' } },
            { code: { $regex: safe, $options: 'i' } },
            { subcategory: { $regex: safe, $options: 'i' } }
          ];
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = parseInt(req.query.limit) || 50;

    const selectFields = isVendor
      ? 'vendorId name company email phone contact status categoryId createdAt'
      : 'code name unit uom basePrice price type subcategory status categoryId createdAt';

    const [items, total] = await Promise.all([
      ItemModel.find(query)
        .select(selectFields)
        .populate('categoryId', 'name code')
        .sort({ name: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      ItemModel.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      category,
      count: items.length,
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
      data: items
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get unclassified or available items for linking to classification
// @route   GET /api/classifications/:id/available-items
// @access  Private
exports.getAvailableItems = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { type, search, onlyUnassigned } = req.query;
    const ItemModel = getItemModel(type);
    const isVendor = type === 'vendor' || type === 'Vendor' || type === 'vendors';

    const query = { status: { $ne: 'Deleted' } };
    if (onlyUnassigned === 'true') {
      query.categoryId = null;
    } else {
      query.categoryId = { $ne: id };
    }

    if (search && search.trim()) {
      const safe = escapeRegex(search.trim());
      query.$or = isVendor
        ? [
            { name: { $regex: safe, $options: 'i' } },
            { vendorId: { $regex: safe, $options: 'i' } },
            { company: { $regex: safe, $options: 'i' } }
          ]
        : [
            { name: { $regex: safe, $options: 'i' } },
            { code: { $regex: safe, $options: 'i' } }
          ];
    }

    const limit = Math.min(100, parseInt(req.query.limit) || 40);
    const selectFields = isVendor
      ? 'vendorId name company email status categoryId'
      : 'code name unit uom categoryId type subcategory status';

    const items = await ItemModel.find(query)
      .select(selectFields)
      .populate('categoryId', 'name code')
      .sort({ name: 1 })
      .limit(limit)
      .lean();

    res.status(200).json({ success: true, count: items.length, data: items });
  } catch (err) {
    next(err);
  }
};

// @desc    Bulk link materials or vendors to a classification
// @route   POST /api/classifications/:id/link-items
// @access  Private (Admin, Editor, Inventory Manager)
exports.linkItemsToClassification = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { type, itemIds } = req.body;
    if (!Array.isArray(itemIds) || !itemIds.length) {
      return res.status(400).json({ success: false, error: 'itemIds array is required' });
    }

    const ClassModel = getModel(type);
    const category = await ClassModel.findById(id).lean();
    if (!category || category.status === 'Deleted') {
      return res.status(404).json({ success: false, error: 'Classification not found' });
    }

    const ItemModel = getItemModel(type);
    const result = await ItemModel.updateMany(
      { _id: { $in: itemIds }, status: { $ne: 'Deleted' } },
      { $set: { categoryId: id } }
    );

    res.status(200).json({
      success: true,
      message: `Successfully linked ${result.modifiedCount} item(s) to "${category.name}"`,
      linkedCount: result.modifiedCount
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Bulk unlink materials or vendors from a classification
// @route   POST /api/classifications/:id/unlink-items
// @access  Private (Admin, Editor, Inventory Manager)
exports.unlinkItemsFromClassification = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { type, itemIds } = req.body;
    if (!Array.isArray(itemIds) || !itemIds.length) {
      return res.status(400).json({ success: false, error: 'itemIds array is required' });
    }

    const ItemModel = getItemModel(type);
    const result = await ItemModel.updateMany(
      { _id: { $in: itemIds }, categoryId: id },
      { $set: { categoryId: null } }
    );

    res.status(200).json({
      success: true,
      message: `Successfully unlinked ${result.modifiedCount} item(s)`,
      unlinkedCount: result.modifiedCount
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Reassign all materials or vendors from one classification to another
// @route   POST /api/classifications/:id/reassign-items
// @access  Private (Admin, Editor, Inventory Manager)
exports.reassignClassificationItems = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { type, targetCategoryId } = req.body;
    if (!targetCategoryId) {
      return res.status(400).json({ success: false, error: 'targetCategoryId is required' });
    }
    if (String(id) === String(targetCategoryId)) {
      return res.status(400).json({ success: false, error: 'Source and target categories must be different' });
    }

    const ClassModel = getModel(type);
    const targetCategory = await ClassModel.findById(targetCategoryId).lean();
    if (!targetCategory || targetCategory.status === 'Deleted') {
      return res.status(400).json({ success: false, error: 'Target classification not found' });
    }

    const ItemModel = getItemModel(type);
    const result = await ItemModel.updateMany(
      { categoryId: id, status: { $ne: 'Deleted' } },
      { $set: { categoryId: targetCategoryId } }
    );

    res.status(200).json({
      success: true,
      message: `Successfully reassigned ${result.modifiedCount} item(s) to "${targetCategory.name}"`,
      reassignedCount: result.modifiedCount
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Synchronize and harvest classifications from Material and Vendor master data
// @route   POST /api/classifications/sync-master-data
// @access  Private (Admin, Editor, Inventory Manager)
exports.syncMasterDataEndpoint = async (req, res, next) => {
  try {
    const { type } = req.body || req.query || {};
    const result = await syncMasterData(type);
    res.status(200).json({
      success: true,
      message: `Successfully synced ${result.createdCategories} categories, ${result.createdSubcategories} sub-categories, and linked ${result.linkedItems} items.`,
      data: result
    });
  } catch (err) {
    next(err);
  }
};

exports.syncMasterData = syncMasterData;
