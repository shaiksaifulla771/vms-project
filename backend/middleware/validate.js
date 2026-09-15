const mongoose = require('mongoose');
const Vendor = require('../models/Vendor');
const Material = require('../models/Material');
const Warehouse = require('../models/Warehouse');
const BOM = require('../models/BOM');

// Check if string is valid Mongoose ObjectId
exports.isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

// Validate body fields for common requirements
exports.validatePayload = (rules) => {
  return (req, res, next) => {
    const errors = [];

    for (const rule of rules) {
      const { field, required, type, min, enum: enumValues, isObjectId } = rule;
      const value = req.body[field];

      if (required && (value === undefined || value === null || value === '')) {
        errors.push(`Field '${field}' is required.`);
        continue;
      }

      if (value !== undefined && value !== null && value !== '') {
        if (isObjectId && !exports.isValidObjectId(value)) {
          errors.push(`Field '${field}' must be a valid ObjectId string.`);
        }

        if (type === 'number') {
          const num = Number(value);
          if (isNaN(num)) {
            errors.push(`Field '${field}' must be a number.`);
          } else if (min !== undefined && num < min) {
            errors.push(`Field '${field}' cannot be less than ${min}.`);
          }
        }

        if (type === 'string' && typeof value !== 'string') {
          errors.push(`Field '${field}' must be a string.`);
        }

        if (enumValues && Array.isArray(enumValues) && !enumValues.includes(value)) {
          errors.push(`Field '${field}' must be one of: ${enumValues.join(', ')}.`);
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors
      });
    }

    next();
  };
};

// Foreign Key Existence Checks
exports.verifyVendorExists = async (req, res, next) => {
  const vendorId = req.body.vendorId || req.body.vendor;
  if (!vendorId) return next();

  if (!exports.isValidObjectId(vendorId)) {
    return res.status(400).json({ success: false, error: `Invalid vendorId format: ${vendorId}` });
  }

  const vendor = await Vendor.findById(vendorId);
  if (!vendor) {
    return res.status(404).json({ success: false, error: `Referenced vendor ${vendorId} does not exist in database.` });
  }

  req.referencedVendor = vendor;
  next();
};

exports.verifyMaterialExists = async (req, res, next) => {
  const materialId = req.body.materialId || req.body.material;
  if (!materialId) return next();

  if (!exports.isValidObjectId(materialId)) {
    return res.status(400).json({ success: false, error: `Invalid materialId format: ${materialId}` });
  }

  const material = await Material.findById(materialId);
  if (!material) {
    return res.status(404).json({ success: false, error: `Referenced material ${materialId} does not exist in database.` });
  }

  req.referencedMaterial = material;
  next();
};

exports.verifyWarehouseExists = async (req, res, next) => {
  const warehouseId = req.body.warehouseId || req.body.warehouse;
  if (!warehouseId) return next();

  if (!exports.isValidObjectId(warehouseId)) {
    return res.status(400).json({ success: false, error: `Invalid warehouseId format: ${warehouseId}` });
  }

  const warehouse = await Warehouse.findById(warehouseId);
  if (!warehouse) {
    return res.status(404).json({ success: false, error: `Referenced warehouse ${warehouseId} does not exist in database.` });
  }

  req.referencedWarehouse = warehouse;
  next();
};
