const mongoose = require('mongoose');

exports.validateMRPRun = (req, res, next) => {
  const { productId, targetQty, siteId, warehouseId, warehouseScope } = req.body;
  const errors = [];

  if (!productId) {
    errors.push('Product ID (productId) is required for MRP calculation.');
  } else if (!mongoose.Types.ObjectId.isValid(productId)) {
    errors.push('Invalid Product ID format.');
  }

  const qty = Number(targetQty);
  if (isNaN(qty) || qty <= 0) {
    errors.push('Target quantity (targetQty) must be a positive number greater than 0.');
  }

  if (!warehouseId && !siteId) {
    errors.push('At least a Site (siteId) or Warehouse (warehouseId) must be specified.');
  }

  if (errors.length > 0) {
    return res.status(400).json({ success: false, error: errors.join(' ') });
  }

  next();
};

exports.validateProductionPlanCreate = (req, res, next) => {
  const { productId, bomId, totalQuantity, quantity, totalPlans, warehouseId } = req.body;
  const errors = [];

  if (!productId && !req.body.product) {
    errors.push('Product reference is required.');
  }

  const qty = Number(totalQuantity || quantity || totalPlans);
  if (isNaN(qty) || qty <= 0) {
    errors.push('Total plan quantity must be a positive number.');
  }

  if (!warehouseId && !req.body.warehouse) {
    errors.push('Warehouse reference is required.');
  }

  if (errors.length > 0) {
    return res.status(400).json({ success: false, error: errors.join(' ') });
  }

  next();
};
