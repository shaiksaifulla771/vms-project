const Warehouse = require('../models/Warehouse');

// @desc    Get all warehouses
// @route   GET /api/warehouses
// @access  Private
exports.getWarehouses = async (req, res, next) => {
  try {
    const warehouses = await Warehouse.find({ isActive: true });
    res.status(200).json({ success: true, data: warehouses });
  } catch(e) { next(e); }
};

// @desc    Create a new warehouse
// @route   POST /api/warehouses
// @access  Private/Admin
exports.createWarehouse = async (req, res, next) => {
  try {
    const warehouse = await Warehouse.create(req.body);
    res.status(201).json({ success: true, data: warehouse });
  } catch(e) { next(e); }
};

// @desc    Get warehouse by ID
// @route   GET /api/warehouses/:id
// @access  Private
exports.getWarehouse = async (req, res, next) => {
  try {
    const warehouse = await Warehouse.findById(req.params.id);
    if (!warehouse) {
      return res.status(404).json({ success: false, error: 'Warehouse not found' });
    }
    res.status(200).json({ success: true, data: warehouse });
  } catch(e) { next(e); }
};

// @desc    Update warehouse
// @route   PUT /api/warehouses/:id
// @access  Private/Admin
exports.updateWarehouse = async (req, res, next) => {
  try {
    let warehouse = await Warehouse.findById(req.params.id);
    if (!warehouse) {
      return res.status(404).json({ success: false, error: 'Warehouse not found' });
    }
    warehouse = await Warehouse.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    res.status(200).json({ success: true, data: warehouse });
  } catch(e) { next(e); }
};
