const WarehouseMaterial = require('../models/WarehouseMaterial');
const Material = require('../models/Material');
const Warehouse = require('../models/Warehouse');
const asyncHandler = require('../middleware/asyncHandler');
const authz = require('../utils/authz');
const scopeResolver = require('../utils/scopeResolver');

/**
 * Validates if the user has active scope assignments for the target warehouse.
 * Bypasses for global administrators.
 */
async function checkWarehouseScope(user, targetWarehouseId) {
  if (!user || !targetWarehouseId) return false;
  if (authz.isGlobalAdmin(user)) return true;
  const { warehouseIds } = await scopeResolver.getUserAssignedScopes(user);
  return warehouseIds.some(id => String(id) === String(targetWarehouseId));
}

// @desc    Get materials assigned to warehouses
// @route   GET /api/warehouse-materials
// @access  Private
exports.getAssignedMaterials = asyncHandler(async (req, res) => {
  const query = {};
  if (req.query.warehouseId) query.warehouseId = req.query.warehouseId;
  if (req.query.siteId) query.siteId = req.query.siteId;
  if (req.query.materialId) query.materialId = req.query.materialId;
  if (req.query.status) query.status = req.query.status;

  const assignments = await WarehouseMaterial.find(query)
    .populate('materialId', 'name code unit type category description')
    .populate('siteId', 'name code')
    .populate('warehouseId', 'name code type')
    .populate('assignedBy', 'username email')
    .sort({ assignedAt: -1 });

  res.status(200).json({ success: true, count: assignments.length, data: assignments });
});

// @desc    Assign material to site / warehouse
// @route   POST /api/warehouse-materials/assign
// @access  Private
exports.assignMaterialToWarehouse = asyncHandler(async (req, res) => {
  const { materialId, siteId, warehouseId, minStock, maxStock, reorderPoint } = req.body;

  if (!materialId || !warehouseId) {
    return res.status(400).json({ success: false, error: 'Please provide materialId and warehouseId' });
  }

  const material = await Material.findById(materialId);
  if (!material) {
    return res.status(404).json({ success: false, error: 'Material not found' });
  }

  const warehouse = await Warehouse.findById(warehouseId);
  if (!warehouse) {
    return res.status(404).json({ success: false, error: 'Warehouse not found' });
  }

  // 3-Level Access Scope Governance Enforcement
  if (!(await checkWarehouseScope(req.user, warehouse._id))) {
    return res.status(403).json({ success: false, error: 'Access denied. You do not have an active assignment to this warehouse.' });
  }

  const resolvedSiteId = siteId || warehouse.siteId;

  // Check if assignment already exists
  let assignment = await WarehouseMaterial.findOne({ materialId, warehouseId });
  if (assignment) {
    assignment.status = 'Active';
    if (minStock !== undefined) assignment.minStock = minStock;
    if (maxStock !== undefined) assignment.maxStock = maxStock;
    if (reorderPoint !== undefined) assignment.reorderPoint = reorderPoint;
    await assignment.save();
    return res.status(200).json({ success: true, message: 'Assignment updated', data: assignment });
  }

  assignment = await WarehouseMaterial.create({
    materialId,
    siteId: resolvedSiteId,
    warehouseId,
    minStock: minStock || 0,
    maxStock: maxStock || 0,
    reorderPoint: reorderPoint || 0,
    assignedBy: req.user ? req.user.id : null,
  });

  res.status(201).json({ success: true, message: 'Material assigned to warehouse successfully', data: assignment });
});

// @desc    Update warehouse material settings
// @route   PUT /api/warehouse-materials/:id
// @access  Private
exports.updateAssignedMaterial = asyncHandler(async (req, res) => {
  let assignment = await WarehouseMaterial.findById(req.params.id);
  if (!assignment) {
    return res.status(404).json({ success: false, error: 'Warehouse material assignment not found' });
  }

  // 3-Level Access Scope Governance Enforcement
  if (!(await checkWarehouseScope(req.user, assignment.warehouseId))) {
    return res.status(403).json({ success: false, error: 'Access denied. You do not have an active assignment to this warehouse.' });
  }

  const { minStock, maxStock, reorderPoint, status } = req.body;
  if (minStock !== undefined) assignment.minStock = minStock;
  if (maxStock !== undefined) assignment.maxStock = maxStock;
  if (reorderPoint !== undefined) assignment.reorderPoint = reorderPoint;
  if (status) assignment.status = status;

  await assignment.save();
  res.status(200).json({ success: true, data: assignment });
});

// @desc    Unassign material from warehouse (Soft Deactivation)
// @route   DELETE /api/warehouse-materials/:id
// @access  Private
exports.unassignMaterialFromWarehouse = asyncHandler(async (req, res) => {
  const assignment = await WarehouseMaterial.findById(req.params.id);
  if (!assignment) {
    return res.status(404).json({ success: false, error: 'Warehouse material assignment not found' });
  }

  // 3-Level Access Scope Governance Enforcement
  if (!(await checkWarehouseScope(req.user, assignment.warehouseId))) {
    return res.status(403).json({ success: false, error: 'Access denied. You do not have an active assignment to this warehouse.' });
  }

  if (assignment.status === 'Inactive') {
    return res.status(400).json({ success: false, error: 'Material is already inactive in this warehouse' });
  }

  assignment.status = 'Inactive';
  assignment.deactivatedAt = Date.now();
  assignment.deactivatedBy = req.user ? req.user.id : null;
  assignment.deactivationReason = req.body.reason || 'Unassigned via API';
  await assignment.save();

  res.status(200).json({ success: true, message: 'Material unassigned from warehouse successfully' });
});
