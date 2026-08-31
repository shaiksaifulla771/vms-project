const MaterialClassification = require('../models/MaterialClassification');
const VendorClassification = require('../models/VendorClassification');
const Material = require('../models/Material');
const Vendor = require('../models/Vendor');

// Helper to pick model
const getModel = (type) => {
  if (type === 'vendor' || type === 'Vendor' || type === 'vendors') {
    return VendorClassification;
  }
  return MaterialClassification;
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

// @desc    Get all classifications with usage count
// @route   GET /api/classifications
// @access  Private
exports.getClassifications = async (req, res, next) => {
  try {
    const { type, parentId } = req.query;
    const isVendor = type === 'vendor' || type === 'Vendor' || type === 'vendors';
    const Model = getModel(type);
    
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

    const enrichedItems = items.map(item => ({
      ...item,
      itemCount: countMap.get(String(item._id)) || 0
    }));

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
