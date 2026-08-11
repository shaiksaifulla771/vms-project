const Site = require('../models/Site');
const Warehouse = require('../models/Warehouse');

/**
 * Enterprise Location Enforcement Middleware
 * Ensures inactive Sites & Warehouses cannot be selected for ANY new operational transactions.
 */
const enforceActiveLocation = async (req, res, next) => {
  try {
    const { siteId, warehouseId, fromWarehouseId, toWarehouseId } = req.body || {};

    const sitesToCheck = [siteId].filter(Boolean);
    const warehousesToCheck = [warehouseId, fromWarehouseId, toWarehouseId].filter(Boolean);

    // Check Sites
    for (const id of sitesToCheck) {
      const site = await Site.findById(id);
      if (site && site.status === 'Inactive') {
        return res.status(400).json({
          systemNotice: 'Site Inactive',
          message: `Site Inactive: '${site.name}' is currently inactive and cannot be used for new operational activities. Historical records remain available for reference. Please contact an administrator if reactivation is required.`,
          code: 'SITE_INACTIVE'
        });
      }
    }

    // Check Warehouses
    for (const id of warehousesToCheck) {
      const warehouse = await Warehouse.findById(id).populate('siteId');
      if (warehouse && (warehouse.status === 'Inactive' || !warehouse.isActive)) {
        return res.status(400).json({
          systemNotice: 'Warehouse Inactive',
          message: `Warehouse Inactive: '${warehouse.name}' has been temporarily deactivated by an administrator. New operations and assignments are currently unavailable. Historical records remain available for reference.`,
          code: 'WAREHOUSE_INACTIVE'
        });
      }

      if (warehouse && warehouse.siteId && warehouse.siteId.status === 'Inactive') {
        return res.status(400).json({
          systemNotice: 'Site Inactive',
          message: `Site Inactive: Parent site '${warehouse.siteId.name}' is inactive. Operations on child warehouse '${warehouse.name}' are disabled.`,
          code: 'PARENT_SITE_INACTIVE'
        });
      }
    }

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { enforceActiveLocation };
