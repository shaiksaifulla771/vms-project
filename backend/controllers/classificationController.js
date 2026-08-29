const MaterialClassification = require('../models/MaterialClassification');
const VendorClassification = require('../models/VendorClassification');

// Helper to pick model
const getModel = (type) => {
  if (type === 'vendor' || type === 'Vendor' || type === 'vendors') {
    return VendorClassification;
  }
  return MaterialClassification;
};

// @desc    Get all classifications (optionally by type or hierarchical)
// @route   GET /api/classifications
// @access  Private
exports.getClassifications = async (req, res, next) => {
  try {
    const { type, parentId } = req.query;
    const Model = getModel(type);
    
    const query = { status: { $ne: 'Deleted' } };
    if (parentId !== undefined) {
      query.parentId = parentId === 'null' || parentId === '' ? null : parentId;
    }

    const items = await Model.find(query).populate('parentId', 'name code').sort({ name: 1 }).lean();
    res.status(200).json({ success: true, count: items.length, data: items });
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
    const item = await Model.create({
      name: name.trim(),
      code: code ? code.trim().toUpperCase() : undefined,
      parentId: parentId || null,
      description: description || '',
      status: 'Active',
    });

    res.status(201).json({ success: true, message: 'Classification created successfully', data: item });
  } catch (err) {
    next(err);
  }
};

// @desc    Update classification
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

    if (name) item.name = name.trim();
    if (code !== undefined) item.code = code ? code.trim().toUpperCase() : undefined;
    if (parentId !== undefined) item.parentId = parentId || null;
    if (description !== undefined) item.description = description;
    if (status) item.status = status;

    await item.save();
    res.status(200).json({ success: true, message: 'Classification updated successfully', data: item });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete classification (soft delete)
// @route   DELETE /api/classifications/:id
// @access  Private (Admin)
exports.deleteClassification = async (req, res, next) => {
  try {
    const { type } = req.query;
    const Model = getModel(type);

    const item = await Model.findById(req.params.id);
    if (!item || item.status === 'Deleted') {
      return res.status(404).json({ success: false, error: 'Classification not found' });
    }

    // Check if children exist
    const childCount = await Model.countDocuments({ parentId: req.params.id, status: { $ne: 'Deleted' } });
    if (childCount > 0) {
      return res.status(400).json({ success: false, error: 'Cannot delete: this classification has child sub-categories.' });
    }

    item.status = 'Deleted';
    await item.save();

    res.status(200).json({ success: true, message: 'Classification deleted successfully' });
  } catch (err) {
    next(err);
  }
};
